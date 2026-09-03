/** ISO 14229 (UDS) request builders and response parsers used by the VCI agent. */

export const SID = {
  diagnosticSessionControl: 0x10,
  ecuReset: 0x11,
  clearDiagnosticInformation: 0x14,
  readDtcInformation: 0x19,
  readDataByIdentifier: 0x22,
  securityAccess: 0x27,
  writeDataByIdentifier: 0x2e,
  routineControl: 0x31,
  requestDownload: 0x34,
  transferData: 0x36,
  requestTransferExit: 0x37,
  testerPresent: 0x3e,
} as const;

export const NRC_MEANINGS: Record<number, string> = {
  0x10: "generalReject",
  0x11: "serviceNotSupported",
  0x12: "subFunctionNotSupported",
  0x13: "incorrectMessageLengthOrInvalidFormat",
  0x14: "responseTooLong",
  0x21: "busyRepeatRequest",
  0x22: "conditionsNotCorrect",
  0x24: "requestSequenceError",
  0x25: "noResponseFromSubnetComponent (busy)",
  0x31: "requestOutOfRange",
  0x33: "securityAccessDenied",
  0x35: "invalidKey",
  0x36: "exceedNumberOfAttempts",
  0x37: "requiredTimeDelayNotExpired",
  0x70: "uploadDownloadNotAccepted",
  0x71: "transferDataSuspended",
  0x72: "generalProgrammingFailure",
  0x73: "wrongBlockSequenceCounter",
  0x78: "requestCorrectlyReceived-ResponsePending",
  0x7e: "subFunctionNotSupportedInActiveSession",
  0x7f: "serviceNotSupportedInActiveSession",
  0x92: "voltageTooHigh",
  0x93: "voltageTooLow",
};

export class UdsNegativeResponse extends Error {
  readonly nrc: number;

  readonly service: number;

  constructor(service: number, nrc: number) {
    super(`0x${hex(nrc)} ${NRC_MEANINGS[nrc] ?? "unknownNrc"}`);
    this.name = "UdsNegativeResponse";
    this.service = service;
    this.nrc = nrc;
  }

  get nrcHex(): string {
    return `0x${hex(this.nrc)}`;
  }

  get meaning(): string {
    return NRC_MEANINGS[this.nrc] ?? "unknownNrc";
  }
}

export const hex = (value: number, bytes = 1): string =>
  value
    .toString(16)
    .toUpperCase()
    .padStart(bytes * 2, "0");

export const bytesToHex = (data: Uint8Array): string =>
  Array.from(data, (byte) => hex(byte)).join(" ");

export const hexToBytes = (text: string): Uint8Array => {
  const clean = text.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Concatenates request bytes; numbers are single bytes, strings are hex. */
export const request = (...parts: Array<number | string | Uint8Array>): Uint8Array => {
  const chunks = parts.map((part) => {
    if (typeof part === "number") return Uint8Array.of(part & 0xff);
    if (typeof part === "string") return hexToBytes(part);
    return part;
  });
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const DTC_LETTERS = ["P", "C", "B", "U"] as const;

/** Decodes the 3-byte UDS DTC into the dealer-tool text form, e.g. 91 17 16 -> B111716. */
export const decodeDtc = (b0: number, b1: number, b2: number): string => {
  const letter = DTC_LETTERS[(b0 >> 6) & 0x03] ?? "P";
  const digit1 = (b0 >> 4) & 0x03;
  return `${letter}${digit1}${hex(b0 & 0x0f).slice(1)}${hex(b1)}${hex(b2)}`;
};

/** Encodes the text form back into the 3 DTC bytes used by 19 06 / 14 requests. */
export const encodeDtc = (code: string): Uint8Array => {
  const text = code.trim().toUpperCase();
  const letterIndex = DTC_LETTERS.indexOf(text[0] as (typeof DTC_LETTERS)[number]);
  if (letterIndex < 0 || text.length < 7) throw new Error(`Unsupported DTC format: ${code}`);
  const digit1 = Number.parseInt(text[1] ?? "0", 16) & 0x03;
  const digit2 = Number.parseInt(text[2] ?? "0", 16) & 0x0f;
  const b0 = (letterIndex << 6) | (digit1 << 4) | digit2;
  const b1 = Number.parseInt(text.slice(3, 5), 16);
  const b2 = Number.parseInt(text.slice(5, 7), 16);
  return Uint8Array.of(b0, b1, b2);
};

export type DtcStatusFlags = {
  current: boolean;
  pending: boolean;
  confirmed: boolean;
  testFailedThisCycle: boolean;
};

export const decodeStatusByte = (statusByte: number): DtcStatusFlags => ({
  current: (statusByte & 0x01) !== 0,
  testFailedThisCycle: (statusByte & 0x02) !== 0,
  pending: (statusByte & 0x04) !== 0,
  confirmed: (statusByte & 0x08) !== 0,
});

/** Real classification from the status bits — never simulated. */
export type DtcState = "current" | "pending" | "history";

export const classifyDtc = (statusByte: number): DtcState => {
  if ((statusByte & 0x01) !== 0) return "current"; // testFailed
  if ((statusByte & 0x04) !== 0) return "pending"; // pendingDTC
  return "history"; // confirmed / stored only
};

export type RawDtc = { code: string; statusByte: number };

/** Parses a 19 02 (reportDTCByStatusMask) positive response. */
export const parseDtcResponse = (payload: Uint8Array): RawDtc[] => {
  // payload: 59 02 <availabilityMask> then N * (3 DTC bytes + status)
  const out: RawDtc[] = [];
  for (let i = 3; i + 3 < payload.length + 1 && i + 3 <= payload.length; i += 4) {
    const b0 = payload[i] ?? 0;
    const b1 = payload[i + 1] ?? 0;
    const b2 = payload[i + 2] ?? 0;
    const status = payload[i + 3] ?? 0;
    if (b0 === 0 && b1 === 0 && b2 === 0) continue;
    out.push({ code: decodeDtc(b0, b1, b2), statusByte: status });
  }
  return out;
};

/** Splits a 62 (readDataByIdentifier) response into DID -> value bytes. */
export const parseDidResponse = (
  payload: Uint8Array,
  lengths: Map<string, number>,
): Map<string, Uint8Array> => {
  const out = new Map<string, Uint8Array>();
  let index = 1;
  while (index + 2 <= payload.length) {
    const did = `${hex(payload[index] ?? 0)}${hex(payload[index + 1] ?? 0)}`;
    index += 2;
    const declared = lengths.get(did);
    const length = declared ?? payload.length - index;
    out.set(did, payload.slice(index, index + length));
    index += length;
    if (declared === undefined) break;
  }
  return out;
};

export const decodeAscii = (data: Uint8Array): string =>
  Array.from(data)
    .filter((byte) => byte >= 0x20 && byte <= 0x7e)
    .map((byte) => String.fromCharCode(byte))
    .join("")
    .trim();

export const decodeNumber = (data: Uint8Array, signed: boolean): number => {
  let value = 0;
  for (const byte of data) value = value * 256 + byte;
  if (signed && data.length > 0) {
    const limit = 2 ** (8 * data.length - 1);
    if (value >= limit) value -= limit * 2;
  }
  return value;
};
