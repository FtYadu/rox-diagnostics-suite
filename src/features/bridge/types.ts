import type { Dtc, Ecu, ProgrammingFlow, ServiceProcess } from "@/data/vehicle-data";

export type BridgeMode = "simulator" | "local";

export type BridgeStatus = "idle" | "connecting" | "connected" | "offline";

export type ConnectionInfo = {
  mode: BridgeMode;
  vciName: string;
  vciSerial: string;
  protocol: string;
  batteryVoltage: number;
  ignitionOn: boolean;
};

export type IdentificationEntry = {
  did: string;
  label: string;
  value: string;
};

/** UDS DTC status bits exposed to the technician (subset of ISO 14229 statusOfDTC). */
export type DtcStatusFlags = {
  current: boolean;
  pending: boolean;
  confirmed: boolean;
  testFailedThisCycle: boolean;
};

export type DtcRecord = Dtc & {
  ecuId: string;
  status: DtcStatusFlags;
  statusByte: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
};

export type EcuDtcResult = {
  ecuId: string;
  responded: boolean;
  dtcs: DtcRecord[];
};

export type FreezeFrameEntry = {
  label: string;
  value: string;
  unit: string;
};

export type FreezeFrame = {
  code: string;
  ecuId: string;
  recordNumber: string;
  recordedAt: string;
  entries: FreezeFrameEntry[];
};

export type LiveDataSignal = {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
};

export type TraceLine = {
  id: string;
  direction: "tx" | "rx" | "info";
  text: string;
  at: string;
};

export type NegativeResponse = {
  nrc: string;
  meaning: string;
};

export type SecurityAccessResult = {
  ok: boolean;
  level: number;
  trace: TraceLine[];
  error?: NegativeResponse;
};

export type StepExecution = {
  ok: boolean;
  message: string;
  trace: TraceLine[];
  error?: NegativeResponse;
  /** Optional measured value the step read back (shown in the instruction card). */
  readback?: string;
};

export type RoutineExecution = {
  ok: boolean;
  message: string;
  trace: TraceLine[];
  error?: NegativeResponse;
};

export type ProgrammingProgressEvent = {
  phaseIndex: number;
  phaseCount: number;
  phase: string;
  percent: number;
  message: string;
  state: "running" | "done" | "failed";
};

export type DiagnosticBridge = {
  readonly mode: BridgeMode;
  connect(): Promise<ConnectionInfo>;
  readIdentification(ecu: Ecu): Promise<IdentificationEntry[]>;
  readDtcs(ecu: Ecu): Promise<EcuDtcResult>;
  /** Clears the whole fault memory (14 FF FF FF) or only the listed codes. */
  clearDtcs(ecu: Ecu, codes?: string[]): Promise<{ cleared: number }>;
  readFreezeFrame(ecu: Ecu, code: string): Promise<FreezeFrame>;
  readLiveData(ecu: Ecu, dids: string[]): Promise<LiveDataSignal[]>;
  requestSecurityAccess(ecu: Ecu, level: number): Promise<SecurityAccessResult>;
  /** Executes a single guided-process step, optionally with technician input. */
  executeStep(
    process: ServiceProcess,
    stepIndex: number,
    label: string,
    input?: string,
  ): Promise<StepExecution>;
  runRoutine(
    ecu: Ecu,
    routine: string,
    action: "start" | "stop" | "status",
  ): Promise<RoutineExecution>;
  startProgramming(
    flow: ProgrammingFlow,
    pkg: string,
    onProgress: (event: ProgrammingProgressEvent) => void,
  ): Promise<{ ok: boolean; message: string }>;
};

export const NRC_MEANINGS: Record<string, string> = {
  "0x10": "generalReject",
  "0x11": "serviceNotSupported",
  "0x13": "incorrectMessageLengthOrInvalidFormat",
  "0x22": "conditionsNotCorrect",
  "0x24": "requestSequenceError",
  "0x25": "noResponseFromSubnetComponent (busy)",
  "0x31": "requestOutOfRange",
  "0x33": "securityAccessDenied",
  "0x35": "invalidKey",
  "0x36": "exceedNumberOfAttempts",
  "0x37": "requiredTimeDelayNotExpired",
  "0x72": "generalProgrammingFailure",
  "0x78": "requestCorrectlyReceived-ResponsePending",
  "0x7E": "subFunctionNotSupportedInActiveSession",
};

export const nrcMeaning = (nrc: string): string => NRC_MEANINGS[nrc.toUpperCase()] ?? "unknownNrc";
