import type { TraceLine } from "./types";

/** Technician input shapes the runner can render inline. */
export type ProcessInputKind = "text" | "number" | "choice" | "confirm" | "vin";

/**
 * Event protocol shared by the SimulatorBridge and the hardware agent's
 * process interpreter. Both bridges emit exactly these events so
 * `guided-runner.tsx` has a single code path.
 */
export type ProcessRunEvent =
  | { type: "step-start"; stepId: string; index: number; total: number; title: string }
  | { type: "step-done"; stepId: string; ok: boolean; message?: string }
  | { type: "output"; level: "information" | "warning" | "error"; text: string }
  | {
      type: "input-required";
      variable: string;
      prompt: string;
      inputType: ProcessInputKind;
      options?: string[];
    }
  | { type: "negative-response"; nrc: string; meaning: string; ecuId?: string }
  | { type: "trace"; line: TraceLine }
  | { type: "finished"; ok: boolean; message: string }
  | { type: "aborted"; message: string }
  | { type: "error"; message: string };

export type ProcessRunHandle = { runId: string };

export type RunProcessOptions = {
  variables?: Record<string, string>;
  onEvent: (event: ProcessRunEvent) => void;
};

export const isTerminalProcessEvent = (event: ProcessRunEvent): boolean =>
  event.type === "finished" || event.type === "aborted" || event.type === "error";

/** Maps an agent (`packages/protocol`) process event onto the shared union. */
export const fromAgentProcessEvent = (raw: unknown): ProcessRunEvent | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const event = raw as Record<string, unknown>;
  const at = new Date().toISOString();

  switch (event["type"]) {
    case "output":
      return {
        type: "output",
        level: (event["level"] as "information" | "warning" | "error") ?? "information",
        text: String(event["text"] ?? ""),
      };
    case "input":
      return {
        type: "input-required",
        variable: String(event["variable"] ?? "value"),
        prompt: String(event["prompt"] ?? "Enter a value"),
        inputType: (event["inputType"] as ProcessInputKind) ?? "text",
        ...(Array.isArray(event["options"]) ? { options: event["options"] as string[] } : {}),
      };
    case "request":
      return {
        type: "trace",
        line: {
          id: `a${at}${String(event["hex"] ?? "")}`,
          direction: "tx",
          text: String(event["hex"] ?? ""),
          at,
        },
      };
    case "response":
      return {
        type: "trace",
        line: {
          id: `a${at}${String(event["hex"] ?? "")}`,
          direction: "rx",
          text: String(event["hex"] ?? ""),
          at,
        },
      };
    case "negative":
      return {
        type: "negative-response",
        nrc: String(event["nrc"] ?? "0x00"),
        meaning: String(event["meaning"] ?? "negative response"),
        ...(event["ecuId"] ? { ecuId: String(event["ecuId"]) } : {}),
      };
    case "trace":
      return {
        type: "trace",
        line: {
          id: `a${at}${String(event["text"] ?? "")}`,
          direction: (event["direction"] as TraceLine["direction"]) ?? "info",
          text: String(event["text"] ?? ""),
          at: String(event["at"] ?? at),
        },
      };
    case "done":
      return {
        type: "finished",
        ok: Boolean(event["ok"]),
        message: String(event["message"] ?? ""),
      };
    default:
      return null;
  }
};
