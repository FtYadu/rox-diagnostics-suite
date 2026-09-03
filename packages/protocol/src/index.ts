/**
 * Shared wire contract between the browser app (LocalBridge) and the local hardware
 * agent on ws://127.0.0.1:9097. Types only — this module must stay dependency-free so
 * both the Worker/browser bundle and the Node agent can import it.
 *
 * See agent/PROTOCOL.md for the documented methods and examples.
 */

export const PROTOCOL_VERSION = 2;

export type BusKind = "DoIP" | "CAN" | "CANFD" | "ISO15765";

export type TransportKind = "doip" | "j2534" | "replay";

export type VciInfo = {
  vciName: string;
  vciSerial: string;
  protocolList: BusKind[];
};

/* ------------------------------------------------------------------ envelopes */

export type AgentRequest = {
  id: string;
  method: AgentMethod;
  params?: Record<string, unknown>;
};

export type AgentResult<T = unknown> = { id: string; type: "result"; payload: T };
export type AgentError = { id?: string; type: "error"; message: string };
export type AgentEvent<T = unknown> = { id?: string; type: "event"; payload: T };

export type AgentMethod =
  | "connect"
  | "status"
  | "readIdentification"
  | "readDtcs"
  | "clearDtcs"
  | "readFreezeFrame"
  | "readLiveData"
  | "requestSecurityAccess"
  | "executeStep"
  | "runRoutine"
  | "startProgramming"
  | "runProcess"
  | "provideInput"
  | "abortProcess"
  | "scanVehicle"
  | "getJobLog";

/* ------------------------------------------------------------------ connect */

/** Reply to `connect` / `status`. Protocol v2 adds the version handshake fields. */
export type ConnectReply = {
  mode: "local";
  agentVersion: string;
  protocolVersion: number;
  dataChecksum: string | null;
  vci: VciInfo;
  transport: TransportKind;
  /** Legacy flat fields kept so an older app build still shows the VCI. */
  vciName: string;
  vciSerial: string;
  protocol: string;
  vin: string;
  batteryVoltage: number;
  ignitionOn: boolean;
};

/* ------------------------------------------------------------------ transport events */

export type TransportEvent =
  | { type: "tx"; target: number; hex: string; at: string }
  | { type: "rx"; target: number; hex: string; at: string }
  | { type: "info"; text: string; at: string }
  | { type: "connect"; info: VciInfo; at: string }
  | { type: "disconnect"; reason: string; at: string };

/* ------------------------------------------------------------------ guided processes */

export type ProcessOutputLevel = "information" | "warning" | "error";

export type ProcessInputType = "text" | "number" | "choice" | "vin" | "confirm";

export type ProcessEvent =
  | { type: "output"; level: ProcessOutputLevel; text: string }
  | {
      type: "input";
      prompt: string;
      inputType: ProcessInputType;
      variable: string;
      options?: string[];
    }
  | { type: "request"; ecuId: string; hex: string; label?: string }
  | { type: "response"; ecuId: string; hex: string; storedAs?: string; value?: string }
  | { type: "negative"; ecuId: string; nrc: string; meaning: string }
  | { type: "trace"; direction: "tx" | "rx" | "info"; text: string; at: string }
  | { type: "done"; ok: boolean; message: string };

export type ProcessEventEnvelope = {
  type: "processEvent";
  runId: string;
  event: ProcessEvent;
};

export type RunProcessParams = {
  processId: string;
  variables?: Record<string, string | number | boolean>;
  dryRun?: boolean;
  jobId?: string;
};

export type RunProcessReply = {
  runId: string;
  ok: boolean;
  message: string;
  executed: number;
  prompts: number;
  variables: Record<string, string | number | boolean>;
};

export type ProvideInputParams = { runId: string; variable?: string; value: string };

export type AbortProcessParams = { runId: string };

/* ------------------------------------------------------------------ scan */

export type EcuScanStatus = "responded" | "silent" | "unmapped";

export type ScanEcuResult = {
  ecuId: string;
  status: EcuScanStatus;
  dtcs: Array<Record<string, unknown>>;
  /** DoIP / UDS error text when the ECU stayed silent or is unmapped. */
  error?: string;
};

export type ScanVehicleParams = { concurrency?: number; ecus?: string[]; jobId?: string };

export type ScanEvent =
  | { type: "scanStart"; total: number }
  | {
      type: "scanEcu";
      ecuId: string;
      state: "running" | EcuScanStatus;
      dtcCount?: number;
      error?: string;
    }
  | { type: "scanProgress"; done: number; total: number }
  | { type: "scanDone"; total: number };

export type ScanVehicleReply = { results: ScanEcuResult[]; startedAt: string; finishedAt: string };

/* ------------------------------------------------------------------ logs */

export type JobLogEntry = {
  at: string;
  jobId: string;
  kind: "tx" | "rx" | "info" | "nrc" | "process";
  text: string;
  vin?: string;
  ecuId?: string;
};

export type GetJobLogParams = { jobId: string };

export type GetJobLogReply = { jobId: string; path: string; entries: JobLogEntry[] };
