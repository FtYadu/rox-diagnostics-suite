import { AlertTriangle, PenLine, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Did, Ecu } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { describeNrcWithHint } from "@/features/bridge/types";
import type { TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { decodeDid, encodeDid, parseHex, toHex } from "@/lib/did-codec";
import { canPerform, roleTooltip } from "@/lib/roles";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

type WriteOutcome = {
  ok: boolean;
  message: string;
  previous: string;
  readBack: string;
};

/**
 * WriteDataByIdentifier (0x2E). Feature-flagged v2 scope: double confirmation
 * with old vs new bytes, then an automatic read-back diff.
 */
export function ConfigurationPanel({ ecu }: { ecu: Ecu }) {
  const { bridge } = useBridge();
  const role = useAppStore((s) => s.role);
  const enabled = useAppStore((s) => s.features.configurationWrite);
  const appendEvent = useAppStore((s) => s.appendEvent);

  const writeDids: Did[] = ecu.writeDids ?? [];
  const [selectedDid, setSelectedDid] = useState<number | null>(writeDids[0]?.did ?? null);
  const [value, setValue] = useState("");
  const [confirmStage, setConfirmStage] = useState<0 | 1 | 2>(0);
  const [outcome, setOutcome] = useState<WriteOutcome | null>(null);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const allowed = canPerform(role, "write-did");
  const selected = writeDids.find((did) => did.did === selectedDid) ?? null;
  const newBytes = selected ? encodeDid(selected, value) : [];

  if (!enabled) {
    return (
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <ShieldAlert className="size-6 text-warning" />
          <p className="text-sm font-medium">Configuration write is disabled</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This is v2 scope. An administrator can enable it in Settings → Feature flags before
            writing configuration data to a vehicle.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (writeDids.length === 0) {
    return (
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {ecu.id} publishes no writable configuration identifiers.
        </CardContent>
      </Card>
    );
  }

  const write = async () => {
    if (!selected) return;
    setBusy(true);
    setConfirmStage(0);
    const result = await bridge.writeDid({
      ecu,
      did: selected.did,
      value,
    });
    setTrace((prev) => [...prev, ...result.trace]);
    setTraceOpen(true);
    setOutcome({
      ok: result.ok,
      message: result.error ? describeNrcWithHint(result.error.nrc) : result.message,
      previous: result.previous ?? "—",
      readBack: result.readback ?? "—",
    });
    appendEvent({
      kind: "config-write",
      title: `Write ${selected.label} · ${ecu.id}`,
      detail: `2E 0x${selected.did.toString(16).toUpperCase()} ← ${toHex(newBytes)} (was ${result.previous ?? "unknown"})`,
      ecuId: ecu.id,
      status: result.ok ? "ok" : "failed",
      trace: result.trace,
    });
    if (result.ok) toast.success("Value written and read back");
    else toast.error(result.message);
    setBusy(false);
  };

  const readBackMatches =
    outcome && outcome.readBack !== "—"
      ? toHex(parseHex(outcome.readBack)) === toHex(newBytes)
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Writable identifiers
            <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
              {writeDids.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-[540px] space-y-1 overflow-y-auto">
          {writeDids.map((did) => (
            <button
              key={did.did}
              type="button"
              onClick={() => {
                setSelectedDid(did.did);
                setOutcome(null);
                setValue("");
              }}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                did.did === selectedDid ? "bg-primary/15" : "hover:bg-accent/40",
              )}
            >
              <span className="truncate">{did.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground numerals">
                0x{did.did.toString(16).toUpperCase().padStart(4, "0")}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selected?.label ?? "Select an identifier"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="config-value" className="text-xs">
                New value
                {selected?.unit ? ` (${selected.unit})` : ""} · {selected?.type} ·{" "}
                {selected?.length} byte(s)
              </Label>
              <Input
                id="config-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={selected?.type === "hex" ? "00 11 22" : "Enter value"}
                className="mt-1 h-11 rounded-xl font-mono"
              />
              <p className="mt-2 font-mono text-[11px] text-muted-foreground numerals">
                Encoded bytes: {toHex(newBytes) || "—"}
                {selected && newBytes.length > 0
                  ? ` · decodes to ${decodeDid(selected, newBytes)}`
                  : ""}
              </p>
            </div>

            <Button
              className="h-11 rounded-full"
              disabled={!allowed || busy || value.trim().length === 0}
              title={allowed ? undefined : roleTooltip("write-did")}
              onClick={() => setConfirmStage(1)}
            >
              <PenLine className="size-4" />
              Write value
            </Button>

            {outcome && (
              <div className="space-y-2 rounded-xl bg-secondary/40 p-4 hairline">
                <p className={cn("text-sm", outcome.ok ? "text-success" : "text-destructive")}>
                  {outcome.message}
                </p>
                <dl className="grid gap-1 font-mono text-[11px] numerals sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Was</dt>
                    <dd>{outcome.previous}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Written</dt>
                    <dd>{toHex(newBytes)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Read-back</dt>
                    <dd className={readBackMatches === false ? "text-destructive" : undefined}>
                      {outcome.readBack}
                    </dd>
                  </div>
                </dl>
                {readBackMatches === false && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="size-3.5" />
                    Read-back differs from the written value.
                  </p>
                )}
              </div>
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

      <Dialog
        open={confirmStage > 0}
        onOpenChange={(open) => setConfirmStage(open ? confirmStage : 0)}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {confirmStage === 1 ? "Review the change" : "Confirm write to the vehicle"}
            </DialogTitle>
            <DialogDescription>
              {confirmStage === 1
                ? `${selected?.label} on ${ecu.id} will be overwritten.`
                : "This writes configuration data to the control unit and cannot be undone automatically."}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 rounded-xl bg-secondary/40 p-4 font-mono text-xs hairline numerals">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">DID</dt>
              <dd>0x{selected?.did.toString(16).toUpperCase().padStart(4, "0")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">New bytes</dt>
              <dd>{toHex(newBytes)}</dd>
            </div>
          </dl>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setConfirmStage(0)}>
              Cancel
            </Button>
            {confirmStage === 1 ? (
              <Button className="rounded-full" onClick={() => setConfirmStage(2)}>
                Continue
              </Button>
            ) : (
              <Button variant="destructive" className="rounded-full" onClick={() => void write()}>
                Write to vehicle
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
