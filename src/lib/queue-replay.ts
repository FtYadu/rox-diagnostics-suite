import type { QueuedWrite } from "./offline-queue";

/**
 * Ordered replay of the offline write queue with exponential backoff.
 * The logic is pure so ordering, retries and backoff can be unit-tested
 * without IndexedDB or a network.
 */

export type SendResult = "ok" | "retry" | "drop";

export type ReplayOptions = {
  /** Attempts per write before it is given up on. */
  maxAttempts?: number;
  /** First backoff step in milliseconds; doubles per attempt. */
  baseDelayMs?: number;
  /** Upper bound for a single backoff step. */
  maxDelayMs?: number;
};

export type ReplayReport = {
  /** Ids that reached the server, in the order they were sent. */
  synced: string[];
  /** Ids that still need another pass. */
  pending: string[];
  /** Ids abandoned after `maxAttempts`. */
  dropped: string[];
  attempts: number;
};

const DEFAULTS = { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 30_000 };

/** Backoff for the nth attempt (1-based), doubling and capped. */
export const backoffDelay = (attempt: number, options: ReplayOptions = {}): number => {
  const base = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const max = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
};

export const replayQueue = async (
  writes: QueuedWrite[],
  send: (write: QueuedWrite) => Promise<SendResult>,
  options: ReplayOptions & { sleep?: (ms: number) => Promise<void> } = {},
): Promise<ReplayReport> => {
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // Oldest first: a job must exist before its events and attachments land.
  const ordered = [...writes].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const synced: string[] = [];
  const pending: string[] = [];
  const dropped: string[] = [];
  let attempts = 0;

  for (const write of ordered) {
    let outcome: SendResult = "retry";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts += 1;
      outcome = await send(write);
      if (outcome !== "retry") break;
      if (attempt < maxAttempts) await sleep(backoffDelay(attempt, options));
    }

    if (outcome === "ok") synced.push(write.id);
    else if (outcome === "drop") dropped.push(write.id);
    else pending.push(write.id);
  }

  return { synced, pending, dropped, attempts };
};
