import { describe, expect, it } from "vitest";

import { SA_LEVELS, SeedKeyError, computeKey, saLevel } from "../agent/src/seedkey.ts";
import { bytesToHex } from "../agent/src/uds.ts";

describe("security access level table", () => {
  it("maps every ROX level to its request/send sub-functions", () => {
    expect(saLevel(1)).toMatchObject({ requestSeed: 0x01, sendKey: 0x02 });
    expect(saLevel(3)).toMatchObject({ requestSeed: 0x03, sendKey: 0x04 });
    expect(saLevel(11)).toMatchObject({ requestSeed: 0x0b, sendKey: 0x0c });
    expect(saLevel(13)).toMatchObject({ requestSeed: 0x0d, sendKey: 0x0e });
    expect(saLevel(17)).toMatchObject({ requestSeed: 0x11, sendKey: 0x12, alg: 11 });
    expect(saLevel(7)).toMatchObject({ requestSeed: 0x07, sendKey: 0x08 });
    expect(saLevel(19)).toMatchObject({ requestSeed: 0x13, sendKey: 0x14 });
  });

  it("derives requestSeed/sendKey for a level that is not in the table", () => {
    expect(saLevel(0x21)).toMatchObject({ requestSeed: 0x21, sendKey: 0x22, alg: 1 });
  });

  it("takes the algorithm from the canonical access table, then the step, then 1", () => {
    const accessTable = { IBCM: { "17": 11, "1": 5 } };
    expect(saLevel(17, { ecuId: "IBCM", accessTable }).alg).toBe(11);
    expect(saLevel(1, { ecuId: "IBCM", accessTable }).alg).toBe(5);
    expect(saLevel(1, { ecuId: "CCU", accessTable, saAlg: 7 }).alg).toBe(7);
    expect(saLevel(3, { ecuId: "CCU", accessTable }).alg).toBe(1);
  });

  it("rejects an even level instead of guessing", () => {
    expect(() => saLevel(2)).toThrow(SeedKeyError);
  });
});

describe("computeKey backends", () => {
  const table = { "11223344": "AABBCCDD" };

  it("returns the mapped key for the test backend", async () => {
    const key = await computeKey(1, Uint8Array.of(0x11, 0x22, 0x33, 0x44), 0, {
      backend: "test",
      table,
    });
    expect(bytesToHex(key)).toBe("AA BB CC DD");
  });

  it("fails when the test table has no entry — never invents a key", async () => {
    await expect(
      computeKey(1, Uint8Array.of(1, 2, 3, 4), 0, { backend: "test", table }),
    ).rejects.toThrow(/No test key configured/);
  });

  it("rejects an empty seed", async () => {
    await expect(computeKey(1, new Uint8Array(), 0, { backend: "test", table })).rejects.toThrow(
      /empty seed/,
    );
  });

  it("drives a sidecar process over stdin/stdout", async () => {
    const script =
      "let d='';process.stdin.on('data',c=>d+=c);" +
      "process.stdin.on('end',()=>{const [,seed]=d.trim().split(' ');" +
      "process.stdout.write([...Buffer.from(seed,'hex')].map(b=>(255-b).toString(16).padStart(2,'0')).join(''));});";
    const key = await computeKey(3, Uint8Array.of(0x00, 0x0f), 0, {
      backend: "sidecar",
      command: process.execPath,
      args: ["-e", script],
    });
    expect(bytesToHex(key)).toBe("FF F0");
  });

  it("reports a missing sidecar clearly", async () => {
    await expect(
      computeKey(3, Uint8Array.of(1), 0, { backend: "sidecar", command: "rox-no-such-binary" }),
    ).rejects.toThrow(/Cannot start seed\/key sidecar/);
  });
});
