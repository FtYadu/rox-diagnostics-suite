import type { Job, JobEvent } from "@/features/jobs/types";

/**
 * Offline write queue. Jobs and job events created without a network are stored
 * in IndexedDB and replayed once the browser reports it is online again.
 * The reducer is pure so it can be unit-tested without IndexedDB.
 */
export type QueuedWrite =
  | { id: string; kind: "job"; at: string; job: Job }
  | { id: string; kind: "job-event"; at: string; jobId: string; event: JobEvent };

export type QueueState = {
  online: boolean;
  pending: QueuedWrite[];
  syncing: boolean;
  lastSyncedAt: string | null;
};

export type QueueAction =
  | { type: "online" }
  | { type: "offline" }
  | { type: "enqueue"; write: QueuedWrite }
  | { type: "sync-start" }
  | { type: "sync-settled"; syncedIds: string[]; at: string };

export const initialQueueState: QueueState = {
  online: true,
  pending: [],
  syncing: false,
  lastSyncedAt: null,
};

export const queueReducer = (state: QueueState, action: QueueAction): QueueState => {
  switch (action.type) {
    case "online":
      return { ...state, online: true };
    case "offline":
      return { ...state, online: false, syncing: false };
    case "enqueue": {
      // Later writes for the same job supersede earlier ones.
      const pending = state.pending.filter(
        (entry) =>
          !(
            entry.kind === "job" &&
            action.write.kind === "job" &&
            entry.job.id === action.write.job.id
          ) && entry.id !== action.write.id,
      );
      return { ...state, pending: [...pending, action.write] };
    }
    case "sync-start":
      return state.online && state.pending.length > 0 ? { ...state, syncing: true } : state;
    case "sync-settled":
      return {
        ...state,
        syncing: false,
        pending: state.pending.filter((entry) => !action.syncedIds.includes(entry.id)),
        lastSyncedAt: action.syncedIds.length > 0 ? action.at : state.lastSyncedAt,
      };
    default:
      return state;
  }
};

/* ------------------------------------------------------------ IndexedDB store */

const DB_NAME = "rox-offline";
const STORE = "writes";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
    });
  } catch {
    return null;
  }
};

export const persistWrite = (write: QueuedWrite): Promise<unknown> =>
  withStore("readwrite", (store) => store.put(write) as unknown as IDBRequest<unknown>);

export const loadWrites = async (): Promise<QueuedWrite[]> =>
  (await withStore<QueuedWrite[]>("readonly", (store) => store.getAll())) ?? [];

export const dropWrites = async (ids: string[]): Promise<void> => {
  for (const id of ids) {
    await withStore("readwrite", (store) => store.delete(id) as unknown as IDBRequest<unknown>);
  }
};
