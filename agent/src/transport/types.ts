import type { BusKind, TransportEvent, VciInfo } from "../../../packages/protocol/src/index.ts";

export type { BusKind, TransportEvent, VciInfo };

export type TransportTiming = { p2: number; p2Star: number };

/**
 * Everything the diagnostic layer needs from a piece of hardware. Swapping DoIP for
 * J2534 — or for a recorded session in tests — must not change one line of UDS logic.
 */
export interface Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  /** Sends a UDS request to a logical address and resolves with the positive response. */
  send(target: number, bytes: Uint8Array, timing: TransportTiming): Promise<Uint8Array>;
  /** Fire-and-forget write (tester present with suppressPosRspMsgIndicationBit). */
  sendNoResponse(target: number, bytes: Uint8Array): void;
  onEvent(cb: (event: TransportEvent) => void): void;
  /** Per-ECU S3 keep-alive. */
  startTesterPresent(target: number, intervalMs: number): void;
  stopTesterPresent(target?: number): void;
  readonly connected: boolean;
  readonly info: VciInfo;
}

export const now = (): string => new Date().toISOString();

export class TransportUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportUnavailableError";
  }
}

/** Shared event fan-out so every transport behaves the same way. */
export class TransportEmitter {
  private listeners: Array<(event: TransportEvent) => void> = [];

  onEvent(cb: (event: TransportEvent) => void): void {
    this.listeners.push(cb);
  }

  emit(event: TransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
