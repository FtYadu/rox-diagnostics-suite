import { supabase } from "@/integrations/supabase/client";
import { fetchDealerProfile } from "@/features/profile/profile";
import type { Job, JobEvent } from "./types";

/**
 * Cloud persistence for jobs. Every call resolves to `false` when there is no
 * session or the network is unavailable, so the caller keeps the local copy.
 * Rows and files are scoped to the technician's dealer; RLS enforces the same.
 */

export const BUCKET = "job-logs";

export type AttachmentKind = "agent-log" | "report-pdf" | "report-xlsx" | "trace";

type Context = { userId: string; dealerId: string };

const currentContext = async (): Promise<Context | null> => {
  try {
    const profile = await fetchDealerProfile();
    if (!profile) return null;
    return { userId: profile.userId, dealerId: profile.dealerId };
  } catch {
    return null;
  }
};

export const pushJob = async (job: Job): Promise<boolean> => {
  const context = await currentContext();
  if (!context) return false;
  const { error } = await supabase.from("jobs").upsert(
    {
      id: job.id,
      user_id: context.userId,
      dealer_id: context.dealerId,
      vin: job.vin,
      technician: job.technician,
      title: job.title,
      kind: job.kind,
      status: job.status,
      summary: job.summary,
      summary_data: {
        dtcTotal: job.dtcTotal,
        dtcCritical: job.dtcCritical,
        actions: job.events.length,
      },
      dtc_total: job.dtcTotal,
      dtc_critical: job.dtcCritical,
      actions_count: job.events.length,
      started_at: job.createdAt,
      ended_at: job.endedAt ?? null,
      finished_at: job.endedAt ?? null,
    },
    { onConflict: "id" },
  );
  return !error;
};

export const pushJobEvent = async (jobId: string, event: JobEvent): Promise<boolean> => {
  const context = await currentContext();
  if (!context) return false;
  const { error } = await supabase.from("job_events").upsert(
    {
      job_id: jobId,
      user_id: context.userId,
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

/* ------------------------------------------------------------- attachments */

const CONTENT_TYPE: Record<AttachmentKind, string> = {
  "agent-log": "application/x-ndjson",
  "report-pdf": "application/pdf",
  "report-xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  trace: "text/plain",
};

export type JobAttachment = {
  id: string;
  jobId: string;
  kind: AttachmentKind;
  path: string;
  sizeBytes: number;
  createdAt: string;
  /** Time-limited download link, present once the file has been signed. */
  url?: string;
};

/** Uploads a job artefact to `<dealer_id>/<job_id>/<file>` and records the row. */
export const uploadJobAttachment = async (
  jobId: string,
  kind: AttachmentKind,
  fileName: string,
  body: Blob | string,
): Promise<JobAttachment | null> => {
  const context = await currentContext();
  if (!context) return null;

  const blob = typeof body === "string" ? new Blob([body], { type: CONTENT_TYPE[kind] }) : body;
  const path = `${context.dealerId}/${jobId}/${fileName}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: CONTENT_TYPE[kind], upsert: true });
  if (upload.error) return null;

  const { data, error } = await supabase
    .from("job_attachments")
    .insert({
      job_id: jobId,
      dealer_id: context.dealerId,
      user_id: context.userId,
      kind,
      path,
      size_bytes: blob.size,
    })
    .select("id, job_id, kind, path, size_bytes, created_at")
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    jobId: data.job_id,
    kind: data.kind as AttachmentKind,
    path: data.path,
    sizeBytes: data.size_bytes,
    createdAt: data.created_at,
  };
};

/** Lists a job's attachments with one-hour signed download URLs. */
export const listJobAttachments = async (jobId: string): Promise<JobAttachment[]> => {
  const { data, error } = await supabase
    .from("job_attachments")
    .select("id, job_id, kind, path, size_bytes, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  const signed = await Promise.all(
    data.map(async (row) => {
      const link = await supabase.storage.from(BUCKET).createSignedUrl(row.path, 3600);
      return {
        id: row.id,
        jobId: row.job_id,
        kind: row.kind as AttachmentKind,
        path: row.path,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        ...(link.data?.signedUrl ? { url: link.data.signedUrl } : {}),
      } satisfies JobAttachment;
    }),
  );
  return signed;
};

/* ------------------------------------------------------------------- reads */

type EventPayload = { trace?: JobEvent["trace"] | null; csv?: string | null } | null;

export type JobFilters = { vin?: string; kind?: Job["kind"]; status?: Job["status"] };

export const fetchCloudJobs = async (filters: JobFilters = {}): Promise<Job[]> => {
  const context = await currentContext();
  if (!context) return [];

  let query = supabase
    .from("jobs")
    .select(
      "id, vin, technician, title, kind, status, summary, dtc_total, dtc_critical, started_at, ended_at",
    )
    .order("started_at", { ascending: false })
    .limit(60);

  if (filters.vin) query = query.eq("vin", filters.vin);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.status) query = query.eq("status", filters.status);

  const { data: jobRows, error } = await query;
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
