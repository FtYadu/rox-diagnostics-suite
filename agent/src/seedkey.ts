import { spawn } from "node:child_process";

import { bytesToHex, hexToBytes } from "./uds.ts";

/**
 * ROX seed/key. The real algorithm is a licensed native library (ROX_SeedKey.dll) that is
 * deliberately NOT part of this repository. Three backends:
 *   dll      — loads the licensed DLL on Windows through koffi
 *   sidecar  — spawns any executable that reads "<level> <seedHex> <alg>" and prints keyHex
 *   test     — a fixed seedHex -> keyHex table used by the Vitest suite
 * No hand-rolled xor/add/invert fallback exists any more: guessing a key locks ECUs.
 */
export type SeedKeyBackend =
  | { backend: "dll"; dllPath: string; exportName?: string | undefined }
  | { backend: "sidecar"; command: string; args?: string[] | undefined }
  | { backend: "test"; table: Record<string, string> };

/** Algorithm selector passed to the licensed library; the canonical data supplies the number. */
export type SeedKeyAlgorithm = number;

export type SaLevelRule = { requestSeed: number; sendKey: number; alg: SeedKeyAlgorithm };

/**
 * Security-access levels the ROX data uses. Any other odd level is derived on the fly
 * (requestSeed = level, sendKey = level + 1) because that is what ISO 14229 mandates.
 */
export const SA_LEVELS: Record<number, SaLevelRule> = {
  1: { requestSeed: 0x01, sendKey: 0x02, alg: 1 },
  3: { requestSeed: 0x03, sendKey: 0x04, alg: 1 },
  5: { requestSeed: 0x05, sendKey: 0x06, alg: 1 },
  7: { requestSeed: 0x07, sendKey: 0x08, alg: 1 },
  9: { requestSeed: 0x09, sendKey: 0x0a, alg: 1 },
  11: { requestSeed: 0x0b, sendKey: 0x0c, alg: 11 },
  13: { requestSeed: 0x0d, sendKey: 0x0e, alg: 1 },
  /** Immobiliser level (0x11/0x12). */
  17: { requestSeed: 0x11, sendKey: 0x12, alg: 11 },
  19: { requestSeed: 0x13, sendKey: 0x14, alg: 1 },
};

export const PROGRAMMING_LEVEL = 17;

export class SeedKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedKeyError";
  }
}

/** ECU id -> level -> algorithm, exactly as extracted from the legacy data. */
export type SecurityAccessTable = Record<string, Record<string, number>>;

export type SaLookup = {
  ecuId?: string | undefined;
  /** vehicle.securityAccessTable from the canonical set. */
  accessTable?: SecurityAccessTable | undefined;
  /** `saAlg` on the process step, used when the table has no entry. */
  saAlg?: number | undefined;
};

/**
 * Resolves the sub-functions and algorithm for a security level. The algorithm comes from
 * the data first (accessTable), then the step's saAlg, then the known level default, then 1.
 */
export const saLevel = (level: number, lookup: SaLookup = {}): SaLevelRule => {
  if (!Number.isInteger(level) || level <= 0 || level > 0x7d) {
    throw new SeedKeyError(`Invalid security level ${level}`);
  }
  if (level % 2 === 0) {
    throw new SeedKeyError(
      `Security level ${level} is even — even sub-functions are sendKey, request an odd level.`,
    );
  }
  const known = SA_LEVELS[level];
  const fromTable = lookup.ecuId ? lookup.accessTable?.[lookup.ecuId]?.[String(level)] : undefined;
  const alg = fromTable ?? lookup.saAlg ?? known?.alg ?? 1;
  return { requestSeed: known?.requestSeed ?? level, sendKey: known?.sendKey ?? level + 1, alg };
};

const fromDll = async (
  config: Extract<SeedKeyBackend, { backend: "dll" }>,
  level: number,
  seed: Uint8Array,
  alg: SeedKeyAlgorithm,
): Promise<Uint8Array> => {
  if (process.platform !== "win32") {
    throw new SeedKeyError(
      "The seed/key DLL backend is Windows only. Use the sidecar backend on this platform.",
    );
  }
  let koffi: { load: (path: string) => { func: (signature: string) => unknown } };
  try {
    koffi = (await import("koffi")) as unknown as typeof koffi;
  } catch {
    throw new SeedKeyError("`koffi` is not installed — run `npm install koffi` inside agent/.");
  }
  const name = config.exportName ?? "GenerateKeyExOpt";
  const lib = koffi.load(config.dllPath);
  /**
   * ROX_SeedKey.dll exports only GenerateKeyExOpt. NOTE: this path works with a 64-bit build
   * of the DLL only — the shipped DLL is 32-bit, so use the Python sidecar backend instead.
   */
  const compute = lib.func(
    `int ${name}(uint8_t *seed, uint32_t seedLen, uint32_t level, const char *variant, ` +
      `const char *options, _Out_ uint8_t *key, uint32_t maxKeyLen, _Out_ uint32_t *actualKeyLen)`,
  ) as (
    seed: Uint8Array,
    seedLen: number,
    level: number,
    variant: string,
    options: string,
    key: Uint8Array,
    maxKeyLen: number,
    actualKeyLen: number[],
  ) => number;
  const key = new Uint8Array(Math.max(seed.length, 16));
  const actual = [0];
  const status = compute(seed, seed.length, level, String(alg), "", key, key.length, actual);
  if (status !== 0) throw new SeedKeyError(`${name} returned ${status} for level ${level}`);
  return key.slice(0, actual[0] || seed.length);
};

const fromSidecar = (
  config: Extract<SeedKeyBackend, { backend: "sidecar" }>,
  level: number,
  seed: Uint8Array,
  alg: SeedKeyAlgorithm,
): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const child = spawn(config.command, config.args ?? [], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new SeedKeyError(`Seed/key sidecar ${config.command} timed out`));
    }, 5000);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new SeedKeyError(`Cannot start seed/key sidecar: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const key = hexToBytes(out.trim().split(/\s+/).join(""));
      if (code !== 0 || key.length === 0) {
        reject(
          new SeedKeyError(
            `Seed/key sidecar failed (exit ${code}): ${err.trim() || "no key on stdout"}`,
          ),
        );
        return;
      }
      resolve(key);
    });

    child.stdin.write(`${level} ${bytesToHex(seed).replace(/ /g, "")} ${alg}\n`);
    child.stdin.end();
  });

const fromTable = (
  config: Extract<SeedKeyBackend, { backend: "test" }>,
  seed: Uint8Array,
): Uint8Array => {
  const seedHex = bytesToHex(seed).replace(/ /g, "").toUpperCase();
  const key = config.table[seedHex];
  if (!key) throw new SeedKeyError(`No test key configured for seed ${seedHex}`);
  return hexToBytes(key);
};

export const computeKey = async (
  level: number,
  seed: Uint8Array,
  alg: SeedKeyAlgorithm,
  backend: SeedKeyBackend,
): Promise<Uint8Array> => {
  if (seed.length === 0) throw new SeedKeyError("ECU returned an empty seed");
  if (backend.backend === "test") return fromTable(backend, seed);
  if (backend.backend === "sidecar") return fromSidecar(backend, level, seed, alg);
  return fromDll(backend, level, seed, alg);
};
