import { describe, expect, it } from "vitest";
import type { Did } from "@/data/vehicle-data";
import { compareToExpected, decodeDid, encodeDid, parseHex, toHex } from "@/lib/did-codec";

const did = (patch: Partial<Did>): Did => ({
  did: 0xf190,
  label: "Test",
  length: 2,
  type: "uint",
  ...patch,
});

describe("decodeDid", () => {
  it("decodes ascii identification values", () => {
    const vin = "LRX01TEST00000001";
    const bytes = [...vin].map((c) => c.charCodeAt(0));
    expect(decodeDid(did({ type: "ascii", length: 17 }), bytes)).toBe(vin);
  });

  it("applies factor and offset", () => {
    expect(decodeDid(did({ factor: 0.1, offset: -40, unit: "°C", length: 2 }), [0x02, 0xbc])).toBe(
      "30 °C",
    );
  });

  it("decodes signed values", () => {
    expect(decodeDid(did({ type: "int", length: 2, signed: true }), [0xff, 0xf6])).toBe("-10");
  });

  it("maps enum values and flags unknown ones", () => {
    const definition = did({ type: "enum", length: 1, enum: { "0": "Off", "1": "On" } });
    expect(decodeDid(definition, [0x01])).toBe("On");
    expect(decodeDid(definition, [0x07])).toBe("Unknown (7)");
  });

  it("renders hex and bitfields as spaced bytes", () => {
    expect(decodeDid(did({ type: "hex", length: 3 }), [0x0a, 0xff, 0x10])).toBe("0A FF 10");
  });
});

describe("encodeDid", () => {
  it("round-trips scaled numeric values", () => {
    const definition = did({ factor: 0.1, offset: -40, length: 2 });
    const bytes = encodeDid(definition, "30");
    expect(toHex(bytes)).toBe("02 BC");
    expect(decodeDid(definition, bytes)).toBe("30");
  });

  it("pads ascii values to the DID length", () => {
    expect(encodeDid(did({ type: "ascii", length: 4 }), "AB")).toEqual([0x41, 0x42, 0x20, 0x20]);
  });

  it("parses hex input and truncates to length", () => {
    expect(encodeDid(did({ type: "hex", length: 2 }), "0x AA BB CC")).toEqual([0xaa, 0xbb]);
  });
});

describe("parseHex / compareToExpected", () => {
  it("parses spaced and prefixed hex", () => {
    expect(parseHex("0x0A 1b")).toEqual([0x0a, 0x1b]);
  });

  it("ignores whitespace and case when comparing part numbers", () => {
    expect(compareToExpected("31 4001-A", "314001-a").matches).toBe(true);
    expect(compareToExpected("314001-A", "314002-A").matches).toBe(false);
    expect(compareToExpected(undefined, "anything")).toEqual({ matches: true, expected: null });
  });
});
