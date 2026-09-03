import { readFileSync } from "node:fs";

import { DoipClient } from "./doip.ts";
import {
  type SignalConfig,
  dtcMeta,
  dtcStatusMask,
  ecuConfig,
  loadConfig,
  parseHex,
} from "./config.ts";
import {
  SID,
  UdsNegativeResponse,
  bytesToHex,
  classifyDtc,
  decodeAscii,
  decodeNumber,
  decodeStatusByte,
  encodeDtc,
  hex,
  hexToBytes,
  parseDidResponse,
  parseDtcResponse,
  request,
} from "./uds.ts";

export type TraceLine = { id: string; direction: "tx" | "rx" | "info"; text: string; at: string };

let traceCounter = 0;

const traceLine = (direction: TraceLine["direction"], text: string): TraceLine => {
  traceCounter += 1;
  return { id: `t${traceCounter}`, direction, text, at: new Date().toISOString() };
};

const decodeSignal = (signal: SignalConfig, raw: Uint8Array): number | string => {
  if (signal.encoding === "ascii") return decodeAscii(raw);
  if (signal.encoding === "hex") return bytesToHex(raw);
  const value =
    decodeNumber(raw, signal.signed ?? false) * (signal.factor ?? 1) + (signal.offset ?? 0);
  return Number.parseFloat(value.toFixed(3));
};

/**
 * High-level UDS operations for one vehicle. Every call records the real Tx/Rx
 * frames so the app's Trace console shows exactly what went on the bus.
 */
export class VehicleSession {
  readonly trace: TraceLine[] = [];

  private readonly client: DoipClient;

  /** ECU ids currently held in a non-default session (tester-present is running). */
  private readonly keptAlive = new Set<string>();

  private idleTimer: NodeJS.Timeout | null = null;

  constructor(client: DoipClient) {
    this.client = client;
  }

  private push(line: TraceLine) {
    this.trace.push(line);
    if (this.trace.length > 500) this.trace.splice(0, this.trace.length - 500);
  }

  private get timing() {
    return loadConfig().timing;
  }

  /** Sends one UDS request and traces both directions. P2/P2* come from config. */
  async send(ecuId: string, data: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    const address = parseHex(ecuConfig(ecuId).address);
    this.push(traceLine("tx", `${ecuId} ${bytesToHex(data)}`));
    this.touch();
    try {
      const response = await this.client.sendUds(address, data, timeoutMs);
      this.push(traceLine("rx", `${ecuId} ${bytesToHex(response)}`));
      return response;
    } catch (error) {
      const text =
        error instanceof UdsNegativeResponse
          ? `${ecuId} 7F ${hex(data[0] ?? 0)} ${hex(error.nrc)} — ${error.meaning}`
          : `${ecuId} ${(error as Error).message}`;
      this.push(traceLine("rx", text));
      throw error;
    }
  }

  takeTrace(): TraceLine[] {
    return this.trace.splice(0);
  }

  /** Drops the session keep-alive when the technician stops working (4 × S3). */
  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.keptAlive.size === 0) return;
    this.idleTimer = setTimeout(() => {
      this.push(traceLine("info", "idle — stopping tester present, session falls back to default"));
      this.stopKeepAlive();
    }, this.timing.s3 * 4);
    this.idleTimer.unref?.();
  }

  private stopKeepAlive() {
    this.keptAlive.clear();
    this.client.stopTesterPresent();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /**
   * Any session other than default (0x01) must be refreshed inside S3, otherwise the ECU
   * silently drops back to default halfway through a routine.
   */
  async enterSession(ecuId: string, level: 0x01 | 0x03 | 0x02 = 0x03): Promise<void> {
    await this.send(ecuId, request(SID.diagnosticSessionControl, level));
    if (level === 0x01) {
      this.stopKeepAlive();
      return;
    }
    this.keptAlive.add(ecuId);
    this.client.startTesterPresent(
      parseHex(ecuConfig(ecuId).address),
      Math.max(Math.floor(this.timing.s3 / 2), 200),
    );
    this.push(traceLine("info", `${ecuId} session 0x${hex(level)} held with 3E 80`));
    this.touch();
  }

  /** Called on disconnect: stop keep-alive so nothing keeps writing to a dead socket. */
  dispose() {
    this.stopKeepAlive();
  }

  async readIdentification(ecuId: string) {
    const signals = ecuConfig(ecuId).identification ?? [];
    const entries: Array<{ did: string; label: string; value: string }> = [];
    for (const signal of signals) {
      try {
        const response = await this.send(ecuId, request(SID.readDataByIdentifier, signal.did));
        const lengths = new Map([[signal.did.toUpperCase(), signal.length ?? response.length - 3]]);
        const values = parseDidResponse(response, lengths);
        const raw = values.get(signal.did.toUpperCase()) ?? response.slice(3);
        entries.push({
          did: signal.did.toUpperCase(),
          label: signal.label,
          value: String(decodeSignal({ ...signal, encoding: signal.encoding ?? "ascii" }, raw)),
        });
      } catch (error) {
        entries.push({
          did: signal.did.toUpperCase(),
          label: signal.label,
          value: error instanceof UdsNegativeResponse ? error.message : "not available",
        });
      }
    }
    return entries;
  }

  /**
   * 19 02 <mask> with the mask that belongs to this ECU, then classify each record from
   * its real status bits — nothing here is simulated.
   */
  async readDtcs(ecuId: string) {
    const mask = dtcStatusMask(ecuId);
    const response = await this.send(
      ecuId,
      request(SID.readDtcInformation, 0x02, mask),
      this.timing.p2Star,
    );
    const now = new Date().toISOString();
    const dtcs = parseDtcResponse(response).map((raw) => {
      const meta = dtcMeta(ecuId, raw.code);
      const status = decodeStatusByte(raw.statusByte);
      return {
        code: raw.code,
        name: meta?.name ?? "Unknown fault code (not in vehicle data)",
        severity: meta?.severity ?? 2,
        ecuId,
        status,
        state: classifyDtc(raw.statusByte),
        statusByte: `0x${hex(raw.statusByte)}`,
        statusMask: `0x${hex(mask)}`,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
      };
    });
    return { ecuId, responded: true, statusMask: `0x${hex(mask)}`, dtcs };
  }

  async clearDtcs(ecuId: string, codes?: string[] | null) {
    if (!codes || codes.length === 0) {
      await this.send(ecuId, request(SID.clearDiagnosticInformation, "FF FF FF"), 10_000);
      return { cleared: -1 };
    }
    let cleared = 0;
    for (const code of codes) {
      await this.send(ecuId, request(SID.clearDiagnosticInformation, encodeDtc(code)), 10_000);
      cleared += 1;
    }
    return { cleared };
  }

  async readFreezeFrame(ecuId: string, code: string) {
    const response = await this.send(
      ecuId,
      request(SID.readDtcInformation, 0x06, encodeDtc(code), 0xff),
      this.timing.p2Star,
    );
    // 59 06 <3 DTC bytes> <status> <recordNumber> <numberOfIdentifiers> [DID(2) value...]
    const recordNumber = response[6] ?? 0xff;
    const layout = ecuConfig(ecuId).snapshot ?? [];
    const entries: Array<{ label: string; value: string; unit: string }> = [];
    let index = 8;
    while (index + 2 <= response.length) {
      const did = `${hex(response[index] ?? 0)}${hex(response[index + 1] ?? 0)}`;
      index += 2;
      const signal = layout.find((entry) => entry.did.toUpperCase() === did);
      const length = signal?.length ?? 1;
      const raw = response.slice(index, index + length);
      index += length;
      entries.push({
        label: signal?.label ?? `DID ${did}`,
        value: String(signal ? decodeSignal(signal, raw) : bytesToHex(raw)),
        unit: signal?.unit ?? "",
      });
    }
    return {
      code,
      ecuId,
      recordNumber: `0x${hex(recordNumber)}`,
      recordedAt: new Date().toISOString(),
      entries,
    };
  }

  async readLiveData(ecuId: string, dids: string[]) {
    const catalog = ecuConfig(ecuId).liveData ?? [];
    const wanted =
      dids.length > 0 ? dids.map((did) => did.toUpperCase()) : catalog.map((s) => s.did);
    const signals: Array<{
      id: string;
      label: string;
      value: number;
      unit: string;
      min: number;
      max: number;
    }> = [];

    for (const did of wanted) {
      const signal = catalog.find((entry) => entry.did.toUpperCase() === did.toUpperCase());
      if (!signal) continue;
      try {
        const response = await this.send(
          ecuId,
          request(SID.readDataByIdentifier, signal.did),
          this.timing.p2Star,
        );
        const raw = response.slice(3, 3 + (signal.length ?? response.length - 3));
        const value = decodeSignal(signal, raw);
        signals.push({
          id: signal.did.toUpperCase(),
          label: signal.label,
          value: typeof value === "number" ? value : Number.NaN,
          unit: signal.unit ?? "",
          min: signal.min ?? 0,
          max: signal.max ?? 100,
        });
      } catch {
        // A parameter that is not supported in the current state is skipped, not fatal.
      }
    }
    return signals;
  }

  async securityAccess(ecuId: string, level: number) {
    const config = ecuConfig(ecuId);
    const levels = config.security?.levels;
    if (levels && levels.length > 0 && !levels.includes(level)) {
      throw new Error(
        `${ecuId} does not support security level ${level} (supported: ${levels.join(", ")})`,
      );
    }
    const rule = config.security?.algorithms?.[String(level)] ?? { algorithm: "invert" as const };
    const subFunction = level === 0 ? 0x01 : level * 2 - 1;

    await this.enterSession(ecuId, level >= 17 ? 0x02 : 0x03);
    const seedResponse = await this.send(ecuId, request(SID.securityAccess, subFunction));
    const seed = seedResponse.slice(2);
    if (seed.every((byte) => byte === 0)) {
      this.push(traceLine("info", `${ecuId} already unlocked at level ${level}`));
      return { ok: true, level };
    }
    const mask = rule.mask ? hexToBytes(rule.mask) : new Uint8Array(seed.length).fill(0xff);
    const key = seed.map((byte, index) => {
      const maskByte = mask[index % Math.max(mask.length, 1)] ?? 0xff;
      if (rule.algorithm === "xor") return (byte ^ maskByte) & 0xff;
      if (rule.algorithm === "add") return (byte + maskByte) & 0xff;
      return ~byte & 0xff;
    });
    await this.send(ecuId, request(SID.securityAccess, subFunction + 1, Uint8Array.from(key)));
    return { ok: true, level };
  }

  async runRoutine(ecuId: string, routine: string, action: "start" | "stop" | "status") {
    const rid = ecuConfig(ecuId).routines?.[routine];
    if (!rid) {
      throw new Error(
        `No routine identifier mapped for "${routine}" on ${ecuId} (agent/config.json)`,
      );
    }
    const subFunction = action === "start" ? 0x01 : action === "stop" ? 0x02 : 0x03;
    const response = await this.send(
      ecuId,
      request(SID.routineControl, subFunction, rid.replace(/0x/i, "")),
      20_000,
    );
    return { routineStatus: bytesToHex(response.slice(4)) };
  }

  /** Raw request escape hatch used by configured guided-process steps. */
  async sendRaw(ecuId: string, hexRequest: string) {
    const response = await this.send(ecuId, hexToBytes(hexRequest), 20_000);
    return bytesToHex(response);
  }

  /** 34/36/37 flash download of a package file, reporting block progress. */
  async downloadPackage(
    ecuId: string,
    filePath: string,
    onProgress: (percent: number, message: string) => void,
  ) {
    const data = readFileSync(filePath);
    const sizeBytes = Uint8Array.from([
      (data.length >> 24) & 0xff,
      (data.length >> 16) & 0xff,
      (data.length >> 8) & 0xff,
      data.length & 0xff,
    ]);
    const response = await this.send(
      ecuId,
      request(SID.requestDownload, 0x00, 0x44, "00 00 00 00", sizeBytes),
      15_000,
    );
    const lengthFormat = (response[1] ?? 0x20) >> 4;
    let maxBlock = 0;
    for (let i = 0; i < lengthFormat; i += 1) maxBlock = maxBlock * 256 + (response[2 + i] ?? 0);
    const chunkSize = Math.max(maxBlock - 2, 256);

    let counter = 1;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, offset + chunkSize);
      await this.send(
        ecuId,
        request(SID.transferData, counter & 0xff, new Uint8Array(chunk)),
        20_000,
      );
      counter += 1;
      onProgress(
        Math.round(((offset + chunk.length) / data.length) * 100),
        `Transferred ${offset + chunk.length} / ${data.length} bytes`,
      );
    }
    await this.send(ecuId, request(SID.requestTransferExit), 20_000);
  }

  async readVehicleStatus(): Promise<{ batteryVoltage: number; ignitionOn: boolean }> {
    const status = loadConfig().vehicleStatus;
    if (!status) return { batteryVoltage: 0, ignitionOn: false };
    const read = async (signal?: SignalConfig) => {
      if (!signal) return undefined;
      const response = await this.send(
        status.ecu,
        request(SID.readDataByIdentifier, signal.did),
        this.timing.p2Star,
      );
      const raw = response.slice(3, 3 + (signal.length ?? response.length - 3));
      const value = decodeSignal(signal, raw);
      return typeof value === "number" ? value : Number(value);
    };
    try {
      const voltage = await read(status.batteryVoltage);
      const ignition = await read(status.ignition);
      return {
        batteryVoltage: voltage ?? 0,
        ignitionOn: (ignition ?? 0) > 0,
      };
    } catch {
      return { batteryVoltage: 0, ignitionOn: false };
    }
  }
}
