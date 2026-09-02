import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export type SignalConfig = {
  did: string;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  /** Raw value is decoded as an unsigned/signed integer, then value = raw * factor + offset. */
  factor?: number;
  offset?: number;
  signed?: boolean;
  length?: number;
  /** ascii for text DIDs (identification), number for measurements. */
  encoding?: "number" | "ascii" | "hex";
};

export type EcuConfig = {
  /** DoIP logical address, e.g. "0x1001". */
  address: string;
  /** DID -> label for the Identification tab. */
  identification?: SignalConfig[];
  /** Live-data parameters published by this ECU. */
  liveData?: SignalConfig[];
  /** Snapshot record layout returned by 19 06, in order. */
  snapshot?: SignalConfig[];
  /** Routine name (as in the vehicle data) -> routine identifier, e.g. "0x0203". */
  routines?: Record<string, string>;
  /** Seed/key configuration per security level. */
  security?: Record<string, { algorithm: "xor" | "add" | "invert"; mask?: string }>;
};

export type AgentConfig = {
  vci: { name: string; serial: string; protocol: string };
  tester: { sourceAddress: string; gatewayHost?: string };
  vehicleStatus?: { ecu: string; batteryVoltage?: SignalConfig; ignition?: SignalConfig };
  ecus: Record<string, EcuConfig>;
  /** Optional per-process step mapping: process name -> list of raw UDS requests. */
  processes?: Record<string, Array<{ step: number; request: string; description?: string }>>;
};

const DEFAULTS: AgentConfig = {
  vci: { name: "ROX VCI", serial: "unknown", protocol: "DoIP / CAN FD" },
  tester: { sourceAddress: "0x0E00" },
  ecus: {},
};

let cached: AgentConfig | null = null;

export const loadConfig = (): AgentConfig => {
  if (cached) return cached;
  const path = process.env["ROX_AGENT_CONFIG"] ?? resolve(here, "../config.json");
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentConfig>;
    cached = {
      ...DEFAULTS,
      ...parsed,
      vci: { ...DEFAULTS.vci, ...parsed.vci },
      tester: { ...DEFAULTS.tester, ...parsed.tester },
      ecus: parsed.ecus ?? {},
    };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
};

export const parseHex = (value: string): number => Number.parseInt(value.replace(/0x/i, ""), 16);

export const ecuConfig = (ecuId: string): EcuConfig => {
  const config = loadConfig().ecus[ecuId];
  if (!config) {
    throw new Error(
      `No DoIP address configured for ${ecuId}. Add it to agent/config.json before using the hardware bridge.`,
    );
  }
  return config;
};

export type VehicleCatalog = {
  vehicle: { model: string; code: string };
  ecus: Array<{
    id: string;
    fullName: string;
    domain: string;
    routines: string[];
    dtcs: Array<{ code: string; name: string; severity: number }>;
  }>;
};

let catalog: VehicleCatalog | null = null;

/** Fault-code names/severities come from the same seed data the app uses. */
export const loadCatalog = (): VehicleCatalog => {
  if (catalog) return catalog;
  const path = resolve(here, "../../src/data/r11-oversea-data.json");
  catalog = JSON.parse(readFileSync(path, "utf8")) as VehicleCatalog;
  return catalog;
};

export const dtcMeta = (
  ecuId: string,
  code: string,
): { name: string; severity: number } | undefined => {
  const ecu = loadCatalog().ecus.find((entry) => entry.id === ecuId);
  const match = ecu?.dtcs.find((dtc) => dtc.code.toUpperCase() === code.toUpperCase());
  if (!match) return undefined;
  return { name: match.name, severity: match.severity };
};
