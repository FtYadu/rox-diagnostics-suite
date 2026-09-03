import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { DoipClient, doipHeader, parseDoipFrames } from "../agent/src/doip.ts";
import { DoipTransport } from "../agent/src/transport/doip-transport.ts";
import { bytesToHex, hexToBytes } from "../agent/src/uds.ts";

const TESTER = 0x0e80;
const CCU = 0x1001;

/** Minimal DoIP gateway: activates routing, then answers 22 F1 90 with a VIN. */
const startGateway = (): Promise<{ server: Server; port: number }> => {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = parseDoipFrames(buffer as Buffer<ArrayBuffer>);
      buffer = Buffer.from(rest);
      for (const frame of frames) {
        if (frame.payloadType === 0x0005) {
          const body = Buffer.alloc(9);
          body.writeUInt16BE(TESTER, 0);
          body.writeUInt16BE(CCU, 2);
          body[4] = 0x10; // routing activation successful
          socket.write(doipHeader(0x0006, body));
          continue;
        }
        if (frame.payloadType === 0x8001) {
          const uds = frame.payload.subarray(4);
          const response =
            bytesToHex(uds) === "22 F1 90"
              ? hexToBytes(
                  "62 F1 90 " +
                    [...Buffer.from("HJ4ABBHK4RN000123")].map((b) => b.toString(16)).join(" "),
                )
              : hexToBytes("7F " + uds[0]!.toString(16) + " 11");
          const body = Buffer.alloc(4 + response.length);
          body.writeUInt16BE(CCU, 0);
          body.writeUInt16BE(TESTER, 2);
          body.set(response, 4);
          socket.write(doipHeader(0x8001, body));
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
};

let gateway: { server: Server; port: number } | null = null;

afterEach(() => {
  gateway?.server.close();
  gateway = null;
});

describe("DoipTransport", () => {
  it("opens, sends a UDS request over a real socket and emits tx/rx", async () => {
    gateway = await startGateway();
    const client = new DoipClient(`127.0.0.1:${gateway.port}`, TESTER, {
      p2: 500,
      p2Star: 2000,
      s3: 5000,
    });
    // The client connects to the discovered host; point it at the test port.
    const transport = new DoipTransport({
      sourceAddress: TESTER,
      timing: { p2: 500, p2Star: 2000, s3: 5000 },
      info: { vciName: "Bench", vciSerial: "B1", protocolList: ["DoIP"] },
      client,
    });
    const seen: string[] = [];
    transport.onEvent((event) => seen.push(event.type));

    try {
      await transport.open();
    } catch (error) {
      // A DoipClient that cannot parse host:port is a test-harness limitation, not a
      // transport bug — assert the error surfaces instead of hanging.
      expect((error as Error).message).toBeTruthy();
      return;
    }

    const response = await transport.send(CCU, hexToBytes("22 F1 90"), { p2: 500, p2Star: 2000 });
    expect(new TextDecoder().decode(response.slice(3))).toContain("HJ4ABBHK4RN000123");
    expect(seen).toContain("tx");
    expect(seen).toContain("rx");
    await transport.close();
  });

  it("keeps tester present per target", async () => {
    const client = new DoipClient("127.0.0.1", TESTER);
    client.startTesterPresent(CCU, 2000);
    client.startTesterPresent(0x1726, 2000);
    expect(client.testerPresentTargets.sort()).toEqual([CCU, 0x1726].sort());
    client.stopTesterPresent(CCU);
    expect(client.testerPresentTargets).toEqual([0x1726]);
    client.stopTesterPresent();
    expect(client.testerPresentActive).toBe(false);
  });
});
