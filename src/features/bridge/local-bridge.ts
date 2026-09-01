import type { Ecu, ProgrammingFlow, ServiceProcess } from "@/data/vehicle-data";
import type {
  ConnectionInfo,
  DiagnosticBridge,
  EcuDtcResult,
  IdentificationEntry,
  LiveDataSignal,
  ProcessStepEvent,
  ProgrammingProgressEvent,
} from "./types";

export const LOCAL_BRIDGE_URL = "ws://127.0.0.1:9097";

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onEvent?: (payload: unknown) => void;
};

type BridgeMessage = {
  id?: string;
  type?: "result" | "event" | "error";
  payload?: unknown;
  message?: string;
};

/**
 * WebSocket client for the future local hardware agent. The agent is expected to
 * expose a tiny JSON-RPC style protocol on ws://127.0.0.1:9097. When no agent is
 * running the connection fails fast and the app falls back to the simulator.
 */
export class LocalBridge implements DiagnosticBridge {
  readonly mode = "local" as const;

  private socket: WebSocket | null = null;

  private pending = new Map<string, PendingEntry>();

  private counter = 0;

  private async socketReady(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return this.socket;
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket unavailable in this environment");
    }

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(LOCAL_BRIDGE_URL);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Local bridge agent did not respond on 127.0.0.1:9097"));
      }, 2500);

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
        this.socket = null;
        this.pending.forEach((entry) => entry.reject(new Error("Local bridge connection closed")));
        this.pending.clear();
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
    if (!message.id) return;
    const entry = this.pending.get(message.id);
    if (!entry) return;

    if (message.type === "event") {
      entry.onEvent?.(message.payload);
      return;
    }
    this.pending.delete(message.id);
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
  ): Promise<T> {
    const socket = await this.socketReady();
    this.counter += 1;
    const id = `${Date.now()}-${this.counter}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        ...(onEvent ? { onEvent } : {}),
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  connect(): Promise<ConnectionInfo> {
    return this.call<ConnectionInfo>("connect", {});
  }

  readIdentification(ecu: Ecu): Promise<IdentificationEntry[]> {
    return this.call<IdentificationEntry[]>("readIdentification", { ecu: ecu.id });
  }

  readDtcs(ecu: Ecu): Promise<EcuDtcResult> {
    return this.call<EcuDtcResult>("readDtcs", { ecu: ecu.id });
  }

  clearDtcs(ecu: Ecu): Promise<{ cleared: number }> {
    return this.call<{ cleared: number }>("clearDtcs", { ecu: ecu.id });
  }

  readLiveData(ecu: Ecu, dids: string[]): Promise<LiveDataSignal[]> {
    return this.call<LiveDataSignal[]>("readLiveData", { ecu: ecu.id, dids });
  }

  runProcess(
    process: ServiceProcess,
    onStep: (event: ProcessStepEvent) => void,
  ): Promise<{ ok: boolean; message: string }> {
    return this.call<{ ok: boolean; message: string }>(
      "runProcess",
      { ecu: process.ecu, process: process.name },
      (payload) => onStep(payload as ProcessStepEvent),
    );
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
