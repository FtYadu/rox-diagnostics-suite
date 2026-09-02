import { createSocket } from "node:dgram";
import { Socket } from "node:net";

import { UdsNegativeResponse, bytesToHex } from "./uds.ts";

const PROTOCOL_VERSION = 0x02;
const DOIP_PORT = 13400;

const PAYLOAD = {
  vehicleIdentificationRequest: 0x0001,
  vehicleAnnouncement: 0x0004,
  routingActivationRequest: 0x0005,
  routingActivationResponse: 0x0006,
  aliveCheckRequest: 0x0007,
  diagnosticMessage: 0x8001,
  diagnosticPositiveAck: 0x8002,
  diagnosticNegativeAck: 0x8003,
} as const;

export type VehicleAnnouncement = {
  vin: string;
  logicalAddress: number;
  eid: string;
  host: string;
};

const header = (payloadType: number, payload: Uint8Array): Buffer => {
  const frame = Buffer.alloc(8 + payload.length);
  frame[0] = PROTOCOL_VERSION;
  frame[1] = PROTOCOL_VERSION ^ 0xff;
  frame.writeUInt16BE(payloadType, 2);
  frame.writeUInt32BE(payload.length, 4);
  frame.set(payload, 8);
  return frame;
};

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
 * ECU logical address. Handles 0x78 responsePending and negative acknowledgements.
 */
export class DoipClient {
  private socket: Socket | null = null;

  private buffer = Buffer.alloc(0);

  private waiters: Waiter[] = [];

  private testerPresent: NodeJS.Timeout | null = null;

  private readonly host: string;

  private readonly sourceAddress: number;

  constructor(host: string, sourceAddress: number) {
    this.host = host;
    this.sourceAddress = sourceAddress;
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
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
    if (this.testerPresent) clearInterval(this.testerPresent);
    this.testerPresent = null;
    const error = new Error("DoIP connection closed");
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const length = this.buffer.readUInt32BE(4);
      if (this.buffer.length < 8 + length) return;
      const payloadType = this.buffer.readUInt16BE(2);
      const payload = this.buffer.subarray(8, 8 + length);
      this.buffer = this.buffer.subarray(8 + length);
      this.dispatch(payloadType, Buffer.from(payload));
    }
  }

  private dispatch(payloadType: number, payload: Buffer) {
    if (payloadType === PAYLOAD.aliveCheckRequest) {
      const body = Buffer.alloc(2);
      body.writeUInt16BE(this.sourceAddress, 0);
      this.socket?.write(header(0x0008, body));
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
    if (code !== 0x10 && code !== 0x11) {
      throw new Error(`DoIP routing activation refused (code 0x${code.toString(16)})`);
    }
  }

  /** Sends a UDS request to a logical address and returns the positive response bytes. */
  async sendUds(target: number, data: Uint8Array, timeoutMs = 5000): Promise<Uint8Array> {
    if (!this.socket) throw new Error("DoIP client is not connected");
    const body = Buffer.alloc(4 + data.length);
    body.writeUInt16BE(this.sourceAddress, 0);
    body.writeUInt16BE(target, 2);
    body.set(data, 4);

    const service = data[0] ?? 0;
    const ackOrResponse = this.wait(
      (type, payload) =>
        (type === PAYLOAD.diagnosticMessage && payload.readUInt16BE(0) === target) ||
        type === PAYLOAD.diagnosticNegativeAck,
      timeoutMs,
      `response to service 0x${service.toString(16)}`,
    );
    this.socket.write(header(PAYLOAD.diagnosticMessage, body));

    let payload = await ackOrResponse;
    for (;;) {
      const uds = payload.subarray(4);
      if (uds[0] === 0x7f && uds[2] === 0x78) {
        // responsePending: keep waiting for the real answer.
        payload = await this.wait(
          (type, next) => type === PAYLOAD.diagnosticMessage && next.readUInt16BE(0) === target,
          Math.max(timeoutMs, 10_000),
          "pending response",
        );
        continue;
      }
      if (uds[0] === 0x7f) throw new UdsNegativeResponse(uds[1] ?? service, uds[2] ?? 0x10);
      if (uds[0] !== service + 0x40) {
        // Positive-response acknowledgement frames are skipped.
        payload = await this.wait(
          (type, next) => type === PAYLOAD.diagnosticMessage && next.readUInt16BE(0) === target,
          timeoutMs,
          "diagnostic response",
        );
        continue;
      }
      return new Uint8Array(uds);
    }
  }

  /** Keeps every session alive with 3E 80 while the technician works. */
  startTesterPresent(target: number, intervalMs = 2000) {
    if (this.testerPresent) clearInterval(this.testerPresent);
    this.testerPresent = setInterval(() => {
      if (!this.socket) return;
      const body = Buffer.alloc(6);
      body.writeUInt16BE(this.sourceAddress, 0);
      body.writeUInt16BE(target, 2);
      body[4] = 0x3e;
      body[5] = 0x80;
      this.socket.write(header(PAYLOAD.diagnosticMessage, body));
    }, intervalMs);
  }

  close() {
    if (this.testerPresent) clearInterval(this.testerPresent);
    this.testerPresent = null;
    this.socket?.destroy();
    this.socket = null;
  }
}
