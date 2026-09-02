import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Info,
  Lock,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getEcu, processKey, type ServiceProcess } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { describeNrcWithHint } from "@/features/bridge/types";
import type { TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { buildRunnerSteps, securityLabel, type RunnerStep } from "@/features/processes/step-model";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

type StepState = "pending" | "running" | "done" | "failed";

const LEVEL_TONE = {
  information: "text-primary",
  warning: "text-warning",
  error: "text-destructive",
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
  const steps = useMemo<RunnerStep[]>(() => (process ? buildRunnerSteps(process) : []), [process]);
  const ecu = process ? getEcu(process.ecu) : undefined;

  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<StepState[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [finished, setFinished] = useState<"ok" | "failed" | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [gateVin, setGateVin] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const needsGate = process?.securityLevel === 17;

  const reset = useCallback(() => {
    setIndex(0);
    setStates(steps.map(() => "pending"));
    setInputs({});
    setTrace([]);
    setBusy(false);
    setMessage(null);
    setFailure(null);
    setFinished(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setGateVin("");
    setUnlocked(!needsGate);
  }, [needsGate, steps]);

  useEffect(() => {
    if (open) reset();
  }, [open, key, reset]);

  useEffect(() => {
    if (!open || finished) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [open, finished, startedAt]);

  if (!process) return null;

  const step = steps[index];
  const setState = (position: number, state: StepState) =>
    setStates((prev) => prev.map((item, i) => (i === position ? state : item)));

  const finish = (ok: boolean, detail: string, finalTrace: TraceLine[]) => {
    setFinished(ok ? "ok" : "failed");
    appendEvent({
      kind: "process",
      title: `${process.name} · ${process.ecu}`,
      detail,
      ecuId: process.ecu,
      status: ok ? "ok" : "failed",
      trace: finalTrace,
    });
  };

  const advance = async () => {
    if (!step || busy || finished) return;

    if (step.kind === "input") {
      const value = (inputs[step.id] ?? "").trim();
      if (step.field === "vin" && value.length !== 17) {
        toast.error("A VIN must be exactly 17 characters");
        return;
      }
      if (value.length === 0) {
        toast.error("Enter a value to continue");
        return;
      }
    }
    if (step.kind === "choice" && !inputs[step.id]) {
      toast.error("Select an option to continue");
      return;
    }

    setBusy(true);
    setFailure(null);
    setState(index, "running");

    try {
      if (step.kind === "security") {
        const result = await bridge.requestSecurityAccess(ecu!, step.level);
        const nextTrace = [...trace, ...result.trace];
        setTrace(nextTrace);
        if (!result.ok) {
          setState(index, "failed");
          const reason = result.error
            ? describeNrcWithHint(result.error.nrc)
            : "security access rejected";
          setFailure(`Security access L${step.level} failed — ${reason}`);
          finish(false, `Security access L${step.level} rejected (${reason}).`, nextTrace);
          setBusy(false);
          return;
        }
        setState(index, "done");
        setMessage(`Security access L${step.level} granted.`);
      } else {
        const input = inputs[step.id];
        const result = await bridge.executeStep(
          process,
          index,
          step.title,
          input === undefined ? undefined : input,
        );
        const nextTrace = [...trace, ...result.trace];
        setTrace(nextTrace);
        if (!result.ok) {
          setState(index, "failed");
          const reason = result.error
            ? describeNrcWithHint(result.error.nrc)
            : result.message;
          setFailure(reason);
          finish(false, `Step "${step.title}" failed — ${reason}`, nextTrace);
          setBusy(false);
          return;
        }
        setState(index, "done");
        setMessage(result.readback ? `${result.message} · ${result.readback}` : result.message);
      }

      if (index === steps.length - 1) {
        finish(
          true,
          `Completed ${steps.length} steps in ${Math.round((Date.now() - startedAt) / 1000)} s.`,
          trace,
        );
      } else {
        setIndex(index + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setFailure(null);
    setState(index, "pending");
    setFinished(null);
  };

  const report = () => {
    appendEvent({
      kind: "note",
      title: `Report · ${process.name}`,
      detail: `Technician reported a failed run at step ${index + 1} (${step?.title ?? "unknown"}). ${failure ?? ""}`,
      ecuId: process.ecu,
      status: "info",
      trace,
    });
    toast.success("Report added to the job");
  };

  const seconds = Math.round(elapsed / 1000);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[100dvh] w-screen max-w-none grid-rows-[auto_1fr_auto] gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{process.name}</DialogTitle>
        <header className="glass-chrome flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{process.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {process.ecu} · {ecu?.fullName} · {process.category} ·{" "}
              {securityLabel(process.securityLevel)} · UDS {process.udsServices.join(" ")}
            </p>
          </div>
          <p className="rounded-full bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground numerals hairline">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </p>
          <Button
            variant="ghost"
            className="h-11 rounded-full"
            onClick={() => onOpenChange(false)}
            aria-label="Abort and close runner"
          >
            <X className="size-4" />
            Abort
          </Button>
        </header>

        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <ol className="hidden min-h-0 overflow-y-auto border-r p-4 lg:block">
            {steps.map((item, position) => {
              const state = states[position] ?? "pending";
              return (
                <li key={item.id} className="flex gap-3 py-2">
                  <span className="mt-0.5">
                    {state === "done" ? (
                      <Check className="size-4 text-success" />
                    ) : state === "failed" ? (
                      <AlertTriangle className="size-4 text-destructive" />
                    ) : position === index ? (
                      <CircleDot className="size-4 text-primary" />
                    ) : (
                      <CircleDot className="size-4 text-muted-foreground/40" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-xs leading-5",
                      position === index ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.kind === "security" && <Lock className="mr-1 inline size-3" />}
                    {item.title}
                  </span>
                </li>
              );
            })}
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
                  Confirm VIN
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
            ) : finished ? (
              <div className="mx-auto max-w-xl space-y-4">
                <div
                  className={cn(
                    "rounded-2xl p-6 hairline",
                    finished === "ok" ? "bg-success/10" : "bg-destructive/10",
                  )}
                >
                  <h2
                    className={cn(
                      "flex items-center gap-2 text-base font-semibold",
                      finished === "ok" ? "text-success" : "text-destructive",
                    )}
                  >
                    {finished === "ok" ? <Check className="size-5" /> : <AlertTriangle className="size-5" />}
                    {finished === "ok" ? "Process completed" : "Process failed"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {failure ?? message ?? "All steps confirmed."} Elapsed {seconds} s. The run and
                    its trace were written to Job History.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {finished === "failed" && (
                    <>
                      <Button className="h-11 rounded-full" onClick={reset}>
                        <RotateCcw className="size-4" />
                        Retry
                      </Button>
                      <Button variant="secondary" className="h-11 rounded-full" onClick={report}>
                        Report
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    className="h-11 rounded-full"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              step && (
                <div className="mx-auto max-w-2xl">
                  <p className="text-xs text-muted-foreground numerals">
                    Step {index + 1} of {steps.length}
                  </p>
                  <div className="mt-3 rounded-2xl bg-card/70 p-6 hairline">
                    <h2
                      className={cn(
                        "flex items-start gap-2 text-lg font-semibold tracking-tight",
                        step.kind === "message" ? LEVEL_TONE[step.level] : "text-foreground",
                      )}
                    >
                      {step.kind === "security" ? (
                        <Lock className="mt-1 size-5 shrink-0" />
                      ) : step.kind === "message" && step.level !== "information" ? (
                        <AlertTriangle className="mt-1 size-5 shrink-0" />
                      ) : (
                        <Info className="mt-1 size-5 shrink-0 text-muted-foreground" />
                      )}
                      {step.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>

                    {step.kind === "input" && (
                      <div className="mt-5">
                        <Label htmlFor="step-input" className="text-xs">
                          {step.field === "vin" ? "VIN (17 characters)" : "Value"}
                        </Label>
                        <Input
                          id="step-input"
                          value={inputs[step.id] ?? ""}
                          onChange={(event) =>
                            setInputs((prev) => ({
                              ...prev,
                              [step.id]:
                                step.field === "vin"
                                  ? event.target.value.toUpperCase()
                                  : event.target.value,
                            }))
                          }
                          placeholder={step.placeholder}
                          className={cn("mt-2 h-11 rounded-xl", step.field === "vin" && "font-mono")}
                        />
                      </div>
                    )}

                    {step.kind === "choice" && (
                      <RadioGroup
                        className="mt-5 gap-2"
                        value={inputs[step.id] ?? ""}
                        onValueChange={(value) =>
                          setInputs((prev) => ({ ...prev, [step.id]: value }))
                        }
                      >
                        {step.options.map((option) => (
                          <Label
                            key={option.value}
                            htmlFor={`opt-${option.value}`}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-secondary/50 px-4 py-3 text-sm font-normal hairline"
                          >
                            <RadioGroupItem id={`opt-${option.value}`} value={option.value} />
                            <span className="font-mono text-xs text-muted-foreground">
                              {option.value}
                            </span>
                            {option.label}
                          </Label>
                        ))}
                      </RadioGroup>
                    )}

                    {message && !failure && (
                      <p className="mt-5 rounded-xl bg-success/10 px-4 py-3 text-xs text-success">
                        {message}
                      </p>
                    )}
                    {failure && (
                      <div className="mt-5 rounded-xl bg-destructive/10 px-4 py-3">
                        <p className="text-xs text-destructive">{failure}</p>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" className="h-9 rounded-full" onClick={retry}>
                            <RotateCcw className="size-3.5" />
                            Retry
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 rounded-full"
                            onClick={report}
                          >
                            Report
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="h-11 rounded-full"
                      disabled={index === 0 || busy}
                      onClick={() => {
                        setFailure(null);
                        setMessage(null);
                        setIndex(Math.max(0, index - 1));
                      }}
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                    <Button
                      className="h-11 min-w-40 rounded-full"
                      disabled={busy || Boolean(failure)}
                      onClick={() => void advance()}
                    >
                      {busy ? "Working…" : index === steps.length - 1 ? "Finish" : "Continue"}
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <TraceConsole
          trace={trace}
          open={traceOpen}
          onToggle={() => setTraceOpen((prev) => !prev)}
        />
      </DialogContent>
    </Dialog>
  );
}
