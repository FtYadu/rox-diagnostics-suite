import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PROTOCOL_VERSION,
  type AgentMethod,
  type ConnectReply,
  type ProcessEvent,
  type ScanEvent,
} from "../packages/protocol/src/index.ts";

describe("agent protocol contract", () => {
  it("pins the version the app and agent compare at connect time", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it("includes the v2 handshake fields in the connect reply", () => {
    const reply: ConnectReply = {
      mode: "local",
      agentVersion: "0.3.0",
      protocolVersion: PROTOCOL_VERSION,
      dataChecksum: null,
      vci: { vciName: "ROX VCI", vciSerial: "S1", protocolList: ["DoIP"] },
      transport: "doip",
      vciName: "ROX VCI",
      vciSerial: "S1",
      protocol: "DoIP",
      vin: "",
      batteryVoltage: 12.6,
      ignitionOn: true,
    };
    expect(reply.protocolVersion).toBe(2);
    expectTypeOf(reply.transport).toEqualTypeOf<"doip" | "j2534" | "replay">();
  });

  it("covers the new process, scan and log methods", () => {
    const methods: AgentMethod[] = [
      "runProcess",
      "provideInput",
      "abortProcess",
      "scanVehicle",
      "getJobLog",
    ];
    expect(methods).toHaveLength(5);
  });

  it("types process and scan events as discriminated unions", () => {
    const output: ProcessEvent = { type: "output", level: "warning", text: "Battery low" };
    const scan: ScanEvent = { type: "scanEcu", ecuId: "CCU", state: "responded", dtcCount: 2 };
    expect(output.type).toBe("output");
    expect(scan.type).toBe("scanEcu");
  });
});
