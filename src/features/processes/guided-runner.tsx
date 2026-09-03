import { AlertTriangle, Check, CircleDot, Info, Lock, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getEcu, processKey, type ServiceProcess } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { describeNrcWithHint } from "@/features/bridge/types";
import type { ProcessRunEvent, TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { securityLabel } from "@/features/processes/step-model";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

type TimelineEntry = {
  id: string;
  title: string;
  state: "running" | "done" | "failed";
  message?: string;
};

type OutputLine = { id: string; level: "information" | "warning" | "error"; text: string };

type PendingInput = {
  variable: string;
  prompt: string;
  inputType: "text" | "number" | "choice" | "confirm" | "vin";
  options?: string[];
};

const LEVEL_TONE = {
  information: "text-foreground",
  warning: "text-warning",
  error: "text-destructive",
} as const;

const LEVEL_ICON = {
  information: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
} as const;

export function GuidedRunner({
  process,
  open,
  onOpenChange,
}: {
  process: ServiceProcess | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { bridge } = useBridge();
  const vin = useAppStore((s) => s.vin);
  const appendEvent = useAppStore((s) => s.appendEvent);

  const key = process ? processKey(process) : "";
  const ecu = process ? getEcu(process.ecu) : undefined;
  const needsGate = process?.securityLevel === 17;

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [outputs, setOutputs] = useState<OutputLine[]>([]);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [pending, setPending] = useState<PendingInput | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [gateVin, setGateVin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [traceOpen, setTraceOpen] = useState(true);

  const runIdRef = useRef<string | null>(null);
  const traceRef = useRef<TraceLine[]>([]);
  const outputsRef = useRef<OutputLine[]>([]);
  const counter = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current = null;
    traceRef.current = [];
    outputsRef.current = [];
    setTimeline([]);
    setOutputs([]);
    setTrace([]);
    setPending(null);
    setInputValue("");
    setRunning(false);
    setResult(null);
    setGateVin("");
    setUnlocked(!needsGate);
    setStartedAt(Date.now());
    setElapsed(0);
  }, [needsGate]);

  useEffect(() => {
    if (open) reset();
  }, [open, key, reset]);

  useEffect(() => {
    if (!open || result) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [open, result, startedAt]);

  const finish = useCallback(
    (ok: boolean, message: string) => {
      if (!process) return;
      setResult({ ok, message });
      setRunning(false);
      setPending(null);
      appendEvent({
        kind: "process",
        title: `${process.name} · ${process.ecu}`,
        detail: [message, ...outputsRef.current.slice(-4).map((line) => line.text)].join(" — "),
        ecuId: process.ecu,
        status: ok ? "ok" : "failed",
        trace: traceRef.current,
      });
    },
    [appendEvent, process],
  );

  const handleEvent = useCallback(
    (event: ProcessRunEvent) => {
      switch (event.type) {
        case "step-start":
          setTimeline((prev) => [
            ...prev.filter((entry) => entry.id !== event.stepId),
            { id: event.stepId, title: event.title, state: "running" },
          ]);
          break;
        case "step-done":
          setTimeline((prev) =>
            prev.map((entry) =>
              entry.id === event.stepId
                ? {
                    ...entry,
                    state: event.ok ? "done" : "failed",
                    ...(event.message ? { message: event.message } : {}),
                  }
                : entry,
            ),
          );
          break;
        case "output": {
          counter.current += 1;
          const line = { id: `o${counter.current}`, level: event.level, text: event.text };
          outputsRef.current = [...outputsRef.current, line];
          setOutputs(outputsRef.current);
          break;
        }
        case "input-required":
          setInputValue(event.inputType === "confirm" ? "yes" : "");
          setPending({
            variable: event.variable,
            prompt: event.prompt,
            inputType: event.inputType,
            ...(event.options ? { options: event.options } : {}),
          });
          break;
        case "negative-response": {
          counter.current += 1;
          const line = {
            id: `o${counter.current}`,
            level: "error" as const,
            text: `Negative response ${event.nrc} — ${describeNrcWithHint(event.nrc)}`,
          };
          outputsRef.current = [...outputsRef.current, line];
          setOutputs(outputsRef.current);
          break;
        }
        case "trace":
          traceRef.current = [...traceRef.current, event.line];
          setTrace(traceRef.current);
          break;
        case "finished":
          finish(event.ok, event.message);
          break;
        case "aborted":
          finish(false, event.message || "Run aborted by the technician.");
          break;
        case "error":
          finish(false, event.message);
          break;
      }
    },
    [finish],
  );

  const start = useCallback(async () => {
    if (!process || running) return;
    setRunning(true);
    setResult(null);
    setStartedAt(Date.now());
    try {
      const handle = await bridge.runProcess(process, { onEvent: handleEvent });
      runIdRef.current = handle.runId;
    } catch (error) {
      finish(false, error instanceof Error ? error.message : String(error));
    }
  }, [bridge, finish, handleEvent, process, running]);

  useEffect(() => {
    if (open && unlocked && !running && !result && timeline.length === 0) void start();
  }, [open, unlocked, running, result, timeline.length, start]);

  const submitInput = async () => {
    if (!pending) return;
    const value = inputValue.trim();
    if (pending.inputType === "vin" && value.length !== 17) {
      toast.error("A VIN must be exactly 17 characters");
      return;
    }
    if (value.length === 0) {
      toast.error("Enter a value to continue");
      return;
    }
    if (pending.inputType === "number" && Number.isNaN(Number(value))) {
      toast.error("Enter a numeric value");
      return;
    }
    setPending(null);
    const runId = runIdRef.current;
    if (!runId) {
      toast.error("The run is not ready for input yet");
      return;
    }
    const { accepted } = await bridge.provideInput(runId, value);
    if (!accepted) toast.error("The bridge did not accept that input");
  };

  const abort = async () => {
    const runId = runIdRef.current;
    if (runId) await bridge.abortProcess(runId);
    else finish(false, "Run aborted before it started.");
  };

  if (!process) return null;

  const seconds = Math.round(elapsed / 1000);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[100dvh] w-screen max-w-none grid-rows-[auto_1fr] gap-0 rounded-none border-0 p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{process.name}</DialogTitle>
        <header className="glass-chrome flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{process.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {process.ecu} · {ecu?.fullName} · {process.category} ·{" "}
              {securityLabel(process.securityLevel)} · UDS {process.udsServices.join(" ")}
            </p>
          </div>
          <p
            className="rounded-full bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground numerals hairline"
            aria-live="off"
          >
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </p>
          {running && !result && (
            <Button
              variant="secondary"
              className="h-11 rounded-full"
              onClick={() => void abort()}
              aria-label="Abort the running process"
            >
              Abort run
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-11 rounded-full"
            onClick={() => onOpenChange(false)}
            aria-label="Close runner"
          >
            <X className="size-4" />
            Close
          </Button>
        </header>

        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <ol
            className="hidden min-h-0 overflow-y-auto border-r p-4 lg:block"
            aria-label="Process steps"
          >
            {timeline.length === 0 && (
              <li className="text-xs text-muted-foreground">Waiting for the first step…</li>
            )}
            {timeline.map((entry) => (
              <li key={entry.id} className="flex gap-3 py-2">
                <span className="mt-0.5">
                  {entry.state === "done" ? (
                    <Check className="size-4 text-success" />
                  ) : entry.state === "failed" ? (
                    <AlertTriangle className="size-4 text-destructive" />
                  ) : (
                    <CircleDot className="size-4 animate-pulse text-primary" />
                  )}
                </span>
                <span className="text-xs leading-5">
                  {entry.title}
                  {entry.message && (
                    <span className="block text-[11px] text-muted-foreground">{entry.message}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div className="min-h-0 overflow-y-auto p-5 sm:p-8">
            {needsGate && !unlocked ? (
              <div className="mx-auto max-w-xl rounded-2xl bg-card/70 p-6 hairline">
                <h2 className="flex items-center gap-2 text-base font-semibold text-warning">
                  <AlertTriangle className="size-5" />
                  Immobiliser-level operation
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  This process unlocks security level 17 and can immobilise the vehicle if it is
                  interrupted. Type the VIN <span className="font-mono text-foreground">{vin}</span>{" "}
                  to confirm you are working on the correct car.
                </p>
                <Label htmlFor="gate-vin" className="mt-5 block text-xs">
                  Vehicle VIN
                </Label>
                <Input
                  id="gate-vin"
                  value={gateVin}
                  onChange={(event) => setGateVin(event.target.value.toUpperCase())}
                  placeholder={vin}
                  className="mt-2 h-11 rounded-xl font-mono"
                />
                <Button
                  className="mt-4 h-11 w-full rounded-full"
                  disabled={gateVin.trim() !== vin}
                  onClick={() => setUnlocked(true)}
                >
                  <ShieldCheck className="size-4" />
                  Confirm and start
                </Button>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                <section
                  aria-live="polite"
                  className="space-y-2 rounded-2xl bg-card/70 p-5 hairline"
                >
                  <h2 className="text-sm font-semibold">Process log</h2>
                  {outputs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Starting the process…</p>
                  )}
                  {outputs.map((line) => {
                    const Icon = LEVEL_ICON[line.level];
                    return (
                      <p
                        key={line.id}
                        className={cn("flex gap-2 text-sm leading-relaxed", LEVEL_TONE[line.level])}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0" />
                        <span>{line.text}</span>
                      </p>
                    );
                  })}
                </section>

                {pending && (
                  <section className="rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/20">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Lock className="size-4 text-primary" />
                      Technician input required
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {pending.prompt}
                    </p>

                    {pending.inputType === "choice" && pending.options ? (
                      <RadioGroup
                        value={inputValue}
                        onValueChange={setInputValue}
                        className="mt-4 space-y-2"
                      >
                        {pending.options.map((option) => {
                          const value = option.split(":")[0]?.trim() ?? option;
                          return (
                            <Label
                              key={option}
                              className="flex min-h-11 items-center gap-3 rounded-xl bg-secondary/50 px-4 py-2.5 text-sm hairline"
                            >
                              <RadioGroupItem value={value} />
                              {option}
                            </Label>
                          );
                        })}
                      </RadioGroup>
                    ) : pending.inputType === "confirm" ? (
                      <div className="mt-4 flex gap-2">
                        {["yes", "no"].map((option) => (
                          <Button
                            key={option}
                            variant={inputValue === option ? "default" : "secondary"}
                            className="h-11 rounded-full capitalize"
                            onClick={() => setInputValue(option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <>
                        <Label htmlFor="runner-input" className="mt-4 block text-xs">
                          Value
                        </Label>
                        <Input
                          id="runner-input"
                          value={inputValue}
                          inputMode={pending.inputType === "number" ? "decimal" : "text"}
                          onChange={(event) =>
                            setInputValue(
                              pending.inputType === "vin"
                                ? event.target.value.toUpperCase()
                                : event.target.value,
                            )
                          }
                          className="mt-2 h-11 rounded-xl font-mono"
                        />
                      </>
                    )}

                    <Button className="mt-4 h-11 rounded-full" onClick={() => void submitInput()}>
                      Continue
                    </Button>
                  </section>
                )}

                {result && (
                  <section
                    className={cn(
                      "rounded-2xl p-5 hairline",
                      result.ok ? "bg-success/10" : "bg-destructive/10",
                    )}
                  >
                    <h2
                      className={cn(
                        "text-sm font-semibold",
                        result.ok ? "text-success" : "text-destructive",
                      )}
                    >
                      {result.ok ? "Process completed" : "Process stopped"}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="h-11 rounded-full"
                        onClick={() => {
                          reset();
                          setUnlocked(true);
                        }}
                      >
                        Run again
                      </Button>
                      <Button className="h-11 rounded-full" onClick={() => onOpenChange(false)}>
                        Done
                      </Button>
                    </div>
                  </section>
                )}

                <TraceConsole
                  trace={trace}
                  open={traceOpen}
                  onToggle={() => setTraceOpen((prev) => !prev)}
                  className="rounded-2xl border"
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
