import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

/** ISO 13400 tester address for the ROX 01 dealer tool. */
export const REQUIRED_TESTER_ADDRESS = 0x0e80;
export const DEFAULT_FUNCTIONAL_ADDRESS = 0xe400;

const hexString = z.string().regex(/^0x[0-9a-fA-F]{1,4}$/, "expected a hex address like 0x1001");

export const signalConfigSchema = z.object({
  did: z.string().min(2),
  label: z.string().min(1),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Raw value is decoded as an unsigned/signed integer, then value = raw * factor + offset. */
  factor: z.number().optional(),
  offset: z.number().optional(),
  signed: z.boolean().optional(),
  length: z.number().int().positive().optional(),
  byteStart: z.number().int().nonnegative().optional(),
  bitStart: z.number().int().min(0).max(7).optional(),
  session: z.union([z.literal(1), z.literal(3)]).optional(),
  saLevel: z.number().int().nonnegative().optional(),
  /** ascii for text DIDs (identification), number for measurements. */
  encoding: z.enum(["number", "ascii", "hex"]).optional(),
});
export type SignalConfig = z.infer<typeof signalConfigSchema>;

export const ecuConfigSchema = z.object({
  /** DoIP logical address, e.g. "0x1001". */
  address: hexString,
  secondaryAddresses: z.array(hexString).optional(),
  bus: z.enum(["DoIP", "CAN", "CANFD"]).optional(),
  /** Status mask used for 19 02 <mask>; defaults to 0xFF. */
  dtcStatusMask: z.string().optional(),
  /** DID -> label for the Identification tab. */
  identification: z.array(signalConfigSchema).optional(),
  /** Live-data parameters published by this ECU. */
  liveData: z.array(signalConfigSchema).optional(),
  /** Snapshot record layout returned by 19 06, in order. */
  snapshot: z.array(signalConfigSchema).optional(),
  /** Routine name (as in the vehicle data) -> routine identifier, e.g. "0x0203". */
  routines: z.record(z.string(), z.string()).optional(),
  /** IO control label -> data identifier. */
  ioControls: z.record(z.string(), z.string()).optional(),
  /** Security levels supported by this ECU (1, 3, 11, 13, 17). */
  security: z
    .object({
      levels: z.array(z.number().int().nonnegative()).optional(),
    })
    .optional(),
});
export type EcuConfig = z.infer<typeof ecuConfigSchema>;

export const timingSchema = z.object({
  /** P2: normal response window, ms. */
  p2: z.number().int().positive().default(100),
  /** P2*: extended window after NRC 0x78, ms. */
  p2Star: z.number().int().positive().default(5000),
  /** S3: session timeout the tester-present loop keeps alive, ms. */
  s3: z.number().int().positive().default(5000),
});
export type Timing = z.infer<typeof timingSchema>;

export const transportConfigSchema = z.object({
  kind: z.enum(["doip", "j2534"]).default("doip"),
  j2534: z
    .object({
      dllPath: z.string().min(1),
      protocol: z.enum(["ISO15765", "DoIP"]).default("ISO15765"),
    })
    .optional(),
});
export type TransportConfig = z.infer<typeof transportConfigSchema>;

export const seedKeyConfigSchema = z.discriminatedUnion("backend", [
  z.object({
    backend: z.literal("dll"),
    dllPath: z.string().min(1),
    exportName: z.string().optional(),
  }),
  z.object({
    backend: z.literal("sidecar"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
  }),
  z.object({ backend: z.literal("test"), table: z.record(z.string(), z.string()) }),
]);
export type SeedKeyConfig = z.infer<typeof seedKeyConfigSchema>;

export const agentConfigSchema = z.object({
  comment: z.string().optional(),
  dataChecksum: z.string().nullable().optional(),
  vci: z
    .object({
      name: z.string().default("ROX VCI"),
      serial: z.string().default("unknown"),
      protocol: z.string().default("DoIP / CAN FD"),
    })
    .default({ name: "ROX VCI", serial: "unknown", protocol: "DoIP / CAN FD" }),
  tester: z
    .object({
      sourceAddress: hexString.default("0x0E80"),
      functionalAddress: hexString.default("0xE400"),
      gatewayHost: z.string().optional(),
    })
    .default({ sourceAddress: "0x0E80", functionalAddress: "0xE400" }),
  timing: timingSchema.default({ p2: 100, p2Star: 5000, s3: 5000 }),
  transport: transportConfigSchema.default({ kind: "doip" }),
  security: z
    .object({
      /** Seed/key backend. The real algorithm is a licensed native library. */
      seedKey: seedKeyConfigSchema.optional(),
    })
    .optional(),
  vehicleStatus: z
    .object({
      ecu: z.string().min(1),
      batteryVoltage: signalConfigSchema.optional(),
      ignition: signalConfigSchema.optional(),
    })
    .optional(),
  ecus: z.record(z.string(), ecuConfigSchema).default({}),
  /** Optional per-process step mapping: process name -> list of raw UDS requests. */
  processes: z
    .record(
      z.string(),
      z.array(
        z.object({
          step: z.number().int().nonnegative(),
          request: z.string().min(2),
          description: z.string().optional(),
        }),
      ),
    )
    .optional(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const parseHex = (value: string): number => Number.parseInt(value.replace(/0x/i, ""), 16);

let cached: AgentConfig | null = null;

export const configPath = (): string =>
  process.env["ROX_AGENT_CONFIG"] ?? resolve(here, "../config.json");

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

export const parseAgentConfig = (json: unknown): AgentConfig => {
  const result = agentConfigSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n");
    throw new AgentConfigError(`agent/config.json is invalid:\n${issues}`);
  }
  return result.data;
};

export const loadConfig = (): AgentConfig => {
  if (cached) return cached;
  const path = configPath();
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new AgentConfigError(`Cannot read ${path}: ${(error as Error).message}`);
  }
  cached = parseAgentConfig(json);
  return cached;
};

/** Test seam. */
export const resetConfigCache = () => {
  cached = null;
  catalog = null;
};

export const ecuConfig = (ecuId: string): EcuConfig => {
  const config = loadConfig().ecus[ecuId];
  if (!config) {
    throw new AgentConfigError(
      `No DoIP address configured for ${ecuId}. Regenerate agent/config.json with ` +
        "`npm run build:agent-config` — addresses must never be hand-written.",
    );
  }
  return config;
};

export const dtcStatusMask = (ecuId: string): number => {
  const raw = ecuConfig(ecuId).dtcStatusMask;
  if (!raw) return 0xff;
  const value = Number.parseInt(raw.replace(/0x/i, ""), 16);
  return Number.isFinite(value) ? value & 0xff : 0xff;
};

export type VehicleCatalog = {
  vehicle: { model?: string; name?: string; code: string };
  ecus: Array<{
    id: string;
    fullName: string;
    domain: string;
    routines: string[];
    dtcs: Array<{ code: string; name: string; severity: number }>;
  }>;
  dataChecksum?: string | null;
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

export type StartupProblem = {
  kind: "unmappedEcus" | "testerAddress" | "checksum";
  message: string;
};

/**
 * Refuses to talk to a car with an incomplete or hand-edited config: an unmapped ECU
 * means the seed and the agent disagree, and a wrong tester address means every request
 * is sent from an identity the gateway may not have authorised.
 */
export const checkStartup = (
  config: AgentConfig = loadConfig(),
  seed: VehicleCatalog = loadCatalog(),
): StartupProblem[] => {
  const problems: StartupProblem[] = [];
  const mapped = new Set(Object.keys(config.ecus));
  const unmapped = seed.ecus.map((ecu) => ecu.id).filter((id) => !mapped.has(id));

  if (unmapped.length > 0) {
    problems.push({
      kind: "unmappedEcus",
      message:
        `${unmapped.length} of ${seed.ecus.length} ECUs in the vehicle data have no DoIP address:\n` +
        `  ${unmapped.join(", ")}\n` +
        "  Generate the mapping with `npm run build:agent-config` (never by hand).",
    });
  }

  const tester = parseHex(config.tester.sourceAddress);
  if (tester !== REQUIRED_TESTER_ADDRESS) {
    problems.push({
      kind: "testerAddress",
      message: `tester.sourceAddress is ${config.tester.sourceAddress}, expected 0x0E80.`,
    });
  }

  const seedChecksum = seed.dataChecksum ?? null;
  if (seedChecksum && config.dataChecksum && seedChecksum !== config.dataChecksum) {
    problems.push({
      kind: "checksum",
      message:
        `Data checksum mismatch — seed ${seedChecksum} vs agent ${config.dataChecksum}. ` +
        "Re-run build:seed and build:agent-config from the same canonical set.",
    });
  }

  return problems;
};

export const overrideEnabled = (): boolean => process.env["ROX_AGENT_ALLOW_OVERRIDE"] === "1";

/** Throws unless the config is safe, or the technician explicitly opted out. */
export const assertStartupSafe = (
  config: AgentConfig = loadConfig(),
  seed: VehicleCatalog = loadCatalog(),
): StartupProblem[] => {
  const problems = checkStartup(config, seed);
  if (problems.length === 0) return problems;
  if (overrideEnabled()) return problems;
  throw new AgentConfigError(
    [
      "Refusing to start: agent/config.json is not safe to use on a vehicle.",
      ...problems.map((problem) => `\n• ${problem.message}`),
      "\nSet ROX_AGENT_ALLOW_OVERRIDE=1 to start anyway (bench use only).",
    ].join(""),
  );
};
