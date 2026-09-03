import { Activity, Play, RotateCw, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Ecu, RoutineDefinition, SignalLayout } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { describeNrcWithHint } from "@/features/bridge/types";
import type { TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { routineLabel } from "@/features/processes/routine-labels";
import { useAppStore } from "@/store/app-store";
import { canPerform, roleTooltip } from "@/lib/roles";
import { cn } from "@/lib/utils";

type RunState = { running: boolean; line: string; ok: boolean | null };

/**
 * Routine control (0x31) with typed parameters from the canonical
 * `routineDefinitions`. Seeds without canonical routines fall back to the
 * identifier list, which keeps the legacy behaviour working.
 */
export function RoutinePanel({ ecu }: { ecu: Ecu }) {
  const { bridge } = useBridge();
  const appendEvent = useAppStore((s) => s.appendEvent);
  const role = useAppStore((s) => s.role);
  const [states, setStates] = useState<Record<string, RunState>>({});
  const [params, setParams] = useState<Record<string, string>>({});
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);

  const allowed = canPerform(role, "routine");

  const definitions: RoutineDefinition[] =
    ecu.routineDefinitions && ecu.routineDefinitions.length > 0
      ? ecu.routineDefinitions
      : ecu.routines.map((routine, index) => ({
          rid: 0xf000 + index,
          name: routineLabel(routine),
          subFunctions: ["start", "stop", "status"],
        }));

  const paramValues = (definition: RoutineDefinition): Record<string, number> =>
    Object.fromEntries(
      (definition.params ?? []).map((layout: SignalLayout) => [
        layout.name,
        Number(params[`${definition.rid}:${layout.name}`] ?? 0) || 0,
      ]),
    );

  const run = async (definition: RoutineDefinition, subFunction: "start" | "stop" | "status") => {
    const key = String(definition.rid);
    setStates((prev) => ({
      ...prev,
      [key]: { running: subFunction === "start", line: "Requesting 31…", ok: null },
    }));

    const result = await bridge.runRoutineById({
      ecu,
      rid: definition.rid,
      name: definition.name,
      subFunction,
      params: paramValues(definition),
    });

    setTrace((prev) => [...prev, ...result.trace]);
    setTraceOpen(true);
    setStates((prev) => ({
      ...prev,
      [key]: {
        running: subFunction === "start" && result.ok,
        line: result.error ? describeNrcWithHint(result.error.nrc) : result.message,
        ok: result.ok,
      },
    }));
    appendEvent({
      kind: "routine",
      title: `${definition.name} · ${ecu.id}`,
      detail: `31 ${subFunction} RID 0x${definition.rid.toString(16).toUpperCase()} — ${result.message}`,
      ecuId: ecu.id,
      status: result.ok ? "ok" : "failed",
      trace: result.trace,
    });
    if (!result.ok) toast.error(result.message);
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Activity className="size-4" />
        Routines (0x31) · {definitions.length}
      </h3>

      {definitions.length === 0 && (
        <p className="rounded-2xl bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground hairline">
          This control unit publishes no routine identifiers.
        </p>
      )}

      <ul className="space-y-2">
        {definitions.map((definition) => {
          const state = states[String(definition.rid)];
          return (
            <li key={definition.rid} className="rounded-2xl bg-secondary/40 p-4 hairline">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{definition.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground numerals">
                    RID 0x{definition.rid.toString(16).toUpperCase().padStart(4, "0")}
                  </p>
                  <p
                    className={cn(
                      "mt-1 truncate text-xs",
                      state?.ok === false ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {state?.line ?? "Idle · routine control ready"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {definition.subFunctions.includes("start") && (
                    <Button
                      variant={state?.running ? "destructive" : "secondary"}
                      className="h-11 rounded-full"
                      disabled={!allowed}
                      title={allowed ? undefined : roleTooltip("routine")}
                      onClick={() => void run(definition, state?.running ? "stop" : "start")}
                    >
                      {state?.running ? <Square className="size-4" /> : <Play className="size-4" />}
                      {state?.running ? "Stop" : "Start"}
                    </Button>
                  )}
                  {definition.subFunctions.includes("status") && (
                    <Button
                      variant="ghost"
                      className="h-11 rounded-full"
                      disabled={!allowed}
                      title={allowed ? undefined : roleTooltip("routine")}
                      onClick={() => void run(definition, "status")}
                    >
                      <RotateCw className="size-4" />
                      Results
                    </Button>
                  )}
                </div>
              </div>

              {(definition.params ?? []).length > 0 && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(definition.params ?? []).map((layout) => {
                    const id = `${definition.rid}:${layout.name}`;
                    return (
                      <div key={id}>
                        <Label htmlFor={id} className="text-xs">
                          {layout.name}
                          {layout.unit ? ` (${layout.unit})` : ""}
                        </Label>
                        <Input
                          id={id}
                          inputMode="decimal"
                          value={params[id] ?? ""}
                          onChange={(event) =>
                            setParams((prev) => ({ ...prev, [id]: event.target.value }))
                          }
                          className="mt-1 h-11 rounded-xl font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <TraceConsole
        trace={trace}
        open={traceOpen}
        onToggle={() => setTraceOpen((prev) => !prev)}
        className="rounded-2xl border"
      />
    </div>
  );
}
