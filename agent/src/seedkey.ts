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

export type SeedKeyAlgorithm = 0 | 1 | 9;

/** Canonical ROX security-access levels: level -> (requestSeed, sendKey) sub-functions. */
export const SA_LEVELS: Record<
  number,
  { requestSeed: number; sendKey: number; alg: SeedKeyAlgorithm }
> = {
  1: { requestSeed: 0x01, sendKey: 0x02, alg: 0 },
  3: { requestSeed: 0x03, sendKey: 0x04, alg: 0 },
  11: { requestSeed: 0x0b, sendKey: 0x0c, alg: 1 },
  13: { requestSeed: 0x0d, sendKey: 0x0e, alg: 1 },
  /** Programming level (0x11/0x12) always uses algorithm 9. */
  17: { requestSeed: 0x11, sendKey: 0x12, alg: 9 },
};

export const PROGRAMMING_LEVEL = 17;

export class SeedKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedKeyError";
  }
}

export const saLevel = (level: number) => {
  const entry = SA_LEVELS[level];
  if (!entry) {
    throw new SeedKeyError(
      `Unsupported security level ${level} — supported levels are ${Object.keys(SA_LEVELS).join(", ")}.`,
    );
  }
  return entry;
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
  const name = config.exportName ?? "ROX_ComputeKey";
  const lib = koffi.load(config.dllPath);
  const compute = lib.func(
    `int ${name}(int level, int alg, uint8_t *seed, int seedLen, uint8_t *key, int keyLen)`,
  ) as (
    level: number,
    alg: number,
    seed: Uint8Array,
    seedLen: number,
    key: Uint8Array,
    keyLen: number,
  ) => number;
  const key = new Uint8Array(seed.length);
  const status = compute(level, alg, seed, seed.length, key, key.length);
  if (status !== 0) throw new SeedKeyError(`${name} returned ${status} for level ${level}`);
  return key;
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
