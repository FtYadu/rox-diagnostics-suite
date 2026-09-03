import { describe, expect, it } from "vitest";

import {
  REQUIRED_TESTER_ADDRESS,
  checkStartup,
  parseAgentConfig,
  parseHex,
  type VehicleCatalog,
} from "../agent/src/config.ts";

const baseConfig = {
  vci: { name: "ROX VCI", serial: "x", protocol: "DoIP" },
  tester: { sourceAddress: "0x0E80", functionalAddress: "0xE400" },
  timing: { p2: 100, p2Star: 5000, s3: 5000 },
  ecus: {
    CCU: { address: "0x1001", security: { levels: [1, 17] } },
  },
};

const seed: VehicleCatalog = {
  vehicle: { code: "R11_Oversea" },
  ecus: [
    { id: "CCU", fullName: "Central Control Unit", domain: "Connectivity", routines: [], dtcs: [] },
    { id: "ESC", fullName: "Stability Control", domain: "Chassis", routines: [], dtcs: [] },
  ],
};

describe("agent config schema", () => {
  it("applies the required tester address and timing defaults", () => {
    const config = parseAgentConfig({ ecus: {} });
    expect(parseHex(config.tester.sourceAddress)).toBe(REQUIRED_TESTER_ADDRESS);
    expect(config.timing).toEqual({ p2: 100, p2Star: 5000, s3: 5000 });
  });

  it("rejects an address that is not hex", () => {
    expect(() => parseAgentConfig({ ecus: { CCU: { address: "4097" } } })).toThrow(
      /agent\/config\.json is invalid/,
    );
  });
});

describe("startup safety check", () => {
  it("lists ECUs from the seed that have no address", () => {
    const problems = checkStartup(parseAgentConfig(baseConfig), seed);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe("unmappedEcus");
    expect(problems[0]?.message).toMatch(/ESC/);
  });

  it("flags a wrong tester address", () => {
    const problems = checkStartup(
      parseAgentConfig({
        ...baseConfig,
        tester: { sourceAddress: "0x0E00" },
        ecus: { CCU: { address: "0x1001" }, ESC: { address: "0x1002" } },
      }),
      seed,
    );
    expect(problems.map((problem) => problem.kind)).toEqual(["testerAddress"]);
  });

  it("passes when every ECU is mapped from the same canonical set", () => {
    const problems = checkStartup(
      parseAgentConfig({
        ...baseConfig,
        dataChecksum: "sha256:abc",
        ecus: { CCU: { address: "0x1001" }, ESC: { address: "0x1002" } },
      }),
      { ...seed, dataChecksum: "sha256:abc" },
    );
    expect(problems).toEqual([]);
  });

  it("flags a checksum mismatch between seed and agent config", () => {
    const problems = checkStartup(
      parseAgentConfig({
        ...baseConfig,
        dataChecksum: "sha256:old",
        ecus: { CCU: { address: "0x1001" }, ESC: { address: "0x1002" } },
      }),
      { ...seed, dataChecksum: "sha256:new" },
    );
    expect(problems.map((problem) => problem.kind)).toEqual(["checksum"]);
  });
});
