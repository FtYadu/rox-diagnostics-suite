import { bytesToHex } from "../uds.ts";
import {
  type Transport,
  TransportEmitter,
  type TransportEvent,
  TransportUnavailableError,
  type TransportTiming,
  type VciInfo,
  now,
} from "./types.ts";

export type J2534Options = {
  dllPath: string;
  protocol: "ISO15765" | "DoIP";
  sourceAddress: number;
};

/** SAE J2534-1 protocol ids for the two buses ROX VCIs expose. */
const PROTOCOL_ID: Record<J2534Options["protocol"], number> = {
  ISO15765: 0x06,
  DoIP: 0x0d,
};

type PassThru = {
  PassThruOpen: (name: unknown, deviceId: unknown) => number;
  PassThruClose: (deviceId: number) => number;
  PassThruConnect: (
    deviceId: number,
    protocolId: number,
    flags: number,
    baud: number,
    channelId: unknown,
  ) => number;
  PassThruDisconnect: (channelId: number) => number;
  PassThruWriteMsgs: (channelId: number, msgs: unknown, count: unknown, timeout: number) => number;
  PassThruReadMsgs: (channelId: number, msgs: unknown, count: unknown, timeout: number) => number;
};

/**
 * Windows-only PassThru transport. The vendor DLL is loaded lazily through koffi so that
 * importing this module never throws on Linux/macOS or in CI — `open()` is the only place
 * that can fail, and it fails with a message a technician can act on.
 */
export class J2534Transport implements Transport {
  readonly info: VciInfo;

  private readonly emitter = new TransportEmitter();

  private readonly options: J2534Options;

  private lib: PassThru | null = null;

  private deviceId = 0;

  private channelId = 0;

  private readonly keepAlive = new Map<number, NodeJS.Timeout>();

  constructor(options: J2534Options) {
    this.options = options;
    this.info = {
      vciName: "J2534 PassThru VCI",
      vciSerial: "unknown",
      protocolList: [options.protocol === "DoIP" ? "DoIP" : "ISO15765"],
    };
  }

  get connected(): boolean {
    return this.channelId !== 0;
  }

  onEvent(cb: (event: TransportEvent) => void): void {
    this.emitter.onEvent(cb);
  }

  static available(dllPath?: string): boolean {
    return process.platform === "win32" && Boolean(dllPath);
  }

  async open(): Promise<void> {
    if (process.platform !== "win32") {
      throw new TransportUnavailableError(
        "J2534 not available on this platform — PassThru DLLs are Windows only. " +
          'Set transport.kind to "doip" in agent/config.json.',
      );
    }
    if (!this.options.dllPath) {
      throw new TransportUnavailableError(
        "J2534 not available: transport.j2534.dllPath is not set in agent/config.json.",
      );
    }

    let koffi: {
      load: (path: string) => { func: (signature: string) => unknown };
    };
    try {
      koffi = (await import("koffi")) as unknown as typeof koffi;
    } catch {
      throw new TransportUnavailableError(
        "J2534 not available: the optional `koffi` dependency is not installed. " +
          "Run `npm install koffi` inside agent/ on the Windows PC.",
      );
    }

    let lib: { func: (signature: string) => unknown };
    try {
      lib = koffi.load(this.options.dllPath);
    } catch (error) {
      throw new TransportUnavailableError(
        `J2534 not available: cannot load ${this.options.dllPath} — ${(error as Error).message}`,
      );
    }

    this.lib = {
      PassThruOpen: lib.func("long PassThruOpen(void *pName, uint32_t *pDeviceID)") as never,
      PassThruClose: lib.func("long PassThruClose(uint32_t DeviceID)") as never,
      PassThruConnect: lib.func(
        "long PassThruConnect(uint32_t DeviceID, uint32_t ProtocolID, uint32_t Flags, uint32_t Baud, uint32_t *pChannelID)",
      ) as never,
      PassThruDisconnect: lib.func("long PassThruDisconnect(uint32_t ChannelID)") as never,
      PassThruWriteMsgs: lib.func(
        "long PassThruWriteMsgs(uint32_t ChannelID, void *pMsg, uint32_t *pNumMsgs, uint32_t Timeout)",
      ) as never,
      PassThruReadMsgs: lib.func(
        "long PassThruReadMsgs(uint32_t ChannelID, void *pMsg, uint32_t *pNumMsgs, uint32_t Timeout)",
      ) as never,
    };

    const status = this.lib.PassThruOpen(null, [0]);
    if (status !== 0) throw new TransportUnavailableError(`PassThruOpen failed (${status})`);
    const connect = this.lib.PassThruConnect(
      this.deviceId,
      PROTOCOL_ID[this.options.protocol],
      0,
      500_000,
      [0],
    );
    if (connect !== 0) throw new TransportUnavailableError(`PassThruConnect failed (${connect})`);
    this.emitter.emit({ type: "connect", info: this.info, at: now() });
  }

  async close(): Promise<void> {
    this.stopTesterPresent();
    if (this.lib && this.channelId) this.lib.PassThruDisconnect(this.channelId);
    if (this.lib && this.deviceId) this.lib.PassThruClose(this.deviceId);
    this.channelId = 0;
    this.deviceId = 0;
    this.emitter.emit({ type: "disconnect", reason: "closed by agent", at: now() });
  }

  async send(target: number, bytes: Uint8Array, timing: TransportTiming): Promise<Uint8Array> {
    if (!this.lib) throw new TransportUnavailableError("J2534 transport is not open");
    this.emitter.emit({ type: "tx", target, hex: bytesToHex(bytes), at: now() });
    const buffer = new Uint8Array(4 + bytes.length);
    buffer[0] = (target >> 8) & 0xff;
    buffer[1] = target & 0xff;
    buffer[2] = (this.options.sourceAddress >> 8) & 0xff;
    buffer[3] = this.options.sourceAddress & 0xff;
    buffer.set(bytes, 4);
    const write = this.lib.PassThruWriteMsgs(this.channelId, buffer, [1], timing.p2);
    if (write !== 0) throw new Error(`PassThruWriteMsgs failed (${write})`);
    const inbound = new Uint8Array(4096);
    const read = this.lib.PassThruReadMsgs(this.channelId, inbound, [1], timing.p2Star);
    if (read !== 0) throw new Error(`PassThruReadMsgs failed (${read})`);
    const response = inbound.slice(4);
    this.emitter.emit({ type: "rx", target, hex: bytesToHex(response), at: now() });
    return response;
  }

  sendNoResponse(target: number, bytes: Uint8Array): void {
    if (!this.lib) return;
    void this.send(target, bytes, { p2: 100, p2Star: 100 }).catch(() => undefined);
  }

  startTesterPresent(target: number, intervalMs: number): void {
    this.stopTesterPresent(target);
    const timer = setInterval(
      () => this.sendNoResponse(target, Uint8Array.of(0x3e, 0x80)),
      intervalMs,
    );
    timer.unref?.();
    this.keepAlive.set(target, timer);
  }

  stopTesterPresent(target?: number): void {
    if (target === undefined) {
      for (const timer of this.keepAlive.values()) clearInterval(timer);
      this.keepAlive.clear();
      return;
    }
    const timer = this.keepAlive.get(target);
    if (timer) clearInterval(timer);
    this.keepAlive.delete(target);
  }
}
