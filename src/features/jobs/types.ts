import type { TraceLine } from "@/features/bridge/types";

export type JobKind =
  | "health-scan"
  | "clear-dtc"
  | "service"
  | "programming"
  | "live-data"
  | "manual";

export type JobStatus = "in-progress" | "completed" | "failed";

export type JobEventKind =
  | "scan"
  | "dtc-read"
  | "dtc-clear"
  | "process"
  | "routine"
  | "programming"
  | "recording"
  | "note";

export type JobEvent = {
  id: string;
  kind: JobEventKind;
  title: string;
  detail: string;
  ecuId?: string;
  status: "ok" | "failed" | "info";
  at: string;
  trace?: TraceLine[];
  csv?: string;
};

export type Job = {
  id: string;
  title: string;
  kind: JobKind;
  vin: string;
  technician: string;
  createdAt: string;
  endedAt?: string;
  status: JobStatus;
  summary: string;
  dtcTotal: number;
  dtcCritical: number;
  events: JobEvent[];
};

export const jobEventId = (): string =>
  `EVT-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export const jobId = (): string => `JOB-${Math.floor(10000 + Math.random() * 89999)}`;

export const traceToText = (trace: TraceLine[]): string =>
  trace
    .map((entry) => {
      const stamp = new Date(entry.at).toLocaleTimeString();
      const prefix = entry.direction === "tx" ? "Tx" : entry.direction === "rx" ? "Rx" : "--";
      return `${stamp}  ${prefix}  ${entry.text}`;
    })
    .join("\n");
