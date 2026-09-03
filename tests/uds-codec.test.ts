import { describe, expect, it } from "vitest";

import {
  NRC_MEANINGS,
  UdsNegativeResponse,
  bytesToHex,
  classifyDtc,
  decodeAscii,
  decodeDtc,
  decodeNumber,
  decodeStatusByte,
  encodeDtc,
  hexToBytes,
  parseDidResponse,
  parseDtcResponse,
  request,
} from "../agent/src/uds.ts";

describe("hex helpers", () => {
  it("round-trips hex text and bytes", () => {
    expect(bytesToHex(hexToBytes("22 F1 90"))).toBe("22 F1 90");
    expect(hexToBytes("0x22F190")).toEqual(Uint8Array.of(0x22, 0xf1, 0x90));
  });

  it("builds requests from numbers, hex strings and byte arrays", () => {
    const frame = request(0x22, "F190", Uint8Array.of(0x01));
    expect(bytesToHex(frame)).toBe("22 F1 90 01");
  });
});

describe("DTC codec", () => {
  it("decodes the dealer text form", () => {
    expect(decodeDtc(0x91, 0x17, 0x16)).toBe("B111716");
    expect(decodeDtc(0x00, 0x11, 0x22)).toBe("P001122");
    expect(decodeDtc(0xc2, 0xbc, 0x78)).toBe("U02BC78");
  });

  it("encodes back to the three bus bytes", () => {
    expect(Array.from(encodeDtc("B111716"))).toEqual([0x91, 0x17, 0x16]);
    expect(Array.from(encodeDtc("P001122"))).toEqual([0x00, 0x11, 0x22]);
  });

  it("rejects an unsupported code format", () => {
    expect(() => encodeDtc("X1234")).toThrow(/Unsupported DTC format/);
  });

  it("parses a 19 02 response and skips padding records", () => {
    const payload = Uint8Array.of(0x59, 0x02, 0xff, 0x91, 0x17, 0x16, 0x09, 0x00, 0x00, 0x00, 0x00);
    const dtcs = parseDtcResponse(payload);
    expect(dtcs).toEqual([{ code: "B111716", statusByte: 0x09 }]);
  });

  it("decodes the status bits and classifies the record", () => {
    expect(decodeStatusByte(0x09)).toEqual({
      current: true,
      testFailedThisCycle: false,
      pending: false,
      confirmed: true,
    });
    expect(classifyDtc(0x09)).toBe("current");
    expect(classifyDtc(0x04)).toBe("pending");
    expect(classifyDtc(0x08)).toBe("history");
  });
});

describe("DID responses", () => {
  it("splits a 62 response using the declared lengths", () => {
    const payload = Uint8Array.of(0x62, 0xf1, 0x90, 0x41, 0x42, 0x43);
    const values = parseDidResponse(payload, new Map([["F190", 3]]));
    expect(decodeAscii(values.get("F190") ?? new Uint8Array())).toBe("ABC");
  });

  it("decodes signed and unsigned numbers", () => {
    expect(decodeNumber(Uint8Array.of(0x36, 0x00), false)).toBe(13824);
    expect(decodeNumber(Uint8Array.of(0xff), true)).toBe(-1);
    expect(decodeNumber(Uint8Array.of(0xff, 0xf0), true)).toBe(-16);
  });
});

describe("negative responses", () => {
  it("maps 0x31 to a real meaning", () => {
    const error = new UdsNegativeResponse(0x22, 0x31);
    expect(error.nrcHex).toBe("0x31");
    expect(error.meaning).toBe("requestOutOfRange");
  });

  it("covers the NRCs the ROX 01 actually returns", () => {
    for (const nrc of [0x22, 0x31, 0x33, 0x35, 0x78, 0x7e, 0x92, 0x93]) {
      expect(NRC_MEANINGS[nrc]).toBeTruthy();
    }
  });
});
