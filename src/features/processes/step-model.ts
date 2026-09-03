import type { ProcessStep, ServiceProcess } from "@/data/vehicle-data";

export type RunnerStepLevel = "information" | "warning" | "error";

export type ChoiceOption = { value: string; label: string };

export type RunnerStep =
  | { kind: "message"; id: string; title: string; text: string; level: RunnerStepLevel }
  | { kind: "security"; id: string; title: string; text: string; level: number }
  | {
      kind: "input";
      id: string;
      title: string;
      text: string;
      field: "vin" | "text";
      placeholder: string;
    }
  | { kind: "choice"; id: string; title: string; text: string; options: ChoiceOption[] };

const OUTCOME_BRANCH = /(fail|failed|timeout|different from the input|unsuccessful|error)/i;
const NUMBERED = /(\d+)\s*[:：]\s*([^\d]+?)(?=\s*\d+\s*[:：]|$)/g;

/** Parses prompts such as "0: Middle East 1: Central Asia" into radio options. */
export const parseChoices = (text: string): ChoiceOption[] => {
  const options: ChoiceOption[] = [];
  NUMBERED.lastIndex = 0;
  let match = NUMBERED.exec(text);
  while (match) {
    const label = (match[2] ?? "").replace(/[.,;·]+$/, "").trim();
    if (label.length > 1 && label.length < 40) options.push({ value: match[1]!, label });
    match = NUMBERED.exec(text);
  }
  return options.length >= 2 ? options : [];
};

const levelOf = (step: ProcessStep): RunnerStepLevel =>
  step.level === "warning" ? "warning" : step.level === "error" ? "error" : "information";

const shortTitle = (text: string): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const firstSentence = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;
  return firstSentence.length > 72 ? `${firstSentence.slice(0, 69)}…` : firstSentence;
};

type InputSpec = {
  title: string;
  text: string;
  field: "vin" | "text";
  placeholder: string;
};

type ChoiceSpec = { title: string; text: string; options: ChoiceOption[] };

/** Technician input the legacy tool asked for, derived from the process semantics. */
const inputSpecFor = (process: ServiceProcess): InputSpec | null => {
  const name = process.name.toLowerCase();
  if (name.includes("vin")) {
    return {
      title: "Enter the vehicle VIN",
      text: "Type the 17-character VIN from the windscreen plate. It is written to the control unit and read back for verification.",
      field: "vin",
      placeholder: "HJ4ABBHK4RN000080",
    };
  }
  if (name.includes("baseline")) {
    return {
      title: "Enter the baseline version",
      text: "Type the baseline version number from the release note, for example R11OS-BL-0.98.",
      field: "text",
      placeholder: "R11OS-BL-0.98",
    };
  }
  if (name.includes("rfr") || name.includes("tpms") || name.includes("sensor")) {
    return {
      title: "Enter the sensor ID",
      text: "Type the 8-character sensor identifier printed on the new component.",
      field: "text",
      placeholder: "4A1F9C22",
    };
  }
  if (name.includes("key") || process.securityLevel === 17) {
    return {
      title: "Enter the key identifier",
      text: "Type the key identifier from the key tag, or the immobiliser PIN supplied by the OEM portal.",
      field: "text",
      placeholder: "SK-0042-118",
    };
  }
  if (name.includes("pump") || name.includes("drive") || name.includes("damper")) {
    return {
      title: "Enter the command value",
      text: "Type the requested duty cycle in percent (0–100). The actuator is driven at this value while the step runs.",
      field: "text",
      placeholder: "60",
    };
  }
  return null;
};

const choiceSpecFor = (process: ServiceProcess): ChoiceSpec | null => {
  const name = process.name.toLowerCase();
  if (name.includes("config word") || name.includes("configuration")) {
    return {
      title: "Select the destination market",
      text: "Choose the market variant to write into the configuration word. 0: Middle East 1: Central Asia 2: Africa 3: Generic export",
      options: [
        { value: "0", label: "Middle East" },
        { value: "1", label: "Central Asia" },
        { value: "2", label: "Africa" },
        { value: "3", label: "Generic export" },
      ],
    };
  }
  if (name.includes("speaker")) {
    return {
      title: "Select the speaker channel",
      text: "Choose the channel to drive. 0: Front left 1: Front right 2: Rear left 3: Rear right 4: Centre",
      options: [
        { value: "0", label: "Front left" },
        { value: "1", label: "Front right" },
        { value: "2", label: "Rear left" },
        { value: "3", label: "Rear right" },
        { value: "4", label: "Centre" },
      ],
    };
  }
  return null;
};

/**
 * Turns the seed process definition into the linear timeline the runner walks.
 * Outcome-branch messages from the legacy data are dropped; security access and
 * technician input steps are inserted where the process requires them.
 */
export const buildRunnerSteps = (process: ServiceProcess): RunnerStep[] => {
  const source =
    process.steps.length > 0 ? process.steps : [{ type: "output", text: process.name }];
  const messages = source.filter((step) => {
    const text = step.text ?? step.label ?? "";
    return text.trim().length > 0 && !OUTCOME_BRANCH.test(text);
  });
  const usable = messages.length > 0 ? messages : source;

  const steps: RunnerStep[] = [];
  const first = usable[0];
  if (first) {
    const text = first.text ?? first.label ?? process.name;
    steps.push({
      kind: "message",
      id: "s0",
      title: shortTitle(text),
      text,
      level: levelOf(first),
    });
  }

  if (process.securityLevel > 0) {
    steps.push({
      kind: "security",
      id: "sec",
      level: process.securityLevel,
      title: `Security access L${process.securityLevel}`,
      text:
        process.securityLevel === 17
          ? "Immobiliser level unlock (27 11/12). The control unit only accepts key operations after a successful seed/key exchange."
          : "Extended session unlock (27 01/02). The control unit grants write access after a successful seed/key exchange.",
    });
  }

  const choice = choiceSpecFor(process);
  if (choice) {
    const parsed = parseChoices(choice.text);
    steps.push({
      kind: "choice",
      id: "choice",
      title: choice.title,
      text: choice.text,
      options: parsed.length >= 2 ? parsed : choice.options,
    });
  }

  const input = inputSpecFor(process);
  if (input) {
    steps.push({
      kind: "input",
      id: "input",
      title: input.title,
      text: input.text,
      field: input.field,
      placeholder: input.placeholder,
    });
  }

  usable.slice(1).forEach((step, index) => {
    const text = step.text ?? step.label ?? `${process.name} — step ${index + 2}`;
    const parsed = parseChoices(text);
    if (parsed.length >= 2) {
      steps.push({
        kind: "choice",
        id: `s${index + 1}`,
        title: shortTitle(text),
        text,
        options: parsed,
      });
      return;
    }
    steps.push({
      kind: "message",
      id: `s${index + 1}`,
      title: shortTitle(text),
      text,
      level: levelOf(step),
    });
  });

  return steps;
};

export const CATEGORY_ORDER = [
  "Reset",
  "Coding",
  "Immobiliser",
  "Calibration",
  "Actuator test",
  "Service",
] as const;

export const securityLabel = (level: number): string =>
  level === 17 ? "L17 Immobiliser" : level === 1 ? "L1 Extended" : "L0 None";
