import { describe, expect, it } from "vitest";

import { decodeAscii, decodeNumber } from "../agent/src/uds.ts";

/** Mirrors the agent's signal decoding: value = raw * factor + offset. */
const scale = (
  raw: Uint8Array,
  signal: { factor?: number; offset?: number; signed?: boolean; enum?: Record<string, string> },
): number | string => {
  const value = decodeNumber(raw, signal.signed ?? false);
  if (signal.enum) return signal.enum[String(value)] ?? `unknown (${value})`;
  return Number.parseFloat((value * (signal.factor ?? 1) + (signal.offset ?? 0)).toFixed(3));
};

describe("DID scaling", () => {
  it("applies a factor to a two-byte voltage", () => {
    expect(scale(Uint8Array.of(0x36, 0x00), { factor: 0.001 })).toBe(13.824);
  });

  it("applies an offset to a one-byte temperature", () => {
    expect(scale(Uint8Array.of(0x28), { offset: -40 })).toBe(0);
    expect(scale(Uint8Array.of(0x00), { offset: -40 })).toBe(-40);
  });

  it("handles signed values", () => {
    expect(scale(Uint8Array.of(0xff, 0x9c), { signed: true, factor: 0.1 })).toBe(-10);
  });

  it("combines factor and offset", () => {
    expect(scale(Uint8Array.of(0x64), { factor: 0.5, offset: -25 })).toBe(25);
  });

  it("resolves enum DIDs to their label", () => {
    const ignition = { enum: { "0": "Off", "1": "Accessory", "2": "Ignition on", "3": "Crank" } };
    expect(scale(Uint8Array.of(0x02), ignition)).toBe("Ignition on");
    expect(scale(Uint8Array.of(0x09), ignition)).toBe("unknown (9)");
  });

  it("decodes ascii identification DIDs and trims padding", () => {
    const raw = Uint8Array.from([...Buffer.from("5C0912001AA"), 0x00, 0x00]);
    expect(decodeAscii(raw)).toBe("5C0912001AA");
  });
});
