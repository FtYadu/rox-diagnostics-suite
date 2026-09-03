import type {
  Condition,
  EcuServiceStep,
  ProcessStep,
  SignalLayout,
} from "../../packages/canonical-schema/src/index.ts";
import type { ProcessEvent } from "../../packages/protocol/src/index.ts";
import type { VehicleSession } from "./session.ts";
import { UdsNegativeResponse, bytesToHex, decodeNumber, hexToBytes } from "./uds.ts";

export type { ProcessEvent };

export type Variables = Record<string, string | number | boolean>;

export type InterpreterOptions = {
  /** No frames are sent in a dry run; requests are only built and reported. */
  dryRun?: boolean;
  variables?: Variables;
  onEvent?: (event: ProcessEvent) => void;
};

export type ProcessResult = {
  ok: boolean;
  message: string;
  variables: Variables;
  /** Steps executed against the ECU, useful for dry-run reporting. */
  executed: number;
  /** Steps that need a technician answer before they can run. */
  prompts: number;
  aborted: boolean;
};

const asNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number.parseFloat(String(value));

const compare = (left: unknown, condition: Condition): boolean => {
  const { comparator, right } = condition;
  if (comparator === "eq") return String(left) === String(right);
  if (comparator === "neq") return String(left) !== String(right);
  if (comparator === "contains") return String(left).includes(String(right));
  const a = asNumber(left);
  const b = asNumber(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (comparator === "lt") return a < b;
  if (comparator === "lte") return a <= b;
  if (comparator === "gt") return a > b;
  return a >= b;
};

/** Decodes one field of a response according to its canonical layout. */
export const decodeLayout = (layout: SignalLayout, bytes: Uint8Array): string | number => {
  const start = layout.byteStart;
  const raw = bytes.slice(start, start + layout.length);
  if (layout.type === "ascii") return new TextDecoder().decode(raw).replace(/\0+$/, "").trim();
  if (layout.type === "hex") return bytesToHex(raw);
  const value =
    decodeNumber(raw, layout.signed ?? false) * (layout.factor ?? 1) + (layout.offset ?? 0);
  const scaled = Number.parseFloat(value.toFixed(3));
  const label = layout.enum?.[String(scaled)];
  return label ?? scaled;
};

export class ProcessAborted extends Error {
  constructor() {
    super("Process aborted by the technician");
    this.name = "ProcessAborted";
  }
}

/**
 * Runs a canonical process step tree. The tree — not a hand-written request map — is the
 * single source of truth, so a process behaves identically in the app, in a dry run and
 * against a real car.
 */
export class ProcessInterpreter {
  private readonly session: VehicleSession | null;

  private readonly dryRun: boolean;

  private readonly onEvent: (event: ProcessEvent) => void;

  private variables: Variables;

  private pendingInput: ((value: string) => void) | null = null;

  private aborted = false;

  private executed = 0;

  private prompts = 0;

  constructor(session: VehicleSession | null, options: InterpreterOptions = {}) {
    this.session = session;
    this.dryRun = options.dryRun ?? !session;
    this.variables = { ...(options.variables ?? {}) };
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  /** Answers the currently pending `input` step. */
  provideInput(value: string): boolean {
    if (!this.pendingInput) return false;
    const resolve = this.pendingInput;
    this.pendingInput = null;
    resolve(value);
    return true;
  }

  abort(): void {
    this.aborted = true;
    if (this.pendingInput) this.provideInput("");
  }

  async run(steps: ProcessStep[]): Promise<ProcessResult> {
    try {
      await this.runSteps(steps);
      this.onEvent({ type: "done", ok: true, message: "Process completed" });
      return this.result(true, "Process completed");
    } catch (error) {
      if (error instanceof ProcessAborted) {
        this.onEvent({ type: "done", ok: false, message: error.message });
        return { ...this.result(false, error.message), aborted: true };
      }
      const message =
        error instanceof UdsNegativeResponse
          ? `${error.nrcHex} ${error.meaning}`
          : (error as Error).message;
      this.onEvent({ type: "done", ok: false, message });
      return this.result(false, message);
    }
  }

  private result(ok: boolean, message: string): ProcessResult {
    return {
      ok,
      message,
      variables: { ...this.variables },
      executed: this.executed,
      prompts: this.prompts,
      aborted: false,
    };
  }

  private async runSteps(steps: ProcessStep[]): Promise<void> {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (!step) continue;
      if (this.aborted) throw new ProcessAborted();
      const jumpTo = await this.runStep(step);
      if (jumpTo) {
        const target = steps.findIndex((entry) => entry.id === jumpTo || entry.label === jumpTo);
        if (target === -1) {
          throw new Error(`negativeExit target "${jumpTo}" not found in this process`);
        }
        index = target - 1;
      }
    }
  }

  /** Returns a step id to jump to, or undefined to continue. */
  private async runStep(step: ProcessStep): Promise<string | undefined> {
    switch (step.kind) {
      case "output":
        this.onEvent({ type: "output", level: step.level, text: this.expand(step.text) });
        return undefined;

      case "setVar":
        this.variables[step.variable] = step.value;
        return undefined;

      case "delay":
        this.onEvent({ type: "output", level: "information", text: `Waiting ${step.ms} ms` });
        if (!this.dryRun) await new Promise((resolve) => setTimeout(resolve, step.ms));
        return undefined;

      case "input": {
        this.prompts += 1;
        this.onEvent({
          type: "input",
          prompt: this.expand(step.prompt),
          inputType: step.inputType,
          variable: step.variable,
          ...(step.options ? { options: step.options } : {}),
        });
        if (this.dryRun) {
          this.variables[step.variable] = "";
          return undefined;
        }
        const value = await new Promise<string>((resolve) => {
          this.pendingInput = resolve;
        });
        if (this.aborted) throw new ProcessAborted();
        this.variables[step.variable] = value;
        return undefined;
      }

      case "if": {
        const left = this.resolve(step.condition.left);
        const branch = compare(left, step.condition) ? step.then : (step.else ?? []);
        await this.runSteps(branch);
        return undefined;
      }

      case "ecuService":
        return this.runService(step);

      default:
        return undefined;
    }
  }

  private async runService(step: EcuServiceStep): Promise<string | undefined> {
    const bytes = this.buildRequest(step);
    this.onEvent({
      type: "request",
      ecuId: step.ecuId,
      hex: bytesToHex(bytes),
      ...(step.label ? { label: step.label } : {}),
    });

    if (this.dryRun || !this.session) {
      this.executed += 1;
      return undefined;
    }

    try {
      if (step.session)
        await this.session.enterSession(step.ecuId, step.session === 1 ? 0x01 : 0x03);
      if (step.saLevel) await this.session.securityAccess(step.ecuId, step.saLevel);
      const response = await this.session.send(step.ecuId, bytes);
      this.executed += 1;
      this.variables["$lastResponse.status"] = "positive";
      this.variables["$lastResponse.nrc"] = "";
      const decoded = this.decodeResponse(step, response);
      if (step.storeAs) this.variables[step.storeAs] = decoded;
      this.onEvent({
        type: "response",
        ecuId: step.ecuId,
        hex: bytesToHex(response),
        ...(step.storeAs ? { storedAs: step.storeAs, value: String(decoded) } : {}),
      });
      return undefined;
    } catch (error) {
      const nrc = error instanceof UdsNegativeResponse ? error.nrcHex : "0x00";
      const meaning =
        error instanceof UdsNegativeResponse ? error.meaning : (error as Error).message;
      this.variables["$lastResponse.status"] = "negative";
      this.variables["$lastResponse.nrc"] = nrc;
      this.onEvent({ type: "negative", ecuId: step.ecuId, nrc, meaning });
      if (step.negativeExit) return step.negativeExit;
      throw error;
    }
  }

  private decodeResponse(step: EcuServiceStep, response: Uint8Array): string | number {
    const layout = step.responseLayout;
    if (!layout || layout.length === 0) return bytesToHex(response);
    if (layout.length === 1 && layout[0]) return decodeLayout(layout[0], response);
    return layout.map((entry) => `${entry.name}=${decodeLayout(entry, response)}`).join(", ");
  }

  /** sid + subFunction + literal bytes and `$variable` references, in order. */
  buildRequest(step: EcuServiceStep): Uint8Array {
    const bytes: number[] = [step.sid];
    if (step.subFunction !== undefined) bytes.push(step.subFunction);
    for (const field of step.request) {
      const source =
        field.variable !== undefined
          ? this.resolve(field.variable)
          : typeof field.value === "string"
            ? this.expand(field.value)
            : field.value;
      bytes.push(...this.toBytes(source, field.length));
    }
    return Uint8Array.from(bytes);
  }

  private toBytes(value: unknown, length?: number): number[] {
    if (typeof value === "number") {
      const size = length ?? (value > 0xff ? 2 : 1);
      const out: number[] = [];
      for (let i = size - 1; i >= 0; i -= 1) out.push((value >> (8 * i)) & 0xff);
      return out;
    }
    const text = String(value ?? "");
    if (/^[0-9a-fA-F\s]+$/.test(text) && text.replace(/\s/g, "").length % 2 === 0) {
      return [...hexToBytes(text)];
    }
    const ascii = [...new TextEncoder().encode(text)];
    return length ? ascii.slice(0, length) : ascii;
  }

  /** `$name` reads a variable; anything else is a literal. */
  private resolve(token: string): string | number | boolean {
    if (!token.startsWith("$")) return token;
    const key = token.slice(1);
    return this.variables[token] ?? this.variables[key] ?? "";
  }

  private expand(text: string): string {
    return text.replace(/\$\{?([\w.]+)\}?/g, (match, name: string) => {
      const value = this.variables[name] ?? this.variables[`$${name}`];
      return value === undefined ? match : String(value);
    });
  }
}
