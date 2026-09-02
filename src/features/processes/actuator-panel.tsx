import { Activity, Play, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { processKey, processesForEcu, type Ecu, type ServiceProcess } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import type { TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { GuidedRunner } from "@/features/processes/guided-runner";
import { routineLabel } from "@/features/processes/routine-labels";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

type RunState = { running: boolean; line: string; ok: boolean | null };

export function ActuatorPanel({ ecu }: { ecu: Ecu }) {
  const { bridge } = useBridge();
  const appendEvent = useAppStore((s) => s.appendEvent);
  const [states, setStates] = useState<Record<string, RunState>>({});
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [activeProcess, setActiveProcess] = useState<ServiceProcess | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const actuatorProcesses = processesForEcu(ecu.id).filter(
    (process) => process.category === "Actuator test",
  );

  const toggle = async (routine: string) => {
    const current = states[routine];
    const action = current?.running ? "stop" : "start";
    setStates((prev) => ({
      ...prev,
      [routine]: { running: action === "start", line: "Requesting 31…", ok: null },
    }));

    const result = await bridge.runRoutine(ecu, routine, action);
    setTrace((prev) => [...prev, ...result.trace]);
    setTraceOpen(true);
    setStates((prev) => ({
      ...prev,
      [routine]: {
        running: action === "start" && result.ok,
        line: result.error
          ? describeNrcWithHint(result.error.nrc)
          : result.message,
        ok: result.ok,
      },
    }));
    appendEvent({
      kind: "routine",
      title: `${routineLabel(routine)} · ${ecu.id}`,
      detail: `${action === "start" ? "Started" : "Stopped"} routine — ${result.message}`,
      ecuId: ecu.id,
      status: result.ok ? "ok" : "failed",
      trace: result.trace,
    });
    if (!result.ok) toast.error(`Routine rejected — ${result.message}`);
  };

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4" />
          Routines (0x31) · {ecu.routines.length}
        </h3>
        {ecu.routines.length === 0 && (
          <p className="rounded-2xl bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground hairline">
            This control unit publishes no routine identifiers.
          </p>
        )}
        <ul className="space-y-2">
          {ecu.routines.map((routine) => {
            const state = states[routine];
            return (
              <li
                key={routine}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/40 px-4 py-3 hairline"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{routineLabel(routine)}</p>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      state?.ok === false ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {state?.line ?? "Idle · routine control ready"}
                  </p>
                </div>
                <Button
                  variant={state?.running ? "destructive" : "secondary"}
                  className="h-11 rounded-full"
                  onClick={() => void toggle(routine)}
                >
                  {state?.running ? <Square className="size-4" /> : <Play className="size-4" />}
                  {state?.running ? "Stop" : "Start"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {actuatorProcesses.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Actuator test processes</h3>
          <ul className="space-y-2">
            {actuatorProcesses.map((process) => (
              <li
                key={processKey(process)}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/40 px-4 py-3 hairline"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{process.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground numerals">
                    {process.steps.length} steps · UDS {process.udsServices.join(" ")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="h-11 rounded-full"
                  onClick={() => setActiveProcess(process)}
                >
                  <Play className="size-4" />
                  Run
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GuidedRunner
        process={activeProcess}
        open={Boolean(activeProcess)}
        onOpenChange={(open) => !open && setActiveProcess(null)}
      />

      <TraceConsole
        trace={trace}
        open={traceOpen}
        onToggle={() => setTraceOpen((prev) => !prev)}
        className="rounded-2xl border"
      />
    </div>
  );
}
