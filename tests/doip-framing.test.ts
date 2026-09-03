import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_NACK_CODES,
  DoipNegativeAckError,
  DoipRoutingActivationError,
  ROUTING_ACTIVATION_CODES,
  doipHeader,
  parseDoipFrames,
} from "../agent/src/doip.ts";

const TESTER = 0x0e80;
const ECU = 0x1001;

describe("DoIP framing", () => {
  it("writes the protocol version, inverse and payload length", () => {
    const frame = doipHeader(0x8001, Uint8Array.of(0x0e, 0x80, 0x10, 0x01, 0x22, 0xf1, 0x90));
    expect(frame[0]).toBe(0x02);
    expect(frame[1]).toBe(0xfd);
    expect(frame.readUInt16BE(2)).toBe(0x8001);
    expect(frame.readUInt32BE(4)).toBe(7);
    expect(frame.length).toBe(15);
  });

  it("splits a stream into complete frames and keeps the remainder", () => {
    const first = doipHeader(0x8001, Uint8Array.of(0x10, 0x01, 0x0e, 0x80, 0x62));
    const second = doipHeader(0x0006, Uint8Array.of(0x0e, 0x80, 0x10, 0x01, 0x10));
    const stream = Buffer.concat([first, second.subarray(0, 6)]);

    const { frames, rest } = parseDoipFrames(stream);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.payloadType).toBe(0x8001);
    expect(rest.length).toBe(6);

    const completed = parseDoipFrames(Buffer.concat([rest, second.subarray(6)]));
    expect(completed.frames).toHaveLength(1);
    expect(completed.frames[0]?.payloadType).toBe(0x0006);
    expect(completed.rest.length).toBe(0);
  });

  it("addresses a diagnostic message from the tester to the ECU", () => {
    const payload = Buffer.alloc(4);
    payload.writeUInt16BE(TESTER, 0);
    payload.writeUInt16BE(ECU, 2);
    const frame = doipHeader(0x8001, payload);
    const body = frame.subarray(8);
    expect(body.readUInt16BE(0)).toBe(TESTER);
    expect(body.readUInt16BE(2)).toBe(ECU);
  });
});

describe("DoIP acknowledge codes", () => {
  it("names every routing activation code 0x00–0x05", () => {
    for (const code of [0x00, 0x01, 0x02, 0x03, 0x04, 0x05]) {
      expect(ROUTING_ACTIVATION_CODES[code]).toBeTruthy();
    }
    expect(new DoipRoutingActivationError(0x00).message).toMatch(/unknown source address/);
  });

  it("names every diagnostic NACK code 0x02–0x08", () => {
    for (const code of [0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]) {
      expect(DIAGNOSTIC_NACK_CODES[code]).toBeTruthy();
    }
    const error = new DoipNegativeAckError(0x04);
    expect(error.code).toBe(0x04);
    expect(error.message).toMatch(/target unreachable/);
  });
});
