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

/** ISO 14229-1 negative response codes, keyed by lowercase `0x..` form. */
export const NRC_MEANINGS: Record<string, string> = {
  "0x10": "generalReject",
  "0x11": "serviceNotSupported",
  "0x12": "subFunctionNotSupported",
  "0x13": "incorrectMessageLengthOrInvalidFormat",
  "0x14": "responseTooLong",
  "0x21": "busyRepeatRequest",
  "0x22": "conditionsNotCorrect",
  "0x24": "requestSequenceError",
  "0x25": "noResponseFromSubnetComponent",
  "0x26": "failurePreventsExecutionOfRequestedAction",
  "0x31": "requestOutOfRange",
  "0x33": "securityAccessDenied",
  "0x34": "authenticationRequired",
  "0x35": "invalidKey",
  "0x36": "exceedNumberOfAttempts",
  "0x37": "requiredTimeDelayNotExpired",
  "0x38": "secureDataTransmissionRequired",
  "0x39": "secureDataTransmissionNotAllowed",
  "0x3A": "secureDataVerificationFailed",
  "0x50": "certificateVerificationFailed",
  "0x70": "uploadDownloadNotAccepted",
  "0x71": "transferDataSuspended",
  "0x72": "generalProgrammingFailure",
  "0x73": "wrongBlockSequenceCounter",
  "0x78": "requestCorrectlyReceived-ResponsePending",
  "0x7E": "subFunctionNotSupportedInActiveSession",
  "0x7F": "serviceNotSupportedInActiveSession",
  "0x81": "rpmTooHigh",
  "0x82": "rpmTooLow",
  "0x83": "engineIsRunning",
  "0x84": "engineIsNotRunning",
  "0x85": "engineRunTimeTooLow",
  "0x86": "temperatureTooHigh",
  "0x87": "temperatureTooLow",
  "0x88": "vehicleSpeedTooHigh",
  "0x89": "vehicleSpeedTooLow",
  "0x8A": "throttlePedalTooHigh",
  "0x8B": "throttlePedalTooLow",
  "0x8C": "transmissionRangeNotInNeutral",
  "0x8D": "transmissionRangeNotInGear",
  "0x8F": "brakeSwitchesNotClosed",
  "0x90": "shifterLeverNotInPark",
  "0x91": "torqueConverterClutchLocked",
  "0x92": "voltageTooHigh",
  "0x93": "voltageTooLow",
  "0x94": "resourceTemporarilyNotAvailable",
};

/** Short technician-facing guidance for the NRCs that come up in a workshop. */
export const NRC_HINTS: Record<string, string> = {
  "0x11": "The ECU does not implement this service — check the ECU variant or software level.",
  "0x12": "Sub-function not supported. The routine or session ID does not exist on this variant.",
  "0x13": "Request length or format rejected — usually a wrong DID or data length.",
  "0x21": "ECU busy. Wait a moment and repeat the request.",
  "0x22": "Preconditions not met: check ignition ON, engine state, gear and voltage.",
  "0x24": "Steps ran out of order — restart the process from the first step.",
  "0x25": "A gateway or subnet ECU did not answer. Check wiring and the CAN bus.",
  "0x31": "Requested DID, routine or value is out of range for this ECU.",
  "0x33": "Security access required. Unlock the ECU at the correct level first.",
  "0x34": "Authentication (0x29) required before this service is allowed.",
  "0x35": "Wrong key sent for the seed — check the seed/key algorithm configuration.",
  "0x36": "Too many failed attempts. Cycle the ignition and wait before retrying.",
  "0x37": "Lock-out delay still active. Wait for the delay to expire.",
  "0x72": "Programming failed. Do not switch off — repeat the flash with a stable supply.",
  "0x73": "Flash block sequence mismatch — restart the download.",
  "0x78": "ECU is still working on the request; the response follows shortly.",
  "0x7E": "Not allowed in the current session — enter extended or programming session.",
  "0x7F": "Service not allowed in the current session — change session first.",
  "0x92": "Supply voltage too high for this operation.",
  "0x93": "Battery voltage too low — connect a charger before continuing.",
  "0x94": "ECU resource busy. Retry after the current operation finishes.",
};

/** Normalises `31`, `0X31`, `0x31` and `#31` to the canonical `0x31` form. */
export const normalizeNrc = (nrc: string): string => {
  const digits = nrc.trim().replace(/^#/, "").replace(/^0[xX]/, "").toUpperCase();
  return digits ? `0x${digits.padStart(2, "0")}` : nrc;
};

export const nrcMeaning = (nrc: string): string =>
  NRC_MEANINGS[normalizeNrc(nrc)] ?? "unknown negative response code";

export const nrcHint = (nrc: string): string | undefined => NRC_HINTS[normalizeNrc(nrc)];

/** `0x33 securityAccessDenied` for traces and toasts. */
export const describeNrc = (nrc: string): string => `${normalizeNrc(nrc)} ${nrcMeaning(nrc)}`;

