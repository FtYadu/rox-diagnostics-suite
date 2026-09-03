/**
 * Shared loader for `data/canonical`. Both generators use it so they fail the same
 * way — loudly, with the missing file listed — and so both embed the same checksum.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_FILES,
  EXPECTED_COUNTS,
  type AddressesFile,
  type CanonicalFileName,
  type DidsFile,
  type DtcsFile,
  type EcusFile,
  type FlowsFile,
  type IoControlFile,
  type MenuFile,
  type ProcessesFile,
  type RoutinesFile,
  type ServicesFile,
} from "../packages/canonical-schema/src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(here, "..");
export const canonicalDir = resolve(repoRoot, "data/canonical");

export type CanonicalSet = {
  ecus: EcusFile;
  addresses: AddressesFile;
  services: ServicesFile;
  dids: DidsFile;
  dtcs: DtcsFile;
  routines: RoutinesFile;
  iocontrol: IoControlFile;
  processes: ProcessesFile;
  flows: FlowsFile;
  menu: MenuFile;
  /** sha256 over the raw bytes of every canonical file, in file-name order. */
  dataChecksum: string;
};

export class CanonicalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalDataError";
  }
}

const fileNames = Object.keys(CANONICAL_FILES) as CanonicalFileName[];

const readRaw = (): Map<CanonicalFileName, string> => {
  const missing = fileNames.filter((name) => !existsSync(resolve(canonicalDir, name)));
  if (missing.length > 0) {
    throw new CanonicalDataError(
      [
        `Canonical data is not present in ${canonicalDir}.`,
        `Missing file(s): ${missing.join(", ")}.`,
        "Run the globatROX extraction scripts first; see data/canonical/README.md.",
        "Until then the existing src/data/r11-oversea-data.json stays in place.",
      ].join("\n"),
    );
  }
  const raw = new Map<CanonicalFileName, string>();
  for (const name of [...fileNames].sort()) {
    raw.set(name, readFileSync(resolve(canonicalDir, name), "utf8"));
  }
  return raw;
};

export const checksumOf = (raw: Map<CanonicalFileName, string>): string => {
  const hash = createHash("sha256");
  for (const name of [...raw.keys()].sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(raw.get(name) ?? "");
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
};

export const loadCanonical = (options: { allowCountDrift?: boolean } = {}): CanonicalSet => {
  const raw = readRaw();
  const parsed = {} as Record<string, unknown>;
  const problems: string[] = [];

  for (const name of fileNames) {
    const schema = CANONICAL_FILES[name];
    let json: unknown;
    try {
      json = JSON.parse(raw.get(name) ?? "");
    } catch (error) {
      problems.push(`${name}: invalid JSON — ${(error as Error).message}`);
      continue;
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      const issues = result.error.issues
        .slice(0, 8)
        .map((issue) => `    ${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("\n");
      problems.push(`${name}: schema validation failed\n${issues}`);
      continue;
    }
    parsed[name.replace(".json", "")] = result.data;
  }

  if (problems.length > 0) {
    throw new CanonicalDataError(`Canonical data is invalid:\n${problems.join("\n")}`);
  }

  const set = {
    ...(parsed as Omit<CanonicalSet, "dataChecksum">),
    dataChecksum: checksumOf(raw),
  } as CanonicalSet;

  const drift = countDrift(set);
  if (drift.length > 0) {
    const message = `Canonical count drift:\n${drift.map((line) => `  - ${line}`).join("\n")}`;
    if (!options.allowCountDrift) {
      throw new CanonicalDataError(
        `${message}\nRe-run the extractor, or pass --allow-count-drift while iterating on it.`,
      );
    }
    process.stderr.write(`${message}\n(continuing: --allow-count-drift)\n`);
  }

  return set;
};

export const countDrift = (set: CanonicalSet): string[] => {
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const actual = {
    ecus: set.ecus.ecus.length,
    rdbiDids: sum(set.dids.ecus.map((entry) => entry.rdbi.length)),
    drdbiDids: sum(set.dids.ecus.map((entry) => entry.drdbi.length)),
    wdbiDids: sum(set.dids.ecus.map((entry) => entry.wdbi.length)),
    ioControls: sum(set.iocontrol.ecus.map((entry) => entry.ioControls.length)),
    routines: sum(set.routines.ecus.map((entry) => entry.routines.length)),
    processes: set.processes.processes.length,
  };
  return (Object.keys(EXPECTED_COUNTS) as Array<keyof typeof EXPECTED_COUNTS>)
    .filter((key) => actual[key] !== EXPECTED_COUNTS[key])
    .map((key) => `${key}: expected ${EXPECTED_COUNTS[key]}, got ${actual[key]}`);
};

/** Merges the per-file canonical views into one ECU record per ECU id. */
export const mergedEcus = (set: CanonicalSet) => {
  const address = new Map(set.addresses.ecus.map((entry) => [entry.id, entry]));
  const dids = new Map(set.dids.ecus.map((entry) => [entry.id, entry]));
  const dtcs = new Map(set.dtcs.ecus.map((entry) => [entry.id, entry]));
  const routines = new Map(set.routines.ecus.map((entry) => [entry.id, entry]));
  const io = new Map(set.iocontrol.ecus.map((entry) => [entry.id, entry]));
  const services = new Map(set.services.ecus.map((entry) => [entry.id, entry]));

  return set.ecus.ecus.map((ecu) => {
    const addr = address.get(ecu.id);
    if (!addr) {
      throw new CanonicalDataError(`addresses.json has no entry for ECU ${ecu.id}`);
    }
    const didEntry = dids.get(ecu.id);
    return {
      ...ecu,
      bus: addr.bus,
      address: addr.address,
      secondaryAddresses: addr.secondaryAddresses,
      identDids:
        ecu.identDids.length > 0 ? ecu.identDids : (didEntry?.rdbi ?? []).filter(isIdentDid),
      liveDids:
        ecu.liveDids.length > 0
          ? ecu.liveDids
          : (didEntry?.rdbi ?? []).filter((d) => !isIdentDid(d)),
      writeDids: ecu.writeDids.length > 0 ? ecu.writeDids : (didEntry?.wdbi ?? []),
      snapshotLayout:
        ecu.snapshotLayout.length > 0 ? ecu.snapshotLayout : (didEntry?.snapshotLayout ?? []),
      dtcs: ecu.dtcs.length > 0 ? ecu.dtcs : (dtcs.get(ecu.id)?.dtcs ?? []),
      dtcStatusMask: ecu.dtcStatusMask ?? dtcs.get(ecu.id)?.statusMask,
      routines: ecu.routines.length > 0 ? ecu.routines : (routines.get(ecu.id)?.routines ?? []),
      ioControls: ecu.ioControls.length > 0 ? ecu.ioControls : (io.get(ecu.id)?.ioControls ?? []),
      services: services.get(ecu.id)?.services ?? [],
    };
  });
};

/** F1xx identification block plus the classic dealer identification DIDs. */
const isIdentDid = (did: { did: number }): boolean => did.did >= 0xf180 && did.did <= 0xf1ff;

export const hexWord = (value: number): string =>
  `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;

export const parseFlags = (argv: string[]) => ({
  allowCountDrift: argv.includes("--allow-count-drift"),
});
