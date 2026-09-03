import { readFileSync } from "node:fs";

import { UdsNegativeResponse, bytesToHex, hexToBytes } from "../uds.ts";
import {
  type Transport,
  TransportEmitter,
  type TransportEvent,
  type TransportTiming,
  type VciInfo,
  now,
} from "./types.ts";

export type RecordedExchange = {
  target: number;
  /** Request bytes as hex, e.g. "22 F1 90". */
  request: string;
  /** Response bytes as hex; a 7F frame is replayed as a UdsNegativeResponse. */
  response: string;
  delayMs?: number;
  comment?: string;
};

export const REPLAY_VCI: VciInfo = {
  vciName: "ROX Replay",
  vciSerial: "REPLAY-0001",
  protocolList: ["DoIP"],
};

const normalize = (hex: string): string => bytesToHex(hexToBytes(hex));

/** Loads a JSONL recording (one RecordedExchange per line, `#` comments allowed). */
export const loadRecording = (path: string): RecordedExchange[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => JSON.parse(line) as RecordedExchange);

/**
 * Deterministic transport for tests: replays a recorded UDS session in order and fails
 * loudly when the code under test sends something the recording did not expect.
 */
export class ReplayTransport implements Transport {
  readonly info: VciInfo;

  private readonly emitter = new TransportEmitter();

  private readonly recording: RecordedExchange[];

  private cursor = 0;

  private open_ = false;

  readonly testerPresentTargets = new Set<number>();

  constructor(recording: RecordedExchange[], info: VciInfo = REPLAY_VCI) {
    this.recording = recording;
    this.info = info;
  }

  get connected(): boolean {
    return this.open_;
  }

  get remaining(): number {
    return this.recording.length - this.cursor;
  }

  onEvent(cb: (event: TransportEvent) => void): void {
    this.emitter.onEvent(cb);
  }

  async open(): Promise<void> {
    this.open_ = true;
    this.cursor = 0;
    this.emitter.emit({ type: "connect", info: this.info, at: now() });
  }

  async close(): Promise<void> {
    this.open_ = false;
    this.testerPresentTargets.clear();
    this.emitter.emit({ type: "disconnect", reason: "replay finished", at: now() });
  }

  async send(target: number, bytes: Uint8Array, _timing: TransportTiming): Promise<Uint8Array> {
    void _timing;
    if (!this.open_) throw new Error("ReplayTransport is not open");
    const sent = bytesToHex(bytes);
    const expected = this.recording[this.cursor];
    if (!expected) {
      throw new Error(`Replay exhausted: unexpected request ${sent} to 0x${target.toString(16)}`);
    }
    if (normalize(expected.request) !== sent || expected.target !== target) {
      throw new Error(
        `Replay mismatch at step ${this.cursor}:\n` +
          `  expected 0x${expected.target.toString(16)} ${normalize(expected.request)}\n` +
          `  actual   0x${target.toString(16)} ${sent}`,
      );
    }
    this.cursor += 1;
    this.emitter.emit({ type: "tx", target, hex: sent, at: now() });
    if (expected.delayMs) await new Promise((resolve) => setTimeout(resolve, expected.delayMs));

    const response = hexToBytes(expected.response);
    this.emitter.emit({ type: "rx", target, hex: bytesToHex(response), at: now() });
    if (response[0] === 0x7f) {
      throw new UdsNegativeResponse(response[1] ?? bytes[0] ?? 0, response[2] ?? 0x10);
    }
    return response;
  }

  sendNoResponse(target: number, bytes: Uint8Array): void {
    this.emitter.emit({ type: "tx", target, hex: bytesToHex(bytes), at: now() });
  }

  startTesterPresent(target: number, _intervalMs = 2000): void {
    this.testerPresentTargets.add(target);
  }

  stopTesterPresent(target?: number): void {
    if (target === undefined) this.testerPresentTargets.clear();
    else this.testerPresentTargets.delete(target);
  }
}
