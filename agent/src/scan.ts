import type { ScanEvent, ScanEcuResult } from "../../packages/protocol/src/index.ts";
import { AgentConfigError, loadCatalog, loadConfig } from "./config.ts";
import type { VehicleSession } from "./session.ts";
import { UdsNegativeResponse } from "./uds.ts";

export type { ScanEvent, ScanEcuResult };

/** Concurrency high enough to keep a 42-ECU scan quick, low enough not to flood the gateway. */
export const SCAN_CONCURRENCY = 4;

export type ScanOptions = {
  ecuIds?: string[];
  concurrency?: number;
  onEvent?: (event: ScanEvent) => void;
};

/**
 * Scans every ECU in the vehicle data, classifying each one as responded, unmapped
 * (no DoIP address in config) or silent. One ECU failing never stops the scan.
 */
export const scanVehicle = async (
  session: VehicleSession,
  options: ScanOptions = {},
): Promise<ScanEcuResult[]> => {
  const ids = options.ecuIds ?? loadCatalog().ecus.map((ecu) => ecu.id);
  const mapped = new Set(Object.keys(loadConfig().ecus));
  const emit = options.onEvent ?? (() => undefined);
  const results: ScanEcuResult[] = [];
  let done = 0;

  emit({ type: "scanStart", total: ids.length });

  const queue = [...ids];
  const worker = async () => {
    for (;;) {
      const ecuId = queue.shift();
      if (!ecuId) return;
      emit({ type: "scanEcu", ecuId, state: "running" });
      const result = await scanOne(session, ecuId, mapped.has(ecuId));
      results.push(result);
      done += 1;
      emit({
        type: "scanEcu",
        ecuId,
        state: result.status,
        dtcCount: result.dtcs.length,
        ...(result.error ? { error: result.error } : {}),
      });
      emit({ type: "scanProgress", done, total: ids.length });
    }
  };

  const workers = Array.from(
    { length: Math.min(options.concurrency ?? SCAN_CONCURRENCY, ids.length) },
    worker,
  );
  await Promise.all(workers);
  emit({ type: "scanDone", total: ids.length });
  return results;
};

const scanOne = async (
  session: VehicleSession,
  ecuId: string,
  isMapped: boolean,
): Promise<ScanEcuResult> => {
  if (!isMapped) {
    return {
      ecuId,
      status: "unmapped",
      dtcs: [],
      error: "No DoIP address configured — run `npm run build:agent-config`",
    };
  }
  try {
    await session.enterSession(ecuId);
    const read = await session.readDtcs(ecuId);
    return { ecuId, status: "responded", dtcs: read.dtcs };
  } catch (error) {
    const message =
      error instanceof UdsNegativeResponse
        ? `${error.nrcHex} ${error.meaning}`
        : error instanceof AgentConfigError
          ? error.message
          : (error as Error).message;
    return { ecuId, status: "silent", dtcs: [], error: message };
  }
};
