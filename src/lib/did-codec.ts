import type { Did } from "@/data/vehicle-data";

/** Parses "1A 2B" / "1a2b" hex text into bytes. */
export const parseHex = (input: string): number[] => {
  const cleaned = input.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  const bytes: number[] = [];
  for (let i = 0; i + 1 < cleaned.length + 1; i += 2) {
    const pair = cleaned.slice(i, i + 2);
    if (pair.length === 2) bytes.push(parseInt(pair, 16));
  }
  return bytes;
};

export const toHex = (bytes: number[]): string =>
  bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");

const toUnsigned = (bytes: number[]): number =>
  bytes.reduce((value, byte) => value * 256 + byte, 0);

const toSigned = (bytes: number[]): number => {
  const unsigned = toUnsigned(bytes);
  const bits = bytes.length * 8;
  return unsigned >= 2 ** (bits - 1) ? unsigned - 2 ** bits : unsigned;
};

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Decodes raw DID bytes into the technician-facing value using the canonical
 * scaling metadata (factor / offset / signed / enum). Used by Identification,
 * live data and the configuration read-back.
 */
export const decodeDid = (did: Did, bytes: number[]): string => {
  if (bytes.length === 0) return "—";

  switch (did.type) {
    case "ascii":
      return bytes
        .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ""))
        .join("")
        .trim();
    case "hex":
    case "bitfield":
      return toHex(bytes);
    case "enum": {
      const raw = toUnsigned(bytes);
      return did.enum?.[String(raw)] ?? `Unknown (${raw})`;
    }
    case "int":
    case "uint":
    case "float": {
      const raw = did.signed || did.type === "int" ? toSigned(bytes) : toUnsigned(bytes);
      const scaled = round6(raw * (did.factor ?? 1) + (did.offset ?? 0));
      return did.unit ? `${scaled} ${did.unit}` : String(scaled);
    }
    default:
      return toHex(bytes);
  }
};

/** Encodes a technician-entered value back into bytes for 0x2E writes. */
export const encodeDid = (did: Did, value: string): number[] => {
  const length = Math.max(1, did.length || 1);
  if (did.type === "ascii") {
    const bytes = [...value].map((char) => char.charCodeAt(0) & 0xff);
    return bytes.slice(0, length).concat(Array(Math.max(0, length - bytes.length)).fill(0x20));
  }
  if (did.type === "hex" || did.type === "bitfield") {
    const bytes = parseHex(value);
    return bytes.slice(0, length).concat(Array(Math.max(0, length - bytes.length)).fill(0));
  }
  const numeric = Number(value) || 0;
  const raw = Math.round((numeric - (did.offset ?? 0)) / (did.factor ?? 1));
  const bytes: number[] = [];
  let remaining = raw < 0 ? raw + 2 ** (length * 8) : raw;
  for (let i = 0; i < length; i += 1) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return bytes;
};

export type IdentComparison = {
  matches: boolean;
  expected: string | null;
};

/** Compares a read identification value against the DID's expected value. */
export const compareToExpected = (
  expected: string | undefined,
  actual: string,
): IdentComparison => {
  if (!expected) return { matches: true, expected: null };
  const normalize = (value: string) => value.replace(/\s+/g, "").toUpperCase();
  return { matches: normalize(expected) === normalize(actual), expected };
};
