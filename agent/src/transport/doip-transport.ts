import { DoipClient, type DoipTiming, discoverVehicle } from "../doip.ts";
import { bytesToHex } from "../uds.ts";
import {
  type Transport,
  TransportEmitter,
  type TransportEvent,
  type TransportTiming,
  type VciInfo,
  now,
} from "./types.ts";

export type DoipTransportOptions = {
  host?: string | undefined;
  sourceAddress: number;
  timing: DoipTiming;
  info: VciInfo;
  /** Injected in tests so no UDP discovery is needed. */
  client?: DoipClient;
};

/**
 * The production transport: ISO 13400 DoIP over TCP, wrapping the Batch 1 DoipClient so
 * routing activation, P2/P2*, NRC 0x78 handling, source+target matching and the typed
 * NACK errors all stay exactly as they were.
 */
export class DoipTransport implements Transport {
  readonly info: VciInfo;

  private readonly emitter = new TransportEmitter();

  private readonly options: DoipTransportOptions;

  private client: DoipClient | null;

  /** VIN from the vehicle announcement, when discovery was used. */
  vin = "";

  host = "";

  constructor(options: DoipTransportOptions) {
    this.options = options;
    this.info = options.info;
    this.client = options.client ?? null;
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  onEvent(cb: (event: TransportEvent) => void): void {
    this.emitter.onEvent(cb);
  }

  async open(): Promise<void> {
    if (this.client?.connected) return;
    if (!this.client) {
      const announcement = this.options.host
        ? { host: this.options.host, vin: "", logicalAddress: 0, eid: "" }
        : await discoverVehicle();
      this.vin = announcement.vin;
      this.host = announcement.host;
      this.client = new DoipClient(
        announcement.host,
        this.options.sourceAddress,
        this.options.timing,
      );
    }
    await this.client.connect();
    this.emitter.emit({ type: "connect", info: this.info, at: now() });
  }

  async close(): Promise<void> {
    this.client?.close();
    this.emitter.emit({ type: "disconnect", reason: "closed by agent", at: now() });
  }

  async send(target: number, bytes: Uint8Array, timing: TransportTiming): Promise<Uint8Array> {
    if (!this.client) throw new Error("DoIP transport is not open");
    this.emitter.emit({ type: "tx", target, hex: bytesToHex(bytes), at: now() });
    const response = await this.client.sendUds(target, bytes, timing.p2);
    this.emitter.emit({ type: "rx", target, hex: bytesToHex(response), at: now() });
    return response;
  }

  sendNoResponse(target: number, bytes: Uint8Array): void {
    this.client?.writeUds(target, bytes);
    this.emitter.emit({ type: "tx", target, hex: bytesToHex(bytes), at: now() });
  }

  startTesterPresent(target: number, intervalMs: number): void {
    this.client?.startTesterPresent(target, intervalMs);
  }

  stopTesterPresent(target?: number): void {
    this.client?.stopTesterPresent(target);
  }
}
