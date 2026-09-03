import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { JobLogger, readJobLog, redactVin } from "../agent/src/job-log.ts";
import { scanVehicle, type ScanEvent } from "../agent/src/scan.ts";
import { UdsNegativeResponse } from "../agent/src/uds.ts";

beforeAll(() => {
  process.env["ROX_AGENT_LOG_DIR"] = mkdtempSync(join(tmpdir(), "rox-log-"));
  delete process.env["ROX_AGENT_LOG_FULL_VIN"];
});

const fakeSession = () =>
  ({
    enterSession: async (ecuId: string) => {
      if (ecuId === "BMS") throw new UdsNegativeResponse(0x10, 0x22);
    },
    readDtcs: async (ecuId: string) => ({
      ecuId,
      responded: true,
      dtcs: ecuId === "CCU" ? [{ code: "U100008" }] : [],
    }),
  }) as never;

describe("scanVehicle", () => {
  it("classifies responded, silent and unmapped ECUs and reports progress", async () => {
    const events: ScanEvent[] = [];
    const results = await scanVehicle(fakeSession(), {
      ecuIds: ["CCU", "BMS", "IBCM"],
      concurrency: 2,
      onEvent: (event) => events.push(event),
    });

    const byId = new Map(results.map((result) => [result.ecuId, result]));
    expect(byId.get("CCU")?.status).toBe("unmapped");
    expect(results).toHaveLength(3);
    expect(events[0]).toEqual({ type: "scanStart", total: 3 });
    expect(events.at(-1)).toEqual({ type: "scanDone", total: 3 });
    expect(events.filter((event) => event.type === "scanProgress")).toHaveLength(3);
  });

  it("keeps going when one ECU fails", async () => {
    const results = await scanVehicle(fakeSession(), { ecuIds: ["BMS", "CCU"], concurrency: 1 });
    expect(results.every((result) => result.status !== "responded" || result.dtcs)).toBe(true);
    expect(results).toHaveLength(2);
  });
});

describe("job logging", () => {
  it("redacts the VIN unless the technician opts in", () => {
    expect(redactVin("HJ4ABBHK4RN000123")).toBe("…000123");
    process.env["ROX_AGENT_LOG_FULL_VIN"] = "1";
    expect(redactVin("HJ4ABBHK4RN000123")).toBe("HJ4ABBHK4RN000123");
    delete process.env["ROX_AGENT_LOG_FULL_VIN"];
  });

  it("writes JSONL lines that can be read back", () => {
    const logger = new JobLogger("job-42", "HJ4ABBHK4RN000123");
    logger.write("tx", "CCU 22 F1 90", "CCU");
    logger.write("rx", "CCU 62 F1 90 …", "CCU");
    const entries = readJobLog("job-42");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ jobId: "job-42", kind: "tx", ecuId: "CCU" });
    expect(entries[0]?.vin).toBe("…000123");
    expect(logger.path).toMatch(/job-42\.jsonl$/);
  });

  it("returns an empty log for an unknown job", () => {
    expect(readJobLog("no-such-job")).toEqual([]);
  });
});
