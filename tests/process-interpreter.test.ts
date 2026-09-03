import { describe, expect, it } from "vitest";

import type { ProcessStep } from "../packages/canonical-schema/src/index.ts";
import { ProcessInterpreter, decodeLayout } from "../agent/src/process-interpreter.ts";
import type { ProcessEvent } from "../agent/src/process-interpreter.ts";

const collect = () => {
  const events: ProcessEvent[] = [];
  return { events, onEvent: (event: ProcessEvent) => events.push(event) };
};

describe("decodeLayout", () => {
  it("scales numeric fields and resolves enums", () => {
    expect(
      decodeLayout(
        { name: "voltage", byteStart: 0, length: 2, type: "uint", factor: 0.05 },
        Uint8Array.of(0x03, 0x20),
      ),
    ).toBeCloseTo(40);
    expect(
      decodeLayout(
        { name: "gear", byteStart: 0, length: 1, type: "uint", enum: { "2": "Drive" } },
        Uint8Array.of(2),
      ),
    ).toBe("Drive");
  });

  it("decodes ascii fields", () => {
    expect(
      decodeLayout(
        { name: "part", byteStart: 0, length: 3, type: "ascii" },
        Uint8Array.of(65, 66, 67),
      ),
    ).toBe("ABC");
  });
});

describe("ProcessInterpreter", () => {
  it("emits output steps with expanded variables", async () => {
    const { events, onEvent } = collect();
    const steps: ProcessStep[] = [
      { kind: "setVar", variable: "vin", value: "HJ4ABBHK4RN000123" },
      { kind: "output", level: "information", text: "Working on $vin" },
    ];
    const result = await new ProcessInterpreter(null, { onEvent }).run(steps);
    expect(result.ok).toBe(true);
    expect(events[0]).toEqual({
      type: "output",
      level: "information",
      text: "Working on HJ4ABBHK4RN000123",
    });
  });

  it("builds a request from sid, subFunction, literals and variables", () => {
    const interpreter = new ProcessInterpreter(null, { variables: { newValue: "0F" } });
    const bytes = interpreter.buildRequest({
      kind: "ecuService",
      ecuId: "CCU",
      sid: 0x2e,
      request: [
        { name: "did", value: "F1 90" },
        { name: "value", variable: "$newValue" },
      ],
    });
    expect([...bytes]).toEqual([0x2e, 0xf1, 0x90, 0x0f]);
  });

  it("takes the then branch and skips the else branch", async () => {
    const { events, onEvent } = collect();
    await new ProcessInterpreter(null, { onEvent, variables: { count: 3 } }).run([
      {
        kind: "if",
        condition: { left: "$count", comparator: "gt", right: 2 },
        then: [{ kind: "output", level: "warning", text: "high" }],
        else: [{ kind: "output", level: "information", text: "low" }],
      },
    ]);
    expect(events.filter((event) => event.type === "output")).toHaveLength(1);
    expect(events[0]).toMatchObject({ text: "high" });
  });

  it("pauses on an input step and resumes with provideInput", async () => {
    const { events, onEvent } = collect();
    const interpreter = new ProcessInterpreter({} as never, {
      onEvent,
      dryRun: false,
    });
    const run = interpreter.run([
      { kind: "input", prompt: "Enter mileage", inputType: "number", variable: "km" },
      { kind: "output", level: "information", text: "Odometer $km" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events[0]).toMatchObject({ type: "input", variable: "km" });
    expect(interpreter.provideInput("128000")).toBe(true);
    const result = await run;
    expect(result.variables["km"]).toBe("128000");
    expect(
      events.some((event) => event.type === "output" && event.text === "Odometer 128000"),
    ).toBe(true);
  });

  it("jumps to negativeExit when the ECU answers negatively", async () => {
    const { events, onEvent } = collect();
    const session = {
      send: async () => {
        const { UdsNegativeResponse } = await import("../agent/src/uds.ts");
        throw new UdsNegativeResponse(0x22, 0x31);
      },
      enterSession: async () => undefined,
      securityAccess: async () => ({ ok: true, level: 1 }),
    };
    const result = await new ProcessInterpreter(session as never, { onEvent }).run([
      {
        kind: "ecuService",
        id: "read",
        ecuId: "CCU",
        sid: 0x22,
        request: [{ name: "did", value: "20 06" }],
        negativeExit: "recover",
      },
      { kind: "output", id: "unreachable", level: "information", text: "not reached" },
      { kind: "output", id: "recover", level: "error", text: "Parameter not supported" },
    ]);
    expect(result.ok).toBe(true);
    expect(events.some((event) => event.type === "negative" && event.nrc === "0x31")).toBe(true);
    expect(events.some((event) => event.type === "output" && event.text === "not reached")).toBe(
      false,
    );
  });

  it("aborts cleanly while waiting for input", async () => {
    const interpreter = new ProcessInterpreter({} as never, { dryRun: false });
    const run = interpreter.run([
      { kind: "input", prompt: "VIN?", inputType: "vin", variable: "vin" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    interpreter.abort();
    const result = await run;
    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
  });
});
