import raw from "./r11-oversea-data.json";

export type EcuDomain =
  | "Body"
  | "Chassis"
  | "Powertrain"
  | "ADAS"
  | "Infotainment"
  | "Comfort"
  | "Connectivity"
  | "Safety";

export type Dtc = {
  code: string;
  name: string;
  severity: number;
};

export type Ecu = {
  id: string;
  fullName: string;
  domain: EcuDomain;
  dtcCount: number;
  liveDataCount: number;
  routines: string[];
  identificationDids: string[];
  dtcs: Dtc[];
};

export type ProcessStep = {
  type: string;
  level?: string;
  text?: string;
  label?: string;
  unit?: string;
};

export type ServiceProcess = {
  ecu: string;
  name: string;
  category: string;
  udsServices: string[];
  securityLevel: number;
  steps: ProcessStep[];
};

export type ProgrammingFlow = {
  name: string;
  type: string;
  ecus: string[];
  phases: string[];
};

export type VehicleInfo = {
  name: string;
  code: string;
  vinExample: string;
  bus: string;
  ecuCount: number;
};

export type VehicleDataset = {
  vehicle: VehicleInfo;
  ecus: Ecu[];
  processes: ServiceProcess[];
  programmingFlows: ProgrammingFlow[];
};

const dataset = raw as unknown as VehicleDataset;

export const vehicle = dataset.vehicle;
export const ecus = dataset.ecus;
export const processes = dataset.processes;
export const programmingFlows = dataset.programmingFlows;

export const DOMAIN_ORDER: EcuDomain[] = [
  "Body",
  "Chassis",
  "Powertrain",
  "ADAS",
  "Infotainment",
  "Comfort",
  "Connectivity",
  "Safety",
];

export const getEcu = (id: string): Ecu | undefined => ecus.find((e) => e.id === id);

export const processesForEcu = (id: string): ServiceProcess[] =>
  processes.filter((p) => p.ecu === id);

export const flowsForEcu = (id: string): ProgrammingFlow[] =>
  programmingFlows.filter((f) => f.ecus.includes(id));

export const ecusByDomain = (): Array<{ domain: EcuDomain; ecus: Ecu[] }> =>
  DOMAIN_ORDER.map((domain) => ({
    domain,
    ecus: ecus.filter((e) => e.domain === domain),
  })).filter((group) => group.ecus.length > 0);

export const DEFAULT_IDENT_DIDS = ["F187", "F188", "F18C", "F193", "F195"] as const;

export const identDidsFor = (ecu: Ecu): string[] =>
  ecu.identificationDids.length > 0 ? ecu.identificationDids : [...DEFAULT_IDENT_DIDS];

export const DID_LABELS: Record<string, string> = {
  F187: "Spare part number",
  F188: "Software version",
  F18C: "ECU serial number",
  F193: "Hardware version",
  F195: "Software fingerprint",
  F190: "VIN",
  F18A: "Supplier identifier",
};

export const severityLabel = (severity: number): "Low" | "Medium" | "High" =>
  severity >= 3 ? "High" : severity === 2 ? "Medium" : "Low";

export const processCategories = Array.from(new Set(processes.map((p) => p.category))).sort();

/** Stable identity for a process (the seed data has no id field). */
export const processKey = (process: ServiceProcess): string => `${process.ecu}:${process.name}`;
