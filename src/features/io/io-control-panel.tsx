import { Lock, LockOpen, Snowflake, RotateCcw, SlidersHorizontal, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Ecu, IoControl, IoControlOption } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { describeNrcWithHint } from "@/features/bridge/types";
import type { TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { canPerform, roleTooltip } from "@/lib/roles";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

const OPTION_LABEL: Record<IoControlOption, string> = {
  returnControl: "Return control",
  resetToDefault: "Reset to default",
  freeze: "Freeze state",
  shortTermAdjust: "Short-term adjust",
};

const OPTION_ICON: Record<IoControlOption, typeof Undo2> = {
  returnControl: Undo2,
  resetToDefault: RotateCcw,
  freeze: Snowflake,
  shortTermAdjust: SlidersHorizontal,
};

/** InputOutputControlByIdentifier (0x2F) with security gating and typed params. */
export function IoControlPanel({ ecu }: { ecu: Ecu }) {
  const { bridge } = useBridge();
  const role = useAppStore((s) => s.role);
  const appendEvent = useAppStore((s) => s.appendEvent);
  const controls: IoControl[] = ecu.ioControls ?? [];
  const requiredLevel = controls.find((control) => control.saLevel)?.saLevel ?? 1;

  const [selectedDid, setSelectedDid] = useState<number | null>(controls[0]?.did ?? null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [busy, setBusy] = useState<IoControlOption | null>(null);

  const allowed = canPerform(role, "io-control");
  const selected = controls.find((control) => control.did === selectedDid) ?? null;

  const unlock = async () => {
    setUnlocking(true);
    const outcome = await bridge.requestSecurityAccess(ecu, requiredLevel);
    setTrace((prev) => [...prev, ...outcome.trace]);
    setTraceOpen(true);
    setUnlocking(false);
    if (outcome.ok) {
      setUnlocked(true);
      toast.success(`${ecu.id} unlocked at L${requiredLevel}`);
    } else {
      toast.error(
        outcome.error ? describeNrcWithHint(outcome.error.nrc) : "Security access rejected",
      );
    }
  };

  const send = async (option: IoControlOption) => {
    if (!selected) return;
    setBusy(option);
    const typedParams = Object.fromEntries(
      (selected.params ?? []).map((layout) => [
        layout.name,
        Number(params[`${selected.did}:${layout.name}`] ?? 0) || 0,
      ]),
    );
    const outcome = await bridge.ioControl({
      ecu,
      did: selected.did,
      option,
      params: typedParams,
    });
    setTrace((prev) => [...prev, ...outcome.trace]);
    setTraceOpen(true);
    setResult({
      ok: outcome.ok,
      text: outcome.error ? describeNrcWithHint(outcome.error.nrc) : outcome.message,
    });
    appendEvent({
      kind: "io-control",
      title: `${OPTION_LABEL[option]} · ${selected.label}`,
      detail: `2F DID 0x${selected.did.toString(16).toUpperCase()} — ${outcome.message}`,
      ecuId: ecu.id,
      status: outcome.ok ? "ok" : "failed",
      trace: outcome.trace,
    });
    if (outcome.ok) toast.success(outcome.message);
    else toast.error(outcome.message);
    setBusy(null);
  };

  if (controls.length === 0) {
    return (
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {ecu.id} publishes no input/output control identifiers.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Controls
            <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
              {controls.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-[540px] space-y-1 overflow-y-auto">
          {controls.map((control) => (
            <button
              key={control.did}
              type="button"
              onClick={() => setSelectedDid(control.did)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                control.did === selectedDid
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-accent/40",
              )}
            >
              <span className="truncate">{control.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground numerals">
                0x{control.did.toString(16).toUpperCase().padStart(4, "0")}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="text-base">{selected?.label ?? "Select a control"}</CardTitle>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                unlocked ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
              )}
            >
              {unlocked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
              {unlocked ? "Unlocked" : `Security access L${requiredLevel} required`}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {!unlocked && (
              <Button
                className="h-11 rounded-full"
                onClick={() => void unlock()}
                disabled={unlocking || !allowed}
                title={allowed ? undefined : roleTooltip("io-control")}
              >
                <LockOpen className="size-4" />
                {unlocking ? "Requesting seed…" : `Unlock ${ecu.id}`}
              </Button>
            )}

            {(selected?.params ?? []).length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(selected?.params ?? []).map((layout) => {
                  const id = `${selected?.did}:${layout.name}`;
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

            <div className="flex flex-wrap gap-2">
              {(selected?.options ?? []).map((option) => {
                const Icon = OPTION_ICON[option];
                return (
                  <Button
                    key={option}
                    variant={option === "shortTermAdjust" ? "default" : "secondary"}
                    className="h-11 rounded-full"
                    disabled={!unlocked || !allowed || busy !== null}
                    title={allowed ? undefined : roleTooltip("io-control")}
                    onClick={() => void send(option)}
                  >
                    <Icon className="size-4" />
                    {OPTION_LABEL[option]}
                  </Button>
                );
              })}
            </div>

            {result && (
              <p className={cn("text-sm", result.ok ? "text-success" : "text-destructive")}>
                {result.text}
              </p>
            )}
          </CardContent>
        </Card>

        <TraceConsole
          trace={trace}
          open={traceOpen}
          onToggle={() => setTraceOpen((prev) => !prev)}
          className="rounded-2xl border"
        />
      </div>
    </div>
  );
}
