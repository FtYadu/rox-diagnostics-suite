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

export type EcuDtcResult = {
  ecuId: string;
  responded: boolean;
  dtcs: Dtc[];
};

export type LiveDataSignal = {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
};

export type ProcessStepEvent = {
  index: number;
  total: number;
  text: string;
  level: "information" | "warning" | "error" | "success";
  state: "running" | "done" | "failed";
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
  clearDtcs(ecu: Ecu): Promise<{ cleared: number }>;
  readLiveData(ecu: Ecu, dids: string[]): Promise<LiveDataSignal[]>;
  runProcess(
    process: ServiceProcess,
    onStep: (event: ProcessStepEvent) => void,
  ): Promise<{ ok: boolean; message: string }>;
  startProgramming(
    flow: ProgrammingFlow,
    pkg: string,
    onProgress: (event: ProgrammingProgressEvent) => void,
  ): Promise<{ ok: boolean; message: string }>;
};
