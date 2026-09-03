import { type AgentConfig, parseHex } from "../config.ts";
import { DoipTransport } from "./doip-transport.ts";
import { J2534Transport } from "./j2534-transport.ts";
import type { Transport } from "./types.ts";

export { DoipTransport } from "./doip-transport.ts";
export { J2534Transport } from "./j2534-transport.ts";
export { ReplayTransport, loadRecording, REPLAY_VCI } from "./replay-transport.ts";
export type { RecordedExchange } from "./replay-transport.ts";
export * from "./types.ts";

/** Picks the transport named in config.json; DoIP is the default. */
export const createTransport = (config: AgentConfig): Transport => {
  const kind = config.transport?.kind ?? "doip";
  const sourceAddress = parseHex(config.tester.sourceAddress);

  if (kind === "j2534") {
    return new J2534Transport({
      dllPath: config.transport?.j2534?.dllPath ?? "",
      protocol: config.transport?.j2534?.protocol ?? "ISO15765",
      sourceAddress,
    });
  }

  return new DoipTransport({
    host: config.tester.gatewayHost,
    sourceAddress,
    timing: config.timing,
    info: {
      vciName: config.vci.name,
      vciSerial: config.vci.serial,
      protocolList: ["DoIP", "CANFD"],
    },
  });
};
