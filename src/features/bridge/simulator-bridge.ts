import type { Dtc, Ecu, ProgrammingFlow, ServiceProcess } from "@/data/vehicle-data";
import { DID_LABELS, identDidsFor } from "@/data/vehicle-data";
import { liveDataCatalog } from "./live-data";
import { nrcMeaning } from "./types";
import type {
  ConnectionInfo,
  DiagnosticBridge,
  DtcRecord,
  DtcStatusFlags,
  EcuDtcResult,
  FreezeFrame,
  IdentificationEntry,
  LiveDataSignal,
  ProgrammingProgressEvent,
  RoutineExecution,
  SecurityAccessResult,
  StepExecution,
  TraceLine,
} from "./types";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const hash = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const round = (value: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

let traceCounter = 0;
const line = (direction: TraceLine["direction"], text: string): TraceLine => {
  traceCounter += 1;
  return { id: `t${traceCounter}`, direction, text, at: new Date().toISOString() };
};

const hex = (value: number, bytes = 1) =>
  Math.abs(Math.round(value))
    .toString(16)
    .toUpperCase()
    .padStart(bytes * 2, "0")
    .slice(0, bytes * 2);

const randomBytes = (count: number) =>
  Array.from({ length: count }, () => hex(Math.random() * 255)).join(" ");

const statusFor = (seed: number): { flags: DtcStatusFlags; byte: string } => {
  const current = seed % 3 !== 0;
  const flags: DtcStatusFlags = {
    current,
    pending: seed % 5 === 0,
    confirmed: current || seed % 4 === 0,
    testFailedThisCycle: current && seed % 2 === 0,
  };
  let byte = 0;
  if (flags.testFailedThisCycle) byte |= 0x01;
  if (flags.pending) byte |= 0x04;
  if (flags.confirmed) byte |= 0x08;
  if (flags.current) byte |= 0x40;
  byte |= 0x80;
  return { flags, byte: `0x${hex(byte)}` };
};

const toRecord = (ecuId: string, dtc: Dtc, index: number): DtcRecord => {
  const seed = hash(`${ecuId}${dtc.code}${index}`);
  const { flags, byte } = statusFor(seed);
  const lastSeen = new Date(Date.now() - (seed % 900) * 60_000);
  const firstSeen = new Date(lastSeen.getTime() - ((seed % 40) + 1) * 3_600_000);
  return {
    ...dtc,
    ecuId,
    status: flags,
    statusByte: byte,
    occurrences: (seed % 12) + 1,
    firstSeen: firstSeen.toISOString(),
    lastSeen: lastSeen.toISOString(),
  };
};

const pickDtcs = (ecu: Ecu): DtcRecord[] => {
  if (ecu.dtcs.length === 0) return [];
  const roll = Math.random();
  const count = roll < 0.58 ? 0 : roll < 0.85 ? 1 : roll < 0.96 ? 2 : 3;
  const picked = new Map<string, Dtc>();
  let guard = 0;
  while (picked.size < Math.min(count, ecu.dtcs.length) && guard < 30) {
    guard += 1;
    const candidate = ecu.dtcs[Math.floor(Math.random() * ecu.dtcs.length)];
    if (candidate) picked.set(candidate.code, candidate);
  }
  return [...picked.values()].map((dtc, index) => toRecord(ecu.id, dtc, index));
};

export class SimulatorBridge implements DiagnosticBridge {
  readonly mode = "simulator" as const;

  private results = new Map<string, EcuDtcResult>();

  private unlocked = new Set<string>();

  private securityAttempts = new Map<string, number>();

  private runningRoutines = new Set<string>();

  private stepAttempts = new Map<string, number>();


  private battery = round(randomBetween(12.4, 14.2), 1);

  async connect(): Promise<ConnectionInfo> {
    await wait(420);
    this.battery = round(randomBetween(12.3, 14.2), 1);
    return {
      mode: this.mode,
      vciName: "ROX VCI Simulator",
      vciSerial: "SIM-0001-R11",
      protocol: "CAN 500 kbit/s · UDS (ISO 14229)",
      batteryVoltage: this.battery,
      ignitionOn: true,
    };
  }

  async readIdentification(ecu: Ecu): Promise<IdentificationEntry[]> {
    await wait(180 + Math.random() * 220);
    const seed = hash(ecu.id);
    return identDidsFor(ecu).map((did, index) => ({
      did,
      label: DID_LABELS[did] ?? `Data identifier ${did}`,
      value: this.identValue(did, seed + index, ecu),
    }));
  }

  private identValue(did: string, seed: number, ecu: Ecu): string {
    switch (did) {
      case "F187":
        return `31${((seed % 900000) + 100000).toString()}-A`;
      case "F188":
        return `${ecu.id}_SW_${(seed % 9) + 1}.${(seed % 17) + 10}.${(seed % 5) + 1}`;
      case "F18C":
        return `${(seed % 0xffffff).toString(16).toUpperCase().padStart(6, "0")}${ecu.id.slice(0, 3)}`;
      case "F193":
        return `HW${(seed % 4) + 1}.${seed % 9}`;
      case "F195":
        return `0.${(seed % 89) + 10}`;
      default:
        return `0x${(seed % 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
    }
  }

  async readDtcs(ecu: Ecu): Promise<EcuDtcResult> {
    await wait(200 + Math.random() * 380);
    const cached = this.results.get(ecu.id);
    if (cached) return cached;

    const responded = Math.random() > 0.04;
    const result: EcuDtcResult = responded
      ? { ecuId: ecu.id, responded: true, dtcs: pickDtcs(ecu) }
      : { ecuId: ecu.id, responded: false, dtcs: [] };
    this.results.set(ecu.id, result);
    return result;
  }

  async clearDtcs(ecu: Ecu, codes?: string[]): Promise<{ cleared: number }> {
    await wait(320);
    const current = this.results.get(ecu.id)?.dtcs ?? [];
    const remaining = codes ? current.filter((dtc) => !codes.includes(dtc.code)) : [];
    const cleared = current.length - remaining.length;
    this.results.set(ecu.id, { ecuId: ecu.id, responded: true, dtcs: remaining });
    return { cleared };
  }

  async readFreezeFrame(ecu: Ecu, code: string): Promise<FreezeFrame> {
    await wait(260);
    const seed = hash(`${ecu.id}${code}`);
    const recordedAt = new Date(Date.now() - (seed % 720) * 60_000);
    return {
      code,
      ecuId: ecu.id,
      recordNumber: `0x${hex((seed % 8) + 1)}`,
      recordedAt: recordedAt.toISOString(),
      entries: [
        { label: "Battery voltage", value: round(11.4 + (seed % 30) / 10, 1).toFixed(1), unit: "V" },
        { label: "Vehicle speed", value: String(seed % 132), unit: "km/h" },
        { label: "Odometer", value: String(14200 + (seed % 48000)), unit: "km" },
        { label: "Ignition state", value: seed % 3 === 0 ? "Accessory" : "Run", unit: "" },
        { label: "Ambient temperature", value: String(18 + (seed % 26)), unit: "°C" },
        { label: "Operating cycle", value: String(seed % 4200), unit: "" },
      ],
    };
  }

  async readLiveData(ecu: Ecu, dids: string[]): Promise<LiveDataSignal[]> {
    await wait(60);
    const catalog = liveDataCatalog(ecu);
    const selected = dids.length > 0 ? catalog.filter((c) => dids.includes(c.id)) : catalog;
    const phase = Date.now() / 1400;
    return selected.map((definition, index) => {
      const span = definition.max - definition.min;
      const wave = (Math.sin(phase + index) + 1) / 2;
      const noise = randomBetween(-0.04, 0.04);
      const value = definition.min + span * Math.min(1, Math.max(0, wave * 0.8 + 0.1 + noise));
      return {
        id: definition.id,
        label: definition.label,
        unit: definition.unit,
        min: definition.min,
        max: definition.max,
        value: round(value, span <= 5 ? 2 : span <= 200 ? 1 : 0),
      };
    });
  }

  async requestSecurityAccess(ecu: Ecu, level: number): Promise<SecurityAccessResult> {
    const sub = level === 17 ? "11" : "01";
    const trace: TraceLine[] = [
      line("info", `Security access L${level} (27 ${sub}/${hex(parseInt(sub, 16) + 1)})`),
      line("tx", `27 ${sub}`),
    ];
    await wait(280);
    const seed = `${ecu.id}:${level}`;
    const attempts = (this.securityAttempts.get(seed) ?? 0) + 1;
    this.securityAttempts.set(seed, attempts);

    // Realistic but forgiving: roughly 1 in 20 first unlocks is rejected, and a
    // retry always succeeds so a technician never gets stuck on the simulator.
    if (attempts === 1 && Math.random() < 0.05) {
      const nrc = Math.random() < 0.4 ? "0x35" : "0x33";
      trace.push(line("rx", `7F 27 ${nrc.slice(2)}`));
      return { ok: false, level, trace, error: { nrc, meaning: nrcMeaning(nrc) } };
    }


    const seedBytes = randomBytes(4);
    trace.push(line("rx", `67 ${sub} ${seedBytes}`));
    trace.push(line("tx", `27 ${hex(parseInt(sub, 16) + 1)} ${randomBytes(4)}`));
    await wait(220);
    trace.push(line("rx", `67 ${hex(parseInt(sub, 16) + 1)}`));
    this.unlocked.add(`${ecu.id}:${level}`);
    return { ok: true, level, trace };
  }

  async executeStep(
    process: ServiceProcess,
    stepIndex: number,
    label: string,
    input?: string,
  ): Promise<StepExecution> {
    const sid = process.udsServices[stepIndex % Math.max(1, process.udsServices.length)] ?? "22";
    const trace: TraceLine[] = [];

    if (stepIndex === 0) {
      trace.push(line("tx", "10 03"));
      await wait(160);
      trace.push(line("rx", "50 03 00 32 01 F4"));
    }

    const payload = input ? `${input.slice(0, 17)}` : randomBytes(3);
    trace.push(line("tx", `${sid} ${input ? "F1 90" : randomBytes(2)}`));
    await wait(220 + Math.random() * 320);

    // ~3% of first attempts return a plausible NRC; the retry of the same step
    // always passes so guided processes stay completable.
    const stepKey = `${process.ecu}:${process.name}:${stepIndex}`;
    const stepAttempts = (this.stepAttempts.get(stepKey) ?? 0) + 1;
    this.stepAttempts.set(stepKey, stepAttempts);
    if (stepAttempts === 1 && Math.random() < 0.03) {
      const roll = Math.random();
      const nrc = roll < 0.5 ? "0x22" : roll < 0.8 ? "0x31" : "0x7E";
      trace.push(line("rx", `7F ${sid} ${nrc.slice(2)}`));
      return {
        ok: false,
        message: `${label} failed — negative response ${nrc} ${nrcMeaning(nrc)}`,
        trace,
        error: { nrc, meaning: nrcMeaning(nrc) },
      };
    }


    trace.push(line("rx", `${hex(parseInt(sid, 16) + 0x40)} ${randomBytes(2)}`));
    return {
      ok: true,
      message: label,
      trace,
      ...(input ? { readback: payload } : {}),
    };
  }

  async runRoutine(
    ecu: Ecu,
    routine: string,
    action: "start" | "stop" | "status",
  ): Promise<RoutineExecution> {
    const sub = action === "start" ? "01" : action === "stop" ? "02" : "03";
    const rid = hex(hash(routine) % 0xffff, 2);
    const trace: TraceLine[] = [line("tx", `31 ${sub} ${rid.slice(0, 2)} ${rid.slice(2)}`)];
    await wait(300 + Math.random() * 280);

    const key = `${ecu.id}:${routine}`;
    // Only "start" can be refused, ~2.5% of the time; stop/status always answer
    // so a running actuator can always be shut down.
    if (action === "start" && Math.random() < 0.025) {
      const nrc = Math.random() < 0.7 ? "0x22" : "0x31";
      trace.push(line("rx", `7F 31 ${nrc.slice(2)}`));
      return {
        ok: false,
        message: `Routine rejected — ${nrc} ${nrcMeaning(nrc)}`,
        trace,
        error: { nrc, meaning: nrcMeaning(nrc) },
      };
    }


    trace.push(line("rx", `71 ${sub} ${rid.slice(0, 2)} ${rid.slice(2)} ${randomBytes(1)}`));
    if (action === "start") this.runningRoutines.add(key);
    if (action === "stop") this.runningRoutines.delete(key);

    const message =
      action === "start"
        ? "Actuator running — observe the component"
        : action === "stop"
          ? "Actuator stopped and returned to idle"
          : this.runningRoutines.has(key)
            ? "Routine active"
            : "Routine idle";
    return { ok: true, message, trace };
  }

  async startProgramming(
    flow: ProgrammingFlow,
    pkg: string,
    onProgress: (event: ProgrammingProgressEvent) => void,
  ): Promise<{ ok: boolean; message: string }> {
    const phases = flow.phases;
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const phase = phases[phaseIndex]!;
      for (let tick = 0; tick <= 10; tick += 1) {
        const percent = Math.round(((phaseIndex + tick / 10) / phases.length) * 100);
        onProgress({
          phaseIndex,
          phaseCount: phases.length,
          phase,
          percent,
          message: tick === 10 ? `${phase} — complete` : `${phase} — transferring ${pkg}`,
          state: "running",
        });
        await wait(140);
      }
    }
    onProgress({
      phaseIndex: phases.length - 1,
      phaseCount: phases.length,
      phase: phases[phases.length - 1] ?? flow.name,
      percent: 100,
      message: `${flow.name} finished · ${pkg} activated`,
      state: "done",
    });
    return { ok: true, message: `${flow.name} completed for ${flow.ecus.join(", ")}.` };
  }
}
