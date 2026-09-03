import { WebSocketServer, type WebSocket } from "ws";

import { PROTOCOL_VERSION } from "../../packages/protocol/src/index.ts";
import { JobLogger, readJobLog } from "./job-log.ts";
import { ProcessInterpreter } from "./process-interpreter.ts";
import { canonicalSteps, findProcess } from "./process-catalog.ts";
import { scanVehicle } from "./scan.ts";
import { VehicleSession } from "./session.ts";
import { createTransport, type Transport } from "./transport/index.ts";
import { UdsNegativeResponse, hex } from "./uds.ts";
import {
  type AgentConfig,
  AgentConfigError,
  assertStartupSafe,
  loadCatalog,
  loadConfig,
} from "./config.ts";

const AGENT_VERSION = "0.3.0";

const PORT = Number(process.env["ROX_AGENT_PORT"] ?? 9097);

type Request = { id?: string; method?: string; params?: Record<string, unknown> };

type VehicleLink = {
  transport: Transport;
  session: VehicleSession;
  vin: string;
};

type ProcessRun = { interpreter: ProcessInterpreter; promise: Promise<unknown> };

const runs = new Map<string, ProcessRun>();
let runCounter = 0;

let link: VehicleLink | null = null;

const config: AgentConfig = (() => {
  try {
    const loaded = loadConfig();
    const problems = assertStartupSafe(loaded);
    for (const problem of problems) {
      process.stderr.write(`[rox-agent] WARNING (override): ${problem.message}\n`);
    }
    return loaded;
  } catch (error) {
    process.stderr.write(
      `[rox-agent] ${error instanceof AgentConfigError ? error.message : (error as Error).message}\n`,
    );
    return process.exit(1);
  }
})();

const log = (message: string) => {
  process.stdout.write(`[rox-agent] ${message}\n`);
};

const ensureLink = async (): Promise<VehicleLink> => {
  if (link?.transport.connected) return link;
  const transport = createTransport(config);
  await transport.open();
  const session = new VehicleSession(transport);
  const vin = (transport as { vin?: string }).vin ?? "";
  link = { transport, session, vin };
  log(`connected over ${config.transport.kind}${vin ? ` (VIN ${vin})` : ""}`);
  return link;
};

/** Protocol v2 handshake: version, data checksum, VCI metadata and transport kind. */
const connectionInfo = async () => {
  const active = await ensureLink();
  const status = await active.session.readVehicleStatus();
  const vci = active.transport.info;
  return {
    mode: "local" as const,
    agentVersion: AGENT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    dataChecksum: config.dataChecksum ?? loadCatalog().dataChecksum ?? null,
    vci,
    transport: config.transport.kind,
    vciName: vci.vciName,
    vciSerial: vci.vciSerial,
    protocol: vci.protocolList.join(" / "),
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

  runProcess: async (params, emit) => {
    const dryRun = Boolean(params["dryRun"]);
    const processId = asString(params["processId"] ?? params["process"]);
    const process = findProcess(processId);
    if (!process) throw new Error(`Unknown process "${processId}"`);

    const jobId = asString(params["jobId"]);
    const logger = jobId ? new JobLogger(jobId, asString(params["vin"])) : null;
    const session = dryRun ? null : (await ensureLink()).session;
    runCounter += 1;
    const runId = `run-${runCounter}`;

    const interpreter = new ProcessInterpreter(session, {
      dryRun,
      variables: (params["variables"] as Record<string, string | number | boolean>) ?? {},
      onEvent: (event) => {
        logger?.write("process", JSON.stringify(event));
        emit({ type: "processEvent", runId, event });
      },
    });

    const promise = interpreter.run(canonicalSteps(process));
    runs.set(runId, { interpreter, promise });
    const result = await promise;
    runs.delete(runId);
    return { runId, ...result };
  },

  provideInput: async (params) => {
    const run = runs.get(asString(params["runId"]));
    if (!run) throw new Error("No process is waiting for input");
    return { accepted: run.interpreter.provideInput(asString(params["value"])) };
  },

  abortProcess: async (params) => {
    const run = runs.get(asString(params["runId"]));
    if (!run) return { aborted: false };
    run.interpreter.abort();
    return { aborted: true };
  },

  scanVehicle: async (params, emit) => {
    const { session } = await ensureLink();
    const jobId = asString(params["jobId"]);
    const logger = jobId ? new JobLogger(jobId, asString(params["vin"])) : null;
    const startedAt = new Date().toISOString();
    const results = await scanVehicle(session, {
      ...(Array.isArray(params["ecus"]) ? { ecuIds: params["ecus"] as string[] } : {}),
      ...(params["concurrency"] ? { concurrency: Number(params["concurrency"]) } : {}),
      onEvent: (event) => {
        logger?.write("info", JSON.stringify(event));
        emit(event);
      },
    });
    return { results, startedAt, finishedAt: new Date().toISOString() };
  },

  getJobLog: async (params) => {
    const jobId = asString(params["jobId"]);
    return { jobId, path: new JobLogger(jobId).path, entries: readJobLog(jobId) };
  },

  runRoutine: async (params) => {
    const { session } = await ensureLink();
    const ecu = asString(params["ecu"]);
    const routine = asString(params["routine"]);
    const action = asString(params["action"], "start") as "start" | "stop" | "status";
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
      emit({
        phaseIndex,
        phaseCount: phases.length,
        phase: phases[phaseIndex],
        percent,
        message,
        state,
      });

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
  socket.on("close", () => {
    // Stop the 3E 80 keep-alive: the technician is gone, the ECU may return to default.
    link?.session.dispose();
    log("app disconnected");
  });
});

server.on("listening", () => {
  log(`listening on ws://127.0.0.1:${PORT}`);
  log(
    `tester ${config.tester.sourceAddress}, functional ${config.tester.functionalAddress}, ` +
      `${Object.keys(config.ecus).length} ECUs mapped, ` +
      `P2 ${config.timing.p2} ms / P2* ${config.timing.p2Star} ms / S3 ${config.timing.s3} ms`,
  );
});

const shutdown = () => {
  link?.session.dispose();
  void link?.transport.close();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { handlers, hex };
