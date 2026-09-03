import { createSocket } from "node:dgram";
import { Socket } from "node:net";

import { UdsNegativeResponse, bytesToHex, hex } from "./uds.ts";

const PROTOCOL_VERSION = 0x02;
const DOIP_PORT = 13400;

const PAYLOAD = {
  vehicleIdentificationRequest: 0x0001,
  vehicleAnnouncement: 0x0004,
  routingActivationRequest: 0x0005,
  routingActivationResponse: 0x0006,
  aliveCheckRequest: 0x0007,
  aliveCheckResponse: 0x0008,
  diagnosticMessage: 0x8001,
  diagnosticPositiveAck: 0x8002,
  diagnosticNegativeAck: 0x8003,
} as const;

/** ISO 13400-2 routing activation response codes. */
export const ROUTING_ACTIVATION_CODES: Record<number, string> = {
  0x00: "unknown source address — the gateway does not know this tester address",
  0x01: "all concurrent sockets are registered and active",
  0x02: "source address already registered on a different socket",
  0x03: "socket already registered for a different source address",
  0x04: "missing authentication",
  0x05: "rejected confirmation",
  0x06: "unsupported routing activation type",
  0x10: "routing activation successful",
  0x11: "routing activation successful, confirmation required",
};

/** ISO 13400-2 diagnostic message negative acknowledge codes. */
export const DIAGNOSTIC_NACK_CODES: Record<number, string> = {
  0x00: "invalid source address",
  0x01: "unknown target address",
  0x02: "diagnostic message too large",
  0x03: "out of memory in the gateway",
  0x04: "target unreachable",
  0x05: "unknown network",
  0x06: "transport protocol error",
  0x07: "invalid payload length",
  0x08: "invalid payload type",
};

export class DoipRoutingActivationError extends Error {
  readonly code: number;

  constructor(code: number) {
    super(
      `DoIP routing activation refused (0x${hex(code)} — ${ROUTING_ACTIVATION_CODES[code] ?? "unknown code"})`,
    );
    this.name = "DoipRoutingActivationError";
    this.code = code;
  }
}

export class DoipNegativeAckError extends Error {
  readonly code: number;

  constructor(code: number) {
    super(
      `DoIP gateway rejected the message (0x${hex(code)} — ${DIAGNOSTIC_NACK_CODES[code] ?? "unknown code"})`,
    );
    this.name = "DoipNegativeAckError";
    this.code = code;
  }
}

export type VehicleAnnouncement = {
  vin: string;
  logicalAddress: number;
  eid: string;
  host: string;
};

export type DoipTiming = { p2: number; p2Star: number; s3: number };

export const DEFAULT_TIMING: DoipTiming = { p2: 100, p2Star: 5000, s3: 5000 };

export const doipHeader = (payloadType: number, payload: Uint8Array): Buffer => {
  const frame = Buffer.alloc(8 + payload.length);
  frame[0] = PROTOCOL_VERSION;
  frame[1] = PROTOCOL_VERSION ^ 0xff;
  frame.writeUInt16BE(payloadType, 2);
  frame.writeUInt32BE(payload.length, 4);
  frame.set(payload, 8);
  return frame;
};

export type DoipFrame = { payloadType: number; payload: Buffer<ArrayBufferLike> };

/** Splits a byte stream into complete DoIP frames; returns the unconsumed remainder. */
export const parseDoipFrames = (
  buffer: Buffer<ArrayBufferLike>,
): { frames: DoipFrame[]; rest: Buffer<ArrayBufferLike> } => {
  const frames: DoipFrame[] = [];
  let rest = buffer;
  while (rest.length >= 8) {
    const length = rest.readUInt32BE(4);
    if (rest.length < 8 + length) break;
    frames.push({
      payloadType: rest.readUInt16BE(2),
      payload: Buffer.from(rest.subarray(8, 8 + length)),
    });
    rest = rest.subarray(8 + length);
  }
  return { frames, rest: Buffer.from(rest) };
};

const header = doipHeader;

/** Broadcasts a DoIP vehicle identification request and waits for the first announcement. */
export const discoverVehicle = (timeoutMs = 2000): Promise<VehicleAnnouncement> =>
  new Promise((resolve, reject) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("No DoIP vehicle announcement received (check VCI cable and ignition)"));
    }, timeoutMs);

    socket.on("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });

    socket.on("message", (message, remote) => {
      if (message.length < 40 || message.readUInt16BE(2) !== PAYLOAD.vehicleAnnouncement) return;
      const body = message.subarray(8);
      clearTimeout(timer);
      socket.close();
      resolve({
        vin: body.subarray(0, 17).toString("ascii").replace(/\0/g, "").trim(),
        logicalAddress: body.readUInt16BE(17),
        eid: bytesToHex(body.subarray(19, 25)),
        host: remote.address,
      });
    });

    socket.bind(DOIP_PORT, () => {
      socket.setBroadcast(true);
      const frame = header(PAYLOAD.vehicleIdentificationRequest, new Uint8Array());
      socket.send(frame, DOIP_PORT, "255.255.255.255");
    });
  });

type Waiter = {
  match: (payloadType: number, payload: Buffer) => boolean;
  resolve: (payload: Buffer) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * DoIP TCP client: routing activation plus diagnostic message exchange with an
 * ECU logical address. Applies P2 / P2* timing and handles NRC 0x78 (response
 * pending) plus DoIP acknowledge codes.
 */
export class DoipClient {
  private socket: Socket | null = null;

  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  private waiters: Waiter[] = [];

  private testerPresent: NodeJS.Timeout | null = null;

  private readonly host: string;

  private readonly sourceAddress: number;

  readonly timing: DoipTiming;

  constructor(host: string, sourceAddress: number, timing: DoipTiming = DEFAULT_TIMING) {
    this.host = host;
    this.sourceAddress = sourceAddress;
    this.timing = timing;
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  get testerPresentActive(): boolean {
    return this.testerPresent !== null;
  }

  async connect(timeoutMs = 3000): Promise<void> {
    if (this.connected) return;
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`DoIP gateway ${this.host}:${DOIP_PORT} did not accept the connection`));
      }, timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        socket.setNoDelay(true);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on("data", (chunk) => this.onData(chunk));
      socket.on("close", () => this.onClose());
      socket.connect(DOIP_PORT, this.host);
    });

    await this.activateRouting();
  }

  private onClose() {
    this.socket = null;
    this.stopTesterPresent();
    const error = new Error("DoIP connection closed");
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private onData(chunk: Buffer) {
    const { frames, rest } = parseDoipFrames(Buffer.concat([this.buffer, chunk]));
    this.buffer = rest;
    for (const frame of frames) this.dispatch(frame.payloadType, frame.payload);
  }

  private dispatch(payloadType: number, payload: Buffer) {
    if (payloadType === PAYLOAD.aliveCheckRequest) {
      const body = Buffer.alloc(2);
      body.writeUInt16BE(this.sourceAddress, 0);
      this.socket?.write(header(PAYLOAD.aliveCheckResponse, body));
      return;
    }
    const index = this.waiters.findIndex((waiter) => waiter.match(payloadType, payload));
    if (index < 0) return;
    const [waiter] = this.waiters.splice(index, 1);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiter.resolve(payload);
  }

  private wait(
    match: (payloadType: number, payload: Buffer) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs);
      this.waiters.push({ match, resolve, reject, timer });
    });
  }

  private async activateRouting(): Promise<void> {
    const body = Buffer.alloc(7);
    body.writeUInt16BE(this.sourceAddress, 0);
    body[2] = 0x00; // activation type: default
    const pending = this.wait(
      (type) => type === PAYLOAD.routingActivationResponse,
      3000,
      "routing activation response",
    );
    this.socket?.write(header(PAYLOAD.routingActivationRequest, body));
    const response = await pending;
    const code = response[4] ?? 0xff;
    if (code !== 0x10 && code !== 0x11) throw new DoipRoutingActivationError(code);
  }

  /**
   * True when a diagnostic frame belongs to this exchange: the ECU is the source and
   * this tester is the target. Without the target check, a frame addressed to another
   * tester on the same gateway would be accepted as our answer.
   */
  private isOurs(payload: Buffer, ecuAddress: number): boolean {
    if (payload.length < 4) return false;
    return payload.readUInt16BE(0) === ecuAddress && payload.readUInt16BE(2) === this.sourceAddress;
  }

  /** Sends a UDS request to a logical address and returns the positive response bytes. */
  async sendUds(target: number, data: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    if (!this.socket) throw new Error("DoIP client is not connected");
    const body = Buffer.alloc(4 + data.length);
    body.writeUInt16BE(this.sourceAddress, 0);
    body.writeUInt16BE(target, 2);
    body.set(data, 4);

    const service = data[0] ?? 0;
    const p2 = timeoutMs ?? this.timing.p2;
    const p2Star = Math.max(this.timing.p2Star, p2);

    const matchResponse = (type: number, payload: Buffer) =>
      (type === PAYLOAD.diagnosticMessage && this.isOurs(payload, target)) ||
      (type === PAYLOAD.diagnosticNegativeAck && this.isOurs(payload, target));

    const first = this.wait(matchResponse, p2, `response to service 0x${hex(service)}`);
    this.socket.write(header(PAYLOAD.diagnosticMessage, body));

    let payload = await first;
    for (;;) {
      if (payload.length >= 5 && payload.readUInt16BE(0) === target && this.isNack(payload)) {
        throw new DoipNegativeAckError(payload[4] ?? 0xff);
      }
      const uds = payload.subarray(4);
      if (uds[0] === 0x7f && uds[2] === 0x78) {
        // responsePending: the ECU asked for more time — extend to P2*.
        payload = await this.wait(matchResponse, p2Star, "pending response (P2*)");
        continue;
      }
      if (uds[0] === 0x7f) throw new UdsNegativeResponse(uds[1] ?? service, uds[2] ?? 0x10);
      if (uds[0] !== service + 0x40) {
        // Not our service id yet (e.g. an unrelated positive frame) — keep waiting.
        payload = await this.wait(matchResponse, p2Star, "diagnostic response");
        continue;
      }
      return new Uint8Array(uds);
    }
  }

  private isNack(payload: Buffer): boolean {
    // A NACK payload is exactly source(2) + target(2) + code(1).
    return payload.length === 5;
  }

  /** Keeps a non-default session alive with 3E 80 at S3/2. */
  startTesterPresent(target: number, intervalMs = Math.floor(this.timing.s3 / 2)) {
    this.stopTesterPresent();
    this.testerPresent = setInterval(() => {
      if (!this.socket) return;
      const body = Buffer.alloc(6);
      body.writeUInt16BE(this.sourceAddress, 0);
      body.writeUInt16BE(target, 2);
      body[4] = 0x3e;
      body[5] = 0x80;
      this.socket.write(header(PAYLOAD.diagnosticMessage, body));
    }, intervalMs);
    this.testerPresent.unref?.();
  }

  stopTesterPresent() {
    if (this.testerPresent) clearInterval(this.testerPresent);
    this.testerPresent = null;
  }

  close() {
    this.stopTesterPresent();
    this.socket?.destroy();
    this.socket = null;
  }
}
