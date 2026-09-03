import { dataChecksum as appDataChecksum } from "@/data/vehicle-data";
import type { Ecu, ProgrammingFlow, ServiceProcess } from "@/data/vehicle-data";
import type {
  BridgeCompatibility,
  ConnectionInfo,
  DiagnosticBridge,
  EcuDtcResult,
  FreezeFrame,
  IdentificationEntry,
  LiveDataSignal,
  ProgrammingProgressEvent,
  RoutineExecution,
  SecurityAccessResult,
  StepExecution,
} from "./types";

export const LOCAL_BRIDGE_URL = "ws://127.0.0.1:9097";

const CONNECT_TIMEOUT_MS = 2500;
const CALL_TIMEOUT_MS = 15_000;
const KEEPALIVE_MS = 4000;

export type LocalBridgeEvent =
  { type: "status"; info: ConnectionInfo } | { type: "disconnected"; reason: string };

/** Protocol version this app build speaks; the agent reports its own in `connect`. */
export const APP_PROTOCOL_VERSION = 2;

/**
 * A version or data mismatch is a warning, never a block: the technician still needs to
 * read fault codes on the car in front of them.
 */
export const compareHandshake = (info: ConnectionInfo): BridgeCompatibility => {
  const warnings: string[] = [];
  const agentProtocol = info.protocolVersion;
  if (agentProtocol === undefined) {
    warnings.push("The VCI agent did not report a protocol version — update the agent.");
  } else if (agentProtocol !== APP_PROTOCOL_VERSION) {
    warnings.push(
      `Agent speaks protocol v${agentProtocol}, this app speaks v${APP_PROTOCOL_VERSION}. ` +
        "Some functions may be unavailable until the agent is updated.",
    );
  }
  if (info.dataChecksum && appDataChecksum && info.dataChecksum !== appDataChecksum) {
    warnings.push(
      "Vehicle data differs between app and agent — regenerate the agent config from the same data set.",
    );
  }
  return { ok: warnings.length === 0, warnings };
};

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onEvent?: (payload: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
};

type BridgeMessage = {
  id?: string;
  type?: "result" | "event" | "error";
  payload?: unknown;
  message?: string;
};

const asString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.length > 0 ? value : fallback;

/** Agents differ slightly in field naming; normalise into ConnectionInfo. */
const normalizeInfo = (payload: unknown): ConnectionInfo => {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const voltage = Number(raw["batteryVoltage"] ?? raw["voltage"] ?? 0);
  return {
    mode: "local",
    vciName: asString(raw["vciName"] ?? raw["device"], ""),
    vciSerial: asString(raw["vciSerial"] ?? raw["serial"], "—"),
    protocol: asString(raw["protocol"], "DoIP / CAN FD"),
    batteryVoltage: Number.isFinite(voltage) ? voltage : 0,
    ignitionOn: Boolean(raw["ignitionOn"] ?? raw["ignition"]),
    ...(typeof raw["agentVersion"] === "string" ? { agentVersion: raw["agentVersion"] } : {}),
    ...(typeof raw["protocolVersion"] === "number"
      ? { protocolVersion: raw["protocolVersion"] }
      : {}),
    ...(typeof raw["dataChecksum"] === "string" || raw["dataChecksum"] === null
      ? { dataChecksum: raw["dataChecksum"] as string | null }
      : {}),
    ...(typeof raw["transport"] === "string" ? { transport: raw["transport"] } : {}),
  };
};

/**
 * WebSocket client for the local hardware agent. The agent exposes a small
 * JSON-RPC style protocol on ws://127.0.0.1:9097. When no agent is running the
 * connection fails fast and the app falls back to the simulator.
 */
export class LocalBridge implements DiagnosticBridge {
  readonly mode = "local" as const;

  private socket: WebSocket | null = null;

  private pending = new Map<string, PendingEntry>();

  private counter = 0;

  private keepAlive: ReturnType<typeof setInterval> | null = null;

  private closedByUs = false;

  private listeners = new Set<(event: LocalBridgeEvent) => void>();

  /** Subscribe to connection lifecycle events (status/battery updates, drops). */
  subscribe(listener: (event: LocalBridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: LocalBridgeEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private async socketReady(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return this.socket;
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket unavailable in this environment");
    }

    return new Promise<WebSocket>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(LOCAL_BRIDGE_URL);
      } catch {
        reject(new Error("Local bridge agent unreachable on 127.0.0.1:9097"));
        return;
      }

      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Local bridge agent did not respond on 127.0.0.1:9097"));
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve(socket);
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Local bridge agent unreachable on 127.0.0.1:9097"));
      };
      socket.onclose = () => {
        clearTimeout(timer);
        this.socket = null;
        this.stopKeepAlive();
        this.pending.forEach((entry) => entry.reject(new Error("Local bridge connection closed")));
        this.pending.clear();
        if (!this.closedByUs) {
          this.emit({ type: "disconnected", reason: "VCI bridge agent connection lost" });
        }
      };
      socket.onmessage = (event) => this.handleMessage(event);
    });
  }

  private handleMessage(event: MessageEvent<string>) {
    let message: BridgeMessage;
    try {
      message = JSON.parse(event.data) as BridgeMessage;
    } catch {
      return;
    }

    if (!message.id) {
      // Unsolicited agent push, e.g. VCI unplugged or voltage change.
      if (message.type === "event" && message.payload) {
        this.emit({ type: "status", info: normalizeInfo(message.payload) });
      }
      return;
    }

    const entry = this.pending.get(message.id);
    if (!entry) return;

    if (message.type === "event") {
      entry.onEvent?.(message.payload);
      return;
    }
    this.pending.delete(message.id);
    if (entry.timer) clearTimeout(entry.timer);
    if (message.type === "error") {
      entry.reject(new Error(message.message ?? "Local bridge error"));
      return;
    }
    entry.resolve(message.payload);
  }

  private async call<T>(
    method: string,
    params: Record<string, unknown>,
    onEvent?: (payload: unknown) => void,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<T> {
    const socket = await this.socketReady();
    this.counter += 1;
    const id = `${Date.now()}-${this.counter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = onEvent
        ? undefined
        : setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`Local bridge timed out on ${method}`));
          }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          if (timer) clearTimeout(timer);
          resolve(value as T);
        },
        reject: (reason) => {
          if (timer) clearTimeout(timer);
          reject(reason);
        },
        ...(onEvent ? { onEvent } : {}),
        ...(timer ? { timer } : {}),
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    if (typeof setInterval === "undefined") return;
    this.keepAlive = setInterval(() => {
      void this.call<unknown>("status", {}, undefined, 4000)
        .then((payload) => {
          if (payload) this.emit({ type: "status", info: normalizeInfo(payload) });
        })
        .catch((cause: unknown) => {
          this.emit({
            type: "disconnected",
            reason: cause instanceof Error ? cause.message : "VCI bridge agent stopped responding",
          });
          this.close();
        });
    }, KEEPALIVE_MS);
  }

  private stopKeepAlive() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  /** Closes the socket without emitting a disconnect event. */
  close() {
    this.closedByUs = true;
    this.stopKeepAlive();
    this.socket?.close();
    this.socket = null;
  }

  async connect(): Promise<ConnectionInfo> {
    this.closedByUs = false;
    const payload = await this.call<unknown>("connect", {}, undefined, CONNECT_TIMEOUT_MS);
    const info = normalizeInfo(payload);
    if (!info.vciName) {
      throw new Error("No VCI reported by the local bridge agent");
    }
    this.startKeepAlive();
    return info;
  }

  readIdentification(ecu: Ecu): Promise<IdentificationEntry[]> {
    return this.call<IdentificationEntry[]>("readIdentification", { ecu: ecu.id });
  }

  readDtcs(ecu: Ecu): Promise<EcuDtcResult> {
    return this.call<EcuDtcResult>("readDtcs", { ecu: ecu.id });
  }

  clearDtcs(ecu: Ecu, codes?: string[]): Promise<{ cleared: number }> {
    return this.call<{ cleared: number }>("clearDtcs", { ecu: ecu.id, codes: codes ?? null });
  }

  readFreezeFrame(ecu: Ecu, code: string): Promise<FreezeFrame> {
    return this.call<FreezeFrame>("readFreezeFrame", { ecu: ecu.id, code });
  }

  readLiveData(ecu: Ecu, dids: string[]): Promise<LiveDataSignal[]> {
    return this.call<LiveDataSignal[]>("readLiveData", { ecu: ecu.id, dids });
  }

  requestSecurityAccess(ecu: Ecu, level: number): Promise<SecurityAccessResult> {
    return this.call<SecurityAccessResult>("requestSecurityAccess", { ecu: ecu.id, level });
  }

  executeStep(
    process: ServiceProcess,
    stepIndex: number,
    label: string,
    input?: string,
  ): Promise<StepExecution> {
    return this.call<StepExecution>("executeStep", {
      ecu: process.ecu,
      process: process.name,
      stepIndex,
      label,
      input: input ?? null,
    });
  }

  runRoutine(
    ecu: Ecu,
    routine: string,
    action: "start" | "stop" | "status",
  ): Promise<RoutineExecution> {
    return this.call<RoutineExecution>("runRoutine", { ecu: ecu.id, routine, action });
  }

  /** Runs a canonical guided process on the agent, streaming its events. */
  runProcess(
    processId: string,
    options: {
      variables?: Record<string, string | number | boolean>;
      dryRun?: boolean;
      jobId?: string;
      onEvent: (event: unknown) => void;
    },
  ): Promise<{
    runId: string;
    ok: boolean;
    message: string;
    executed: number;
    prompts: number;
  }> {
    return this.call(
      "runProcess",
      {
        processId,
        variables: options.variables ?? {},
        dryRun: options.dryRun ?? false,
        jobId: options.jobId ?? null,
      },
      (payload) => options.onEvent(payload),
      600_000,
    );
  }

  provideInput(runId: string, value: string): Promise<{ accepted: boolean }> {
    return this.call<{ accepted: boolean }>("provideInput", { runId, value });
  }

  abortProcess(runId: string): Promise<{ aborted: boolean }> {
    return this.call<{ aborted: boolean }>("abortProcess", { runId });
  }

  startProgramming(
    flow: ProgrammingFlow,
    pkg: string,
    onProgress: (event: ProgrammingProgressEvent) => void,
  ): Promise<{ ok: boolean; message: string }> {
    return this.call<{ ok: boolean; message: string }>(
      "startProgramming",
      { flow: flow.name, pkg },
      (payload) => onProgress(payload as ProgrammingProgressEvent),
    );
  }
}
