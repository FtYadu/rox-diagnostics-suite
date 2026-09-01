import { supabase } from "@/integrations/supabase/client";
import type { Job, JobEvent } from "./types";

/**
 * Cloud persistence for jobs. Every call resolves to `false` when there is no
 * session or the network is unavailable, so the caller keeps the local copy.
 */

const currentUserId = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
};

export const pushJob = async (job: Job): Promise<boolean> => {
  const userId = await currentUserId();
  if (!userId) return false;
  const { error } = await supabase.from("jobs").upsert(
    {
      id: job.id,
      user_id: userId,
      vin: job.vin,
      technician: job.technician,
      title: job.title,
      kind: job.kind,
      status: job.status,
      summary: job.summary,
      dtc_total: job.dtcTotal,
      dtc_critical: job.dtcCritical,
      actions_count: job.events.length,
      started_at: job.createdAt,
      ended_at: job.endedAt ?? null,
    },
    { onConflict: "id" },
  );
  return !error;
};

export const pushJobEvent = async (jobId: string, event: JobEvent): Promise<boolean> => {
  const userId = await currentUserId();
  if (!userId) return false;
  const { error } = await supabase.from("job_events").upsert(
    {
      job_id: jobId,
      user_id: userId,
      client_event_id: event.id,
      kind: event.kind,
      title: event.title,
      detail: event.detail,
      ecu_id: event.ecuId ?? null,
      status: event.status,
      payload: { trace: event.trace ?? null, csv: event.csv ?? null },
      occurred_at: event.at,
    },
    { onConflict: "job_id,client_event_id" },
  );
  return !error;
};

type EventPayload = { trace?: JobEvent["trace"] | null; csv?: string | null } | null;

export const fetchCloudJobs = async (): Promise<Job[]> => {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data: jobRows, error } = await supabase
    .from("jobs")
    .select(
      "id, vin, technician, title, kind, status, summary, dtc_total, dtc_critical, started_at, ended_at",
    )
    .order("started_at", { ascending: false })
    .limit(60);
  if (error || !jobRows) return [];

  const ids = jobRows.map((row) => row.id);
  const { data: eventRows } = await supabase
    .from("job_events")
    .select("job_id, client_event_id, kind, title, detail, ecu_id, status, payload, occurred_at")
    .in("job_id", ids.length > 0 ? ids : ["none"])
    .order("occurred_at", { ascending: true });

  const eventsByJob = new Map<string, JobEvent[]>();
  (eventRows ?? []).forEach((row) => {
    const payload = row.payload as EventPayload;
    const event: JobEvent = {
      id: row.client_event_id,
      kind: row.kind as JobEvent["kind"],
      title: row.title,
      detail: row.detail,
      status: row.status as JobEvent["status"],
      at: row.occurred_at,
      ...(row.ecu_id ? { ecuId: row.ecu_id } : {}),
      ...(payload?.trace ? { trace: payload.trace } : {}),
      ...(payload?.csv ? { csv: payload.csv } : {}),
    };
    const list = eventsByJob.get(row.job_id) ?? [];
    list.push(event);
    eventsByJob.set(row.job_id, list);
  });

  return jobRows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind as Job["kind"],
    vin: row.vin,
    technician: row.technician,
    createdAt: row.started_at,
    status: row.status as Job["status"],
    summary: row.summary,
    dtcTotal: row.dtc_total,
    dtcCritical: row.dtc_critical,
    events: eventsByJob.get(row.id) ?? [],
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
  }));
};
