import type { Ecu } from "@/data/vehicle-data";
import type { DtcRecord, EcuDtcResult } from "./types";

/**
 * Vehicle-wide operations (scan, clear-all, verify repair) expressed once so the
 * simulator and the real DoIP agent behave identically. The agent has native v3
 * methods for these; when it does not answer them, the same helpers below run the
 * sequence per ECU over the normal read/clear calls.
 */

export type EcuScanStatus = "responded" | "silent";

export type ScanEcuOutcome = {
  ecuId: string;
  status: EcuScanStatus;
  dtcs: DtcRecord[];
  error?: string;
};

export type VehicleScanOptions = {
  /** Subset of control units; defaults to every ECU passed by the caller. */
  ecus?: Ecu[];
  onEcuStart?: (ecuId: string) => void;
  onEcuDone?: (outcome: ScanEcuOutcome) => void;
  onProgress?: (done: number, total: number) => void;
};

export type VehicleScanResult = {
  results: ScanEcuOutcome[];
  dtcs: DtcRecord[];
  startedAt: string;
  finishedAt: string;
};

export type ClearEcuOutcome = { ecuId: string; cleared: number; nrc?: string; error?: string };

export type ClearAllResult = { results: ClearEcuOutcome[]; cleared: number; failed: number };

export type VerifyRepairResult = {
  before: DtcRecord[];
  after: DtcRecord[];
  resolved: DtcRecord[];
  remaining: DtcRecord[];
  history: DtcRecord[];
  added: DtcRecord[];
  ok: boolean;
};

const key = (dtc: { ecuId: string; code: string }) => `${dtc.ecuId}:${dtc.code}`;

export const scanEcusSequentially = async (
  readDtcs: (ecu: Ecu) => Promise<EcuDtcResult>,
  allEcus: Ecu[],
  options: VehicleScanOptions = {},
): Promise<VehicleScanResult> => {
  const targets = options.ecus ?? allEcus;
  const startedAt = new Date().toISOString();
  const results: ScanEcuOutcome[] = [];
  const dtcs: DtcRecord[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const ecu = targets[index]!;
    options.onEcuStart?.(ecu.id);
    let outcome: ScanEcuOutcome;
    try {
      const result = await readDtcs(ecu);
      outcome = {
        ecuId: ecu.id,
        status: result.responded ? "responded" : "silent",
        dtcs: result.dtcs,
      };
    } catch (cause) {
      outcome = {
        ecuId: ecu.id,
        status: "silent",
        dtcs: [],
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
    results.push(outcome);
    dtcs.push(...outcome.dtcs);
    options.onEcuDone?.(outcome);
    options.onProgress?.(index + 1, targets.length);
  }

  return { results, dtcs, startedAt, finishedAt: new Date().toISOString() };
};

export const clearEcusSequentially = async (
  clearDtcs: (ecu: Ecu) => Promise<{ cleared: number }>,
  targets: Ecu[],
  onEcu?: (outcome: ClearEcuOutcome) => void,
): Promise<ClearAllResult> => {
  const results: ClearEcuOutcome[] = [];
  let cleared = 0;
  let failed = 0;

  for (const ecu of targets) {
    let outcome: ClearEcuOutcome;
    try {
      const result = await clearDtcs(ecu);
      cleared += result.cleared;
      outcome = { ecuId: ecu.id, cleared: result.cleared };
    } catch (cause) {
      failed += 1;
      const message = cause instanceof Error ? cause.message : String(cause);
      const nrc = /0x[0-9a-f]{2}/i.exec(message)?.[0];
      outcome = { ecuId: ecu.id, cleared: 0, error: message, ...(nrc ? { nrc } : {}) };
    }
    results.push(outcome);
    onEcu?.(outcome);
  }

  return { results, cleared, failed };
};

/** History-only codes (not current) are reported separately and never block `ok`. */
export const compareRepair = (before: DtcRecord[], after: DtcRecord[]): VerifyRepairResult => {
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  const current = after.filter((dtc) => dtc.status.current || dtc.status.testFailedThisCycle);
  const history = after.filter((dtc) => !current.includes(dtc));
  return {
    before,
    after,
    resolved: before.filter((dtc) => !afterKeys.has(key(dtc))),
    remaining: current,
    history,
    added: after.filter((dtc) => !beforeKeys.has(key(dtc))),
    ok: current.length === 0,
  };
};
