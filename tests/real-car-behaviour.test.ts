import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { configPath, resetConfigCache } from "../agent/src/config.ts";

import { assertDiagnosticAdapter, DoipAdapterError } from "../agent/src/doip.ts";
import { ProcessInterpreter, evaluateExpression } from "../agent/src/process-interpreter.ts";
import { VehicleSession } from "../agent/src/session.ts";
import { UdsNegativeResponse, hexToBytes } from "../agent/src/uds.ts";
import { canonicalSteps, findProcess } from "../agent/src/process-catalog.ts";
import type { Transport } from "../agent/src/transport/types.ts";

/**
 * The session reads agent/config.json. Point it at a copy whose seed/key backend is the
 * deterministic test table, so a clear can be exercised without the licensed library.
 */
beforeAll(() => {
  const original = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, unknown>;
  const security = (original["security"] ?? {}) as Record<string, unknown>;
  const copy = {
    ...original,
    security: {
      ...security,
      seedKey: { backend: "test", table: { "11223344": "AABBCCDD" } },
    },
  };
  const path = join(mkdtempSync(join(tmpdir(), "rox-config-")), "config.json");
  writeFileSync(path, JSON.stringify(copy), "utf8");
  process.env["ROX_AGENT_CONFIG"] = path;
  resetConfigCache();
});

afterAll(() => {
  delete process.env["ROX_AGENT_CONFIG"];
  resetConfigCache();
});

/** Minimal transport that answers from a script of request-prefix -> response pairs. */
const scriptedTransport = (
  script: Array<{ match: string; reply: string | UdsNegativeResponse }>,
) => {
  const sent: string[] = [];
  const transport = {
    info: { vciName: "test", vciSerial: "0", protocolList: ["DoIP"] },
    connected: true,
    open: async () => undefined,
    close: async () => undefined,
    onEvent: () => undefined,
    startTesterPresent: () => undefined,
    stopTesterPresent: () => undefined,
    sendNoResponse: () => undefined,
    send: async (_target: number, bytes: Uint8Array) => {
      const hex = [...bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      sent.push(hex);
      const entry = script.find((item) => hex.startsWith(item.match.replace(/\s/g, "")));
      if (!entry) throw new Error(`unscripted request ${hex}`);
      if (entry.reply instanceof UdsNegativeResponse) throw entry.reply;
      return hexToBytes(entry.reply);
    },
  } as unknown as Transport;
  return { transport, sent };
};

describe("authorized DTC clear", () => {
  it("runs 10 03 → 27 → 14 FF FF FF → 19 02 and reports the read-back", async () => {
    const { transport, sent } = scriptedTransport([
      { match: "1003", reply: "50 03 00 32 01 F4" },
      { match: "1001", reply: "50 01 00 32 01 F4" },
      { match: "2701", reply: "67 01 11 22 33 44" },
      { match: "2702", reply: "67 02" },
      { match: "14FFFFFF", reply: "54" },
      { match: "1902", reply: "59 02 0D" },
    ]);
    const session = new VehicleSession(transport);
    const result = await session.clearDtcsAuthorized("CCU");

    expect(result.cleared).toBe(true);
    expect(result.remaining).toEqual([]);
    expect(sent.some((frame) => frame.startsWith("14FFFFFF"))).toBe(true);
    expect(sent.indexOf("14FFFFFF")).toBeGreaterThan(sent.findIndex((f) => f.startsWith("2702")));
    session.dispose();
  });

  it("stops on 0x33 and never retries the clear", async () => {
    const { transport, sent } = scriptedTransport([
      { match: "1003", reply: "50 03 00 32 01 F4" },
      { match: "1001", reply: "50 01 00 32 01 F4" },
      { match: "2701", reply: "67 01 11 22 33 44" },
      { match: "2702", reply: new UdsNegativeResponse(0x27, 0x33) },
    ]);
    const session = new VehicleSession(transport);
    const result = await session.clearDtcsAuthorized("CCU");

    expect(result.cleared).toBe(false);
    expect(result.nrc).toBe("0x33");
    expect(sent.filter((frame) => frame.startsWith("14"))).toHaveLength(0);
    expect(sent.filter((frame) => frame.startsWith("2701"))).toHaveLength(1);
    session.dispose();
  });
});

describe("freeze frame tolerance", () => {
  it("returns an empty unsupported record on NRC 0x12 instead of throwing", async () => {
    const { transport } = scriptedTransport([
      { match: "1906", reply: new UdsNegativeResponse(0x19, 0x12) },
    ]);
    const session = new VehicleSession(transport);
    const frame = (await session.readFreezeFrame("CCU", "U100008")) as {
      entries: unknown[];
      unsupported?: boolean;
      nrc?: string;
    };
    expect(frame.unsupported).toBe(true);
    expect(frame.nrc).toBe("0x12");
    expect(frame.entries).toEqual([]);
    session.dispose();
  });

  it("still throws on an unrelated negative response", async () => {
    const { transport } = scriptedTransport([
      { match: "1906", reply: new UdsNegativeResponse(0x19, 0x22) },
    ]);
    const session = new VehicleSession(transport);
    await expect(session.readFreezeFrame("CCU", "U100008")).rejects.toBeInstanceOf(
      UdsNegativeResponse,
    );
    session.dispose();
  });
});

describe("diagnostic adapter check", () => {
  it("accepts an adapter in the vehicle's /24", () => {
    expect(() =>
      assertDiagnosticAdapter("192.168.0.100", [
        { address: "10.0.0.5", netmask: "255.255.255.0", broadcast: "10.0.0.255" },
        { address: "192.168.0.110", netmask: "255.255.255.0", broadcast: "192.168.0.255" },
      ]),
    ).not.toThrow();
  });

  it("explains the fix when no adapter is on 192.168.0.x", () => {
    expect(() =>
      assertDiagnosticAdapter("192.168.0.100", [
        { address: "10.0.0.5", netmask: "255.255.255.0", broadcast: "10.0.0.255" },
      ]),
    ).toThrow(DoipAdapterError);
    expect(() => assertDiagnosticAdapter("192.168.0.100", [])).toThrow(/192\.168\.0\.110\/24/);
  });
});

describe("expression evaluation", () => {
  it("does arithmetic without eval and rejects anything else", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(6 - 2) / 2")).toBe(2);
    expect(Number.isNaN(evaluateExpression("process.exit(1)"))).toBe(true);
  });
});

describe("ibcm adds new key", () => {
  it("unlocks security level 17 with algorithm 11 before routine 04CB", async () => {
    const process = findProcess("ibcm__adds-new-key");
    expect(process).toBeTruthy();
    const steps = canonicalSteps(process!);

    const order: string[] = [];
    const session = {
      enterSession: vi.fn(async () => undefined),
      securityAccess: vi.fn(async (ecuId: string, level: number, alg?: number) => {
        order.push(`sa:${ecuId}:${level}:${alg}`);
        return { ok: true, level };
      }),
      send: vi.fn(async (_ecuId: string, bytes: Uint8Array) => {
        const hex = [...bytes]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
        order.push(`tx:${hex}`);
        if (hex.startsWith("3101")) return hexToBytes("71 01 04 CB 00");
        return hexToBytes("50 03");
      }),
    } as unknown as VehicleSession;

    const interpreter = new ProcessInterpreter(session, {});
    // The process ends in a technician loop; abort once the routine has been started.
    const run = interpreter.run(steps);
    setTimeout(() => interpreter.abort(), 900);
    await run;

    const saIndex = order.findIndex((entry) => entry === "sa:IBCM:17:11");
    const routineIndex = order.findIndex((entry) => entry.startsWith("tx:310104CB"));
    expect(saIndex).toBeGreaterThanOrEqual(0);
    expect(routineIndex).toBeGreaterThan(saIndex);
  });
});
