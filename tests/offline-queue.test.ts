import { describe, expect, it } from "vitest";
import type { Job, JobEvent } from "@/features/jobs/types";
import {
  initialQueueState,
  queueReducer,
  type QueuedWrite,
  type QueueState,
} from "@/lib/offline-queue";

const job = (id: string): Job => ({
  id,
  title: "Health scan",
  kind: "health-scan",
  vin: "LRX01TEST00000001",
  technician: "Tester",
  createdAt: "2026-09-03T10:00:00.000Z",
  status: "in-progress",
  summary: "",
  events: [],
});

const event = (id: string): JobEvent => ({
  id,
  kind: "scan",
  title: "Scan started",
  detail: "",
  status: "info",
  at: "2026-09-03T10:00:01.000Z",
});

const jobWrite = (id: string, jobIdValue: string): QueuedWrite => ({
  id,
  kind: "job",
  at: "2026-09-03T10:00:00.000Z",
  job: job(jobIdValue),
});

describe("queueReducer", () => {
  it("queues writes while offline", () => {
    let state: QueueState = queueReducer(initialQueueState, { type: "offline" });
    state = queueReducer(state, { type: "enqueue", write: jobWrite("w1", "job-1") });
    state = queueReducer(state, {
      type: "enqueue",
      write: { id: "w2", kind: "job-event", at: "x", jobId: "job-1", event: event("e1") },
    });
    expect(state.online).toBe(false);
    expect(state.pending).toHaveLength(2);
  });

  it("does not sync while offline", () => {
    const offline = queueReducer(queueReducer(initialQueueState, { type: "offline" }), {
      type: "enqueue",
      write: jobWrite("w1", "job-1"),
    });
    expect(queueReducer(offline, { type: "sync-start" }).syncing).toBe(false);
  });

  it("supersedes an earlier write for the same job", () => {
    let state = queueReducer(initialQueueState, {
      type: "enqueue",
      write: jobWrite("w1", "job-1"),
    });
    state = queueReducer(state, { type: "enqueue", write: jobWrite("w2", "job-1") });
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.id).toBe("w2");
  });

  it("drops only synced writes and records the sync time", () => {
    let state = queueReducer(initialQueueState, {
      type: "enqueue",
      write: jobWrite("w1", "job-1"),
    });
    state = queueReducer(state, { type: "enqueue", write: jobWrite("w2", "job-2") });
    state = queueReducer(state, { type: "sync-start" });
    expect(state.syncing).toBe(true);
    state = queueReducer(state, {
      type: "sync-settled",
      syncedIds: ["w1"],
      at: "2026-09-03T10:05:00.000Z",
    });
    expect(state.syncing).toBe(false);
    expect(state.pending.map((entry) => entry.id)).toEqual(["w2"]);
    expect(state.lastSyncedAt).toBe("2026-09-03T10:05:00.000Z");
  });
});
