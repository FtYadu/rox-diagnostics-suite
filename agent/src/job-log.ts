import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { JobLogEntry } from "../../packages/protocol/src/index.ts";

export type { JobLogEntry };

export const logDir = (): string =>
  process.env["ROX_AGENT_LOG_DIR"] ?? resolve(homedir(), ".rox-agent", "logs");

export const logPath = (jobId: string): string =>
  join(logDir(), `${jobId.replace(/[^\w.-]/g, "_")}.jsonl`);

/**
 * A workshop log ends up attached to a job record and sometimes emailed, so the VIN is
 * reduced to its last 6 characters unless the technician explicitly opts in.
 */
export const redactVin = (vin: string): string => {
  if (!vin) return "";
  if (process.env["ROX_AGENT_LOG_FULL_VIN"] === "1") return vin;
  return `…${vin.slice(-6)}`;
};

/** Append-only JSONL trace per job, one file under ~/.rox-agent/logs. */
export class JobLogger {
  readonly jobId: string;

  private readonly vin: string;

  constructor(jobId: string, vin = "") {
    this.jobId = jobId;
    this.vin = vin;
    mkdirSync(logDir(), { recursive: true });
  }

  get path(): string {
    return logPath(this.jobId);
  }

  write(kind: JobLogEntry["kind"], text: string, ecuId?: string): JobLogEntry {
    const entry: JobLogEntry = {
      at: new Date().toISOString(),
      jobId: this.jobId,
      kind,
      text,
      ...(this.vin ? { vin: redactVin(this.vin) } : {}),
      ...(ecuId ? { ecuId } : {}),
    };
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  read(): JobLogEntry[] {
    return readJobLog(this.jobId);
  }
}

export const readJobLog = (jobId: string): JobLogEntry[] => {
  const path = logPath(jobId);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JobLogEntry);
};
