import { describe, expect, it } from "vitest";

import { ProcessInterpreter } from "../agent/src/process-interpreter.ts";
import { canonicalSteps, seedProcesses } from "../agent/src/process-catalog.ts";

/**
 * Every process in the shipped seed must at least be interpretable end to end. A prompt-only
 * process is fine; a process that throws means the step tree is malformed.
 */
describe("dry run over every seed process", () => {
  const processes = seedProcesses();

  it("has processes in the seed", () => {
    expect(processes.length).toBeGreaterThan(0);
  });

  it("interprets all of them without throwing", async () => {
    let executable = 0;
    let promptOnly = 0;
    const failures: string[] = [];

    for (const process of processes) {
      const result = await new ProcessInterpreter(null, { dryRun: true }).run(
        canonicalSteps(process),
      );
      if (!result.ok) failures.push(`${process.name}: ${result.message}`);
      else if (result.executed > 0) executable += 1;
      else promptOnly += 1;
    }

    process.stdout.write(
      `[dry-run] ${processes.length} processes: ${executable} executable, ${promptOnly} prompt-only\n`,
    );
    expect(failures).toEqual([]);
    expect(executable + promptOnly).toBe(processes.length);
  });
});
