import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ClipboardCopy,
  Eraser,
  NotebookPen,
  ShieldAlert,
  Snowflake,
  Stethoscope,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getEcu } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import type { DtcRecord } from "@/features/bridge/types";
import { dtcGuidance, relatedEcus } from "@/features/dtc/dtc-knowledge";
import { SeverityPill } from "@/features/diagnostics/severity-pill";
import { useAppStore } from "@/store/app-store";
import { StatusFlags } from "./status-flags";

export function DtcDetailSheet({
  record,
  onOpenChange,
  onClear,
}: {
  record: DtcRecord | null;
  onOpenChange: (open: boolean) => void;
  onClear?: (records: DtcRecord[]) => Promise<void> | void;
}) {
  const { bridge } = useBridge();
  const appendEvent = useAppStore((s) => s.appendEvent);
  const [clearing, setClearing] = useState(false);

  const ecu = record ? getEcu(record.ecuId) : undefined;

  const freezeFrame = useQuery({
    queryKey: ["freeze-frame", record?.ecuId, record?.code, bridge.mode],
    queryFn: () => bridge.readFreezeFrame(ecu!, record!.code),
    enabled: Boolean(record && ecu),
  });

  const guidance = record ? dtcGuidance(record.code, record.name) : null;
  const related = record ? relatedEcus(record.code, record.ecuId) : [];

  const copyCode = async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(`${record.ecuId} ${record.code} — ${record.name}`);
      toast.success("Code copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  const addNote = () => {
    if (!record || !guidance) return;
    appendEvent({
      kind: "note",
      title: `${record.ecuId} · ${record.code}`,
      detail: `${record.name} — ${guidance.subtypeLabel}. Occurrences: ${record.occurrences}. Status ${record.statusByte}.`,
      ecuId: record.ecuId,
      status: "info",
    });
    toast.success("Added to job notes");
  };

  const clear = async () => {
    if (!record || !onClear) return;
    setClearing(true);
    await onClear([record]);
    setClearing(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={Boolean(record)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {record && guidance && (
          <>
            <SheetHeader className="glass-chrome sticky top-0 z-10 gap-2 border-b p-6">
              <div className="flex items-center gap-3">
                <p className="font-mono text-xl font-semibold tracking-tight numerals">
                  {record.code}
                </p>
                <SeverityPill severity={record.severity} />
              </div>
              <SheetTitle className="text-base leading-snug font-medium">{record.name}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {record.ecuId} · {ecu?.fullName} · {guidance.familyLabel}
              </p>
              <StatusFlags status={record.status} className="pt-1" />
            </SheetHeader>

            <div className="space-y-5 p-6">
              <Section icon={<ShieldAlert className="size-4" />} title="Fault influence">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {guidance.influence}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Subtype hint: <span className="text-foreground">{guidance.subtypeLabel}</span> ·
                  status byte <span className="font-mono">{record.statusByte}</span> ·{" "}
                  {record.occurrences} occurrence{record.occurrences === 1 ? "" : "s"} · last seen{" "}
                  {new Date(record.lastSeen).toLocaleString()}
                </p>
              </Section>

              <Section icon={<Stethoscope className="size-4" />} title="Possible causes">
                <ul className="space-y-1.5">
                  {guidance.causes.map((cause) => (
                    <li key={cause} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
                      {cause}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section icon={<Stethoscope className="size-4" />} title="Diagnostic steps">
                <ol className="space-y-2">
                  {guidance.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-medium text-primary numerals">
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </Section>

              <Section icon={<Snowflake className="size-4" />} title="Freeze frame">
                {freezeFrame.isPending && (
                  <p className="text-sm text-muted-foreground">Reading 19 04…</p>
                )}
                {freezeFrame.data && (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Snapshot record {freezeFrame.data.recordNumber} ·{" "}
                      {new Date(freezeFrame.data.recordedAt).toLocaleString()}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {freezeFrame.data.entries.map((entry) => (
                        <div key={entry.label} className="rounded-xl bg-secondary/40 p-3 hairline">
                          <p className="truncate text-[11px] text-muted-foreground">
                            {entry.label}
                          </p>
                          <p className="mt-0.5 text-lg font-semibold tracking-tight numerals">
                            {entry.value}
                            {entry.unit && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {entry.unit}
                              </span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Section>

              {related.length > 0 && (
                <Section title="Related ECUs">
                  <div className="flex flex-wrap gap-2">
                    {related.map((id) => (
                      <Link
                        key={id}
                        to="/ecus/$ecuId"
                        params={{ ecuId: id }}
                        onClick={() => onOpenChange(false)}
                        className="rounded-full bg-secondary/60 px-3 py-1.5 text-xs font-medium hairline hover:bg-accent/50"
                      >
                        {id}
                      </Link>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            <div className="glass-chrome sticky bottom-0 flex flex-wrap gap-2 border-t p-4">
              {onClear && (
                <Button
                  className="h-11 rounded-full"
                  onClick={() => void clear()}
                  disabled={clearing}
                >
                  <Eraser className="size-4" />
                  Clear this DTC
                </Button>
              )}
              <Button
                variant="secondary"
                className="h-11 rounded-full"
                onClick={() => void copyCode()}
              >
                <ClipboardCopy className="size-4" />
                Copy code
              </Button>
              <Button variant="secondary" className="h-11 rounded-full" onClick={addNote}>
                <NotebookPen className="size-4" />
                Add to job notes
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card/60 p-5 hairline">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
