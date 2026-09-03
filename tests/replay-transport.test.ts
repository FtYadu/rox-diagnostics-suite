import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ReplayTransport, loadRecording } from "../agent/src/transport/replay-transport.ts";
import { UdsNegativeResponse, bytesToHex, hexToBytes } from "../agent/src/uds.ts";

const fixture = (name: string) => resolve(import.meta.dirname, "fixtures/recordings", name);

const ccu = () => loadRecording(fixture("ccu-identification-dtc.jsonl"));
const ibcm = () => loadRecording(fixture("ibcm-security.jsonl"));

describe("ReplayTransport", () => {
  it("loads a JSONL recording and skips comments", () => {
    const recording = ccu();
    expect(recording).toHaveLength(6);
    expect(recording[0]?.request).toBe("10 03");
  });

  it("replays the recorded responses in order", async () => {
    const transport = new ReplayTransport(ccu());
    await transport.open();
    const timing = { p2: 100, p2Star: 5000 };

    await transport.send(0x1001, hexToBytes("10 03"), timing);
    const vin = await transport.send(0x1001, hexToBytes("22 F1 90"), timing);
    expect(new TextDecoder().decode(vin.slice(3))).toBe("HJ4ABBHK4RN000123");
    expect(transport.remaining).toBe(4);
  });

  it("fails loudly with both hex strings when the request is not the expected one", async () => {
    const transport = new ReplayTransport(ccu());
    await transport.open();
    await expect(
      transport.send(0x1001, hexToBytes("22 F1 90"), { p2: 100, p2Star: 5000 }),
    ).rejects.toThrow(/expected 0x1001 10 03[\s\S]*actual {3}0x1001 22 F1 90/);
  });

  it("replays a 7F frame as a typed negative response", async () => {
    const transport = new ReplayTransport(ibcm());
    await transport.open();
    const timing = { p2: 100, p2Star: 5000 };
    for (const step of ibcm().slice(0, 4)) {
      await transport.send(step.target, hexToBytes(step.request), timing);
    }
    await expect(transport.send(0x1726, hexToBytes("22 20 06"), timing)).rejects.toBeInstanceOf(
      UdsNegativeResponse,
    );
  });

  it("emits tx/rx events and tracks tester present per target", async () => {
    const transport = new ReplayTransport(ccu());
    const seen: string[] = [];
    transport.onEvent((event) => seen.push(event.type));
    await transport.open();
    await transport.send(0x1001, hexToBytes("10 03"), { p2: 100, p2Star: 5000 });
    transport.startTesterPresent(0x1001, 2000);
    expect(seen).toEqual(["connect", "tx", "rx"]);
    expect([...transport.testerPresentTargets]).toEqual([0x1001]);
    transport.stopTesterPresent(0x1001);
    expect(transport.testerPresentTargets.size).toBe(0);
    expect(bytesToHex(hexToBytes("10 03"))).toBe("10 03");
  });
});
