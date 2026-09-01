import type { Dtc, Ecu, ProgrammingFlow, ServiceProcess } from "@/data/vehicle-data";
import { DID_LABELS, identDidsFor } from "@/data/vehicle-data";
import { liveDataCatalog } from "./live-data";
import type {
  ConnectionInfo,
  DiagnosticBridge,
  EcuDtcResult,
  IdentificationEntry,
  LiveDataSignal,
  ProcessStepEvent,
  ProgrammingProgressEvent,
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

const pickDtcs = (ecu: Ecu): Dtc[] => {
  if (ecu.dtcs.length === 0) return [];
  const roll = Math.random();
  const count = roll < 0.62 ? 0 : roll < 0.88 ? 1 : roll < 0.97 ? 2 : 3;
  const picked = new Map<string, Dtc>();
  while (picked.size < Math.min(count, ecu.dtcs.length)) {
    const candidate = ecu.dtcs[Math.floor(Math.random() * ecu.dtcs.length)];
    if (candidate) picked.set(candidate.code, candidate);
  }
  return [...picked.values()];
};

const clearedDtcs = new Set<string>();

export class SimulatorBridge implements DiagnosticBridge {
  readonly mode = "simulator" as const;

  private results = new Map<string, EcuDtcResult>();

  async connect(): Promise<ConnectionInfo> {
    await wait(420);
    return {
      mode: this.mode,
      vciName: "ROX VCI Simulator",
      vciSerial: "SIM-0001-R11",
      protocol: "CAN 500 kbit/s · UDS (ISO 14229)",
      batteryVoltage: round(randomBetween(12.1, 14.2), 1),
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
        return `31${(seed % 900000 + 100000).toString()}-A`;
      case "F188":
        return `${ecu.id}_SW_${(seed % 9) + 1}.${(seed % 17) + 10}.${(seed % 5) + 1}`;
      case "F18C":
        return `${(seed % 0xffffff).toString(16).toUpperCase().padStart(6, "0")}${ecu.id.slice(0, 3)}`;
      case "F193":
        return `HW${(seed % 4) + 1}.${(seed % 9)}`;
      case "F195":
        return `0.${(seed % 89) + 10}`;
      default:
        return `0x${(seed % 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
    }
  }

  async readDtcs(ecu: Ecu): Promise<EcuDtcResult> {
    await wait(200 + Math.random() * 380);
    const responded = Math.random() > 0.04;
    if (!responded) {
      const noResponse: EcuDtcResult = { ecuId: ecu.id, responded: false, dtcs: [] };
      this.results.set(ecu.id, noResponse);
      return noResponse;
    }
    const existing = this.results.get(ecu.id);
    const dtcs = existing && clearedDtcs.has(ecu.id) ? [] : (existing?.dtcs ?? pickDtcs(ecu));
    const result: EcuDtcResult = { ecuId: ecu.id, responded: true, dtcs };
    this.results.set(ecu.id, result);
    return result;
  }

  async clearDtcs(ecu: Ecu): Promise<{ cleared: number }> {
    await wait(320);
    const cleared = this.results.get(ecu.id)?.dtcs.length ?? 0;
    clearedDtcs.add(ecu.id);
    this.results.set(ecu.id, { ecuId: ecu.id, responded: true, dtcs: [] });
    return { cleared };
  }

  async readLiveData(ecu: Ecu, dids: string[]): Promise<LiveDataSignal[]> {
    await wait(120);
    const catalog = liveDataCatalog(ecu);
    const selected = dids.length > 0 ? catalog.filter((c) => dids.includes(c.id)) : catalog;
    return selected.map((definition) => ({
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      min: definition.min,
      max: definition.max,
      value: round(randomBetween(definition.min, definition.max), definition.max <= 20 ? 2 : 0),
    }));
  }

  async runProcess(
    process: ServiceProcess,
    onStep: (event: ProcessStepEvent) => void,
  ): Promise<{ ok: boolean; message: string }> {
    const steps = process.steps.length > 0 ? process.steps : [{ type: "output", text: process.name }];
    const failAt = Math.random() < 0.12 ? Math.floor(Math.random() * steps.length) : -1;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      const text = step.text ?? step.label ?? `${process.name} — step ${index + 1}`;
      const level =
        step.level === "warning" ? "warning" : step.level === "error" ? "error" : "information";
      onStep({ index, total: steps.length, text, level, state: "running" });
      await wait(520 + Math.random() * 620);

      if (index === failAt) {
        onStep({
          index,
          total: steps.length,
          text: `${text} — negative response 0x7F ${process.udsServices[0] ?? "22"} 0x31 (requestOutOfRange)`,
          level: "error",
          state: "failed",
        });
        return { ok: false, message: "Process aborted by ECU negative response." };
      }

      onStep({ index, total: steps.length, text, level, state: "done" });
    }

    return { ok: true, message: `${process.name} completed successfully.` };
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
