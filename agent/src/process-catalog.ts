import type { ProcessStep } from "../../packages/canonical-schema/src/index.ts";
import { loadCatalog } from "./config.ts";

export type SeedProcess = {
  id?: string;
  name: string;
  ecu: string;
  category: string;
  securityLevel?: number;
  steps: Array<Record<string, unknown>>;
};

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

/**
 * The canonical extraction emits `kind`-tagged steps. The legacy seed only has
 * `type: "output" | "input"`, so it is lifted into the same union — the interpreter never
 * needs to know which generation of data it is running.
 */
export const toCanonicalStep = (raw: Record<string, unknown>, index: number): ProcessStep => {
  const id = asText(raw["id"], `s${index}`);
  const label = asText(raw["label"] ?? raw["text"], id);
  const kind = asText(raw["kind"] ?? raw["type"], "output");

  if (kind === "input") {
    return {
      kind: "input",
      id,
      label,
      prompt: asText(raw["prompt"] ?? raw["text"], label),
      inputType: (asText(raw["inputType"], "text") as "text") ?? "text",
      variable: asText(raw["variable"], `input${index}`),
      ...(Array.isArray(raw["options"]) ? { options: raw["options"] as string[] } : {}),
    };
  }
  if (kind === "delay") {
    return { kind: "delay", id, label, ms: Number(raw["ms"] ?? 1000) };
  }
  if (kind === "setVar") {
    return {
      kind: "setVar",
      id,
      label,
      variable: asText(raw["variable"], `var${index}`),
      value: (raw["value"] as string | number | boolean) ?? "",
    };
  }
  if (kind === "ecuService") {
    return {
      kind: "ecuService",
      id,
      label,
      ecuId: asText(raw["ecuId"]),
      sid: Number(raw["sid"] ?? 0x22),
      ...(raw["subFunction"] !== undefined ? { subFunction: Number(raw["subFunction"]) } : {}),
      request: (raw["request"] as ProcessStep[] | undefined)
        ? (raw["request"] as never)
        : ([] as never),
      ...(raw["negativeExit"] ? { negativeExit: asText(raw["negativeExit"]) } : {}),
      ...(raw["storeAs"] ? { storeAs: asText(raw["storeAs"]) } : {}),
    };
  }

  const level = asText(raw["level"], "information");
  return {
    kind: "output",
    id,
    label,
    level: (level === "warning" || level === "error" ? level : "information") as "information",
    text: asText(raw["text"], label || "Step"),
  };
};

export const seedProcesses = (): SeedProcess[] => {
  const catalog = loadCatalog() as unknown as { processes?: SeedProcess[] };
  return catalog.processes ?? [];
};

export const findProcess = (idOrName: string): SeedProcess | undefined =>
  seedProcesses().find((entry) => entry.id === idOrName || entry.name === idOrName);

export const canonicalSteps = (process: SeedProcess): ProcessStep[] =>
  process.steps.map((step, index) => toCanonicalStep(step, index));
