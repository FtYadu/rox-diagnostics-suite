import { describe, expect, it } from "vitest";

import {
  CANONICAL_FILES,
  EXPECTED_COUNTS,
  didSchema,
  dtcSchema,
  ecuSchema,
  ioControlSchema,
  processStepSchema,
  routineSchema,
  serviceProcessSchema,
  signalLayoutSchema,
} from "../packages/canonical-schema/src/index.ts";

describe("canonical schema", () => {
  it("declares every expected file", () => {
    expect(Object.keys(CANONICAL_FILES).sort()).toEqual(
      [
        "addresses.json",
        "dids.json",
        "dtcs.json",
        "ecus.json",
        "flows.json",
        "iocontrol.json",
        "menu.json",
        "processes.json",
        "routines.json",
        "services.json",
      ].sort(),
    );
  });

  it("freezes the extraction counts", () => {
    expect(EXPECTED_COUNTS).toMatchObject({
      ecus: 42,
      rdbiDids: 589,
      drdbiDids: 1056,
      wdbiDids: 81,
      ioControls: 113,
      routines: 148,
      processes: 131,
    });
  });

  it("accepts a numeric DID with scaling", () => {
    const did = didSchema.parse({
      did: 0xf186,
      label: "Battery voltage",
      unit: "V",
      length: 2,
      type: "uint",
      factor: 0.001,
      session: 3,
    });
    expect(did.did).toBe(0xf186);
  });

  it("rejects a DID given as a hex string", () => {
    expect(didSchema.safeParse({ did: "F186", label: "x", length: 2, type: "uint" }).success).toBe(
      false,
    );
  });

  it("requires the dealer text form on a DTC", () => {
    expect(
      dtcSchema.parse({ code: 0x911716, codeText: "B111716", name: "Open circuit", severity: 2 })
        .severity,
    ).toBe(2);
    expect(
      dtcSchema.safeParse({ code: 1, codeText: "X111716", name: "x", severity: 2 }).success,
    ).toBe(false);
  });

  it("requires at least one routine sub-function", () => {
    expect(routineSchema.safeParse({ rid: 0x0203, name: "Bleed", subFunctions: [] }).success).toBe(
      false,
    );
    expect(
      routineSchema.parse({ rid: 0x0203, name: "Bleed", subFunctions: ["start", "stop"] })
        .subFunctions,
    ).toEqual(["start", "stop"]);
  });

  it("validates IO control options and layouts", () => {
    const io = ioControlSchema.parse({
      did: 0x2001,
      label: "Left indicator",
      options: ["shortTermAdjust", "returnControl"],
      params: [{ name: "state", byteStart: 0, length: 1, type: "uint" }],
    });
    expect(io.options).toHaveLength(2);
    expect(
      signalLayoutSchema.safeParse({ name: "x", byteStart: -1, length: 1, type: "uint" }).success,
    ).toBe(false);
  });

  it("parses the discriminated process-step union, including nested if steps", () => {
    const step = processStepSchema.parse({
      kind: "if",
      condition: { left: "$vin", comparator: "eq", right: "HJ4ABBHK4RN000123" },
      then: [{ kind: "output", level: "information", text: "VIN matches" }],
      else: [
        {
          kind: "ecuService",
          ecuId: "CCU",
          sid: 0x2e,
          request: [{ name: "vin", variable: "$vin" }],
          negativeExit: "abort",
        },
      ],
    });
    expect(step.kind).toBe("if");
    expect(processStepSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });

  it("validates a whole service process", () => {
    const process = serviceProcessSchema.parse({
      id: "esc-bleed",
      name: "ESC brake bleeding",
      ecu: "ESC",
      category: "Service",
      udsServices: ["0x31"],
      securityLevel: 1,
      steps: [
        { kind: "input", prompt: "Confirm wheel chocks", inputType: "confirm", variable: "$ok" },
        { kind: "delay", ms: 2000 },
      ],
    });
    expect(process.steps).toHaveLength(2);
  });

  it("defaults optional ECU collections to empty arrays", () => {
    const ecu = ecuSchema.parse({
      id: "CCU",
      fullName: "Central Control Unit",
      domain: "Connectivity",
      bus: "DoIP",
      address: 0x1001,
    });
    expect(ecu.dtcs).toEqual([]);
    expect(ecu.saLevels).toEqual([]);
  });
});
