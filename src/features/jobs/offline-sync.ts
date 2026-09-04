import { useCallback, useEffect, useRef, useState } from "react";
import { pushJob, pushJobEvent, uploadJobAttachment } from "./job-cloud";
import { dropWrites, loadWrites, persistWrite, type QueuedWrite } from "@/lib/offline-queue";
import { replayQueue, type SendResult } from "@/lib/queue-replay";
import { useOnline } from "@/hooks/use-online";

/** Queues a write for later delivery when the workshop network is down. */
export const enqueueWrite = (write: QueuedWrite): void => {
  void persistWrite(write);
};

const send = async (write: QueuedWrite): Promise<SendResult> => {
  if (write.kind === "job") return (await pushJob(write.job)) ? "ok" : "retry";
  if (write.kind === "job-event")
    return (await pushJobEvent(write.jobId, write.event)) ? "ok" : "retry";
  return "retry";
};

/**
 * Replays the IndexedDB queue in order whenever the browser comes back online
 * and exposes the pending count for the offline pill.
 */
export function useOfflineSync(): { pending: number; syncing: boolean; flush: () => void } {
  const online = useOnline();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const running = useRef(false);

  const flush = useCallback(() => {
    if (running.current) return;
    running.current = true;

    void (async () => {
      const writes = await loadWrites();
      setPending(writes.length);
      if (writes.length === 0 || !navigator.onLine) {
        running.current = false;
        return;
      }

      setSyncing(true);
      const report = await replayQueue(writes, send, { maxAttempts: 3, baseDelayMs: 800 });
      await dropWrites([...report.synced, ...report.dropped]);
      setPending((await loadWrites()).length);
      setSyncing(false);
      running.current = false;
    })();
  }, []);

  useEffect(() => {
    flush();
    if (!online) return;
    const timer = window.setInterval(flush, 30_000);
    return () => window.clearInterval(timer);
  }, [online, flush]);

  return { pending, syncing, flush };
}

export const uploadQueuedAttachment = uploadJobAttachment;
