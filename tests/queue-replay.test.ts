import { describe, expect, it, vi } from "vitest";
import type { Job } from "@/features/jobs/types";
import type { QueuedWrite } from "@/lib/offline-queue";
import { backoffDelay, replayQueue, type SendResult } from "@/lib/queue-replay";

const job = (id: string): Job => ({
  id,
  title: "Health scan",
  kind: "health-scan",
  vin: "LRX01TEST00000001",
  technician: "Tester",
  createdAt: "2026-09-04T10:00:00.000Z",
  status: "in-progress",
  summary: "",
  dtcTotal: 0,
  dtcCritical: 0,
  events: [],
});

const write = (id: string, at: string): QueuedWrite => ({ id, kind: "job", at, job: job(id) });

const noSleep = () => Promise.resolve();

describe("replayQueue", () => {
  it("sends queued writes oldest first", async () => {
    const seen: string[] = [];
    const report = await replayQueue(
      [write("w2", "2026-09-04T10:05:00.000Z"), write("w1", "2026-09-04T10:00:00.000Z")],
      async (entry) => {
        seen.push(entry.id);
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(seen).toEqual(["w1", "w2"]);
    expect(report.synced).toEqual(["w1", "w2"]);
    expect(report.pending).toEqual([]);
  });

  it("retries a failing write up to maxAttempts then leaves it pending", async () => {
    const send = vi.fn<(entry: QueuedWrite) => Promise<SendResult>>(async () => "retry");
    const report = await replayQueue([write("w1", "2026-09-04T10:00:00.000Z")], send, {
      maxAttempts: 3,
      sleep: noSleep,
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(report.pending).toEqual(["w1"]);
    expect(report.attempts).toBe(3);
  });

  it("succeeds on a later attempt without leaving the write queued", async () => {
    let calls = 0;
    const report = await replayQueue(
      [write("w1", "2026-09-04T10:00:00.000Z")],
      async () => {
        calls += 1;
        return calls < 3 ? "retry" : "ok";
      },
      { maxAttempts: 4, sleep: noSleep },
    );
    expect(report.synced).toEqual(["w1"]);
    expect(calls).toBe(3);
  });

  it("drops writes the server rejects permanently", async () => {
    const report = await replayQueue(
      [write("w1", "2026-09-04T10:00:00.000Z")],
      async () => "drop",
      { sleep: noSleep },
    );
    expect(report.dropped).toEqual(["w1"]);
    expect(report.synced).toEqual([]);
  });

  it("backs off exponentially and caps the delay", async () => {
    expect(backoffDelay(1, { baseDelayMs: 500 })).toBe(500);
    expect(backoffDelay(2, { baseDelayMs: 500 })).toBe(1000);
    expect(backoffDelay(3, { baseDelayMs: 500 })).toBe(2000);
    expect(backoffDelay(9, { baseDelayMs: 500, maxDelayMs: 5000 })).toBe(5000);
  });

  it("waits between attempts using the backoff schedule", async () => {
    const delays: number[] = [];
    await replayQueue([write("w1", "2026-09-04T10:00:00.000Z")], async () => "retry", {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(delays).toEqual([100, 200]);
  });
});
