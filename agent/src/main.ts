import { WebSocketServer, type WebSocket } from "ws";

import { DoipClient, discoverVehicle } from "./doip.ts";
import { VehicleSession } from "./session.ts";
import { UdsNegativeResponse, hex } from "./uds.ts";
import { loadConfig, parseHex } from "./config.ts";

const PORT = Number(process.env["ROX_AGENT_PORT"] ?? 9097);

type Request = { id?: string; method?: string; params?: Record<string, unknown> };

type VehicleLink = {
  client: DoipClient;
  session: VehicleSession;
  vin: string;
  host: string;
};

let link: VehicleLink | null = null;

const config = loadConfig();

const log = (message: string) => {
  process.stdout.write(`[rox-agent] ${message}\n`);
};

const ensureLink = async (): Promise<VehicleLink> => {
  if (link?.client.connected) return link;
  const host = config.tester.gatewayHost;
  const announcement = host
    ? { host, vin: "", logicalAddress: 0, eid: "" }
    : await discoverVehicle();
  const client = new DoipClient(announcement.host, parseHex(config.tester.sourceAddress));
  await client.connect();
  const session = new VehicleSession(client);
  link = { client, session, vin: announcement.vin, host: announcement.host };
  log(`connected to gateway ${announcement.host}${announcement.vin ? ` (VIN ${announcement.vin})` : ""}`);
  return link;
};

const connectionInfo = async () => {
  const active = await ensureLink();
  const status = await active.session.readVehicleStatus();
  return {
    mode: "local",
    vciName: config.vci.name,
    vciSerial: config.vci.serial,
    protocol: config.vci.protocol,
    vin: active.vin,
    batteryVoltage: status.batteryVoltage,
    ignitionOn: status.ignitionOn,
  };
};

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

type Handler = (
  params: Record<string, unknown>,
  emit: (payload: unknown) => void,
) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  connect: async () => connectionInfo(),
  status: async () => connectionInfo(),

  readIdentification: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    await session.enterSession(ecu);
    return session.readIdentification(ecu);
  },

  readDtcs: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    try {
      await session.enterSession(ecu);
      return await session.readDtcs(ecu);
    } catch (error) {
      log(`readDtcs ${ecu} failed: ${(error as Error).message}`);
      return { ecuId: ecu, responded: false, dtcs: [] };
    }
  },

  clearDtcs: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    await session.enterSession(ecu);
    return session.clearDtcs(ecu, (params["codes"] as string[] | null) ?? null);
  },

  readFreezeFrame: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    await session.enterSession(ecu);
    return session.readFreezeFrame(ecu, asString(params["code"]));
  },

  readLiveData: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    return session.readLiveData(ecu, (params["dids"] as string[] | undefined) ?? []);
  },

  requestSecurityAccess: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    const level = Number(params["level"] ?? 1);
    try {
      const result = await session.securityAccess(ecu, level);
      return { ok: result.ok, level, trace: session.takeTrace() };
    } catch (error) {
      return {
        ok: false,
        level,
        trace: session.takeTrace(),
        error:
          error instanceof UdsNegativeResponse
            ? { nrc: error.nrcHex, meaning: error.meaning }
            : { nrc: "0x00", meaning: (error as Error).message },
      };
    }
  },

  executeStep: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    const processName = asString(params["process"]);
    const stepIndex = Number(params["stepIndex"] ?? 0);
    const label = asString(params["label"]);
    const mapping = config.processes?.[processName]?.find((entry) => entry.step === stepIndex);

    if (!mapping) {
      return {
        ok: true,
        message: `${label} — acknowledged (no UDS request mapped for this step)`,
        trace: session.takeTrace(),
      };
    }

    try {
      const input = asString(params["input"]);
      const raw = mapping.request.replace(/\{input\}/g, input.replace(/[^0-9a-fA-F]/g, ""));
      const response = await session.sendRaw(ecu, raw);
      return {
        ok: true,
        message: mapping.description ?? `${label} — completed`,
        readback: response,
        trace: session.takeTrace(),
      };
    } catch (error) {
      return {
        ok: false,
        message: `${label} failed`,
        trace: session.takeTrace(),
        error:
          error instanceof UdsNegativeResponse
            ? { nrc: error.nrcHex, meaning: error.meaning }
            : { nrc: "0x00", meaning: (error as Error).message },
      };
    }
  },

  runRoutine: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    const routine = asString(params["routine"]);
    const action = (asString(params["action"], "start") as "start" | "stop" | "status");
    try {
      await session.enterSession(ecu);
      const result = await session.runRoutine(ecu, routine, action);
      return {
        ok: true,
        message: `Routine ${action} accepted${result.routineStatus ? ` (status ${result.routineStatus})` : ""}`,
        trace: session.takeTrace(),
      };
    } catch (error) {
      return {
        ok: false,
        message: `Routine ${action} rejected`,
        trace: session.takeTrace(),
        error:
          error instanceof UdsNegativeResponse
            ? { nrc: error.nrcHex, meaning: error.meaning }
            : { nrc: "0x00", meaning: (error as Error).message },
      };
    }
  },

  startProgramming: async (params, emit) => {
    const { session } = await ensureLink();
    const flow = asString(params["flow"]);
    const pkg = asString(params["pkg"]);
    const ecu = asString(params["ecu"], flow.split(" ")[0] ?? "CCU");
    const phases = ["Preconditions", "Security access", "Transfer", "Verify"];
    const report = (phaseIndex: number, percent: number, message: string, state: string) =>
      emit({ phaseIndex, phaseCount: phases.length, phase: phases[phaseIndex], percent, message, state });

    try {
      report(0, 5, "Entering programming session", "running");
      await session.enterSession(ecu, 0x02);
      report(1, 20, "Requesting security access L17", "running");
      await session.securityAccess(ecu, 17);
      report(2, 30, `Transferring ${pkg}`, "running");
      await session.downloadPackage(ecu, pkg, (percent, message) =>
        report(2, 30 + Math.round(percent * 0.6), message, "running"),
      );
      report(3, 95, "Verifying and resetting ECU", "running");
      await session.sendRaw(ecu, "11 01");
      report(3, 100, "Programming completed", "done");
      return { ok: true, message: `${flow} completed` };
    } catch (error) {
      const message =
        error instanceof UdsNegativeResponse
          ? `${error.nrcHex} ${error.meaning}`
          : (error as Error).message;
      report(3, 100, message, "failed");
      return { ok: false, message };
    }
  },
};

const server = new WebSocketServer({ host: "127.0.0.1", port: PORT });

server.on("connection", (socket: WebSocket) => {
  log("app connected");
  socket.on("message", async (data) => {
    let message: Request;
    try {
      message = JSON.parse(String(data)) as Request;
    } catch {
      return;
    }
    const { id, method } = message;
    if (!id || !method) return;
    const handler = handlers[method];
    if (!handler) {
      socket.send(JSON.stringify({ id, type: "error", message: `Unknown method ${method}` }));
      return;
    }
    try {
      const payload = await handler(message.params ?? {}, (event) =>
        socket.send(JSON.stringify({ id, type: "event", payload: event })),
      );
      socket.send(JSON.stringify({ id, type: "result", payload }));
    } catch (error) {
      const text =
        error instanceof UdsNegativeResponse
          ? `${error.nrcHex} ${error.meaning}`
          : (error as Error).message;
      log(`${method} failed: ${text}`);
      socket.send(JSON.stringify({ id, type: "error", message: text }));
    }
  });
  socket.on("close", () => log("app disconnected"));
});

server.on("listening", () => {
  log(`listening on ws://127.0.0.1:${PORT}`);
  log(`tester address ${config.tester.sourceAddress}, ${Object.keys(config.ecus).length} ECUs mapped`);
});

const shutdown = () => {
  link?.client.close();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { handlers, hex };
