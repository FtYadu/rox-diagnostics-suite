import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ecus } from "@/data/vehicle-data";
import type { DtcRecord } from "@/features/bridge/types";
import { downloadScanReport } from "@/features/reports/scan-report";
import { useAppStore } from "@/store/app-store";

const NOTES_LIMIT = 1200;

export type ScanReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dtcs: DtcRecord[];
  completedAt?: string | null;
};

/** Collects technician notes and exports the health-scan PDF report. */
export function ScanReportDialog({ open, onOpenChange, dtcs, completedAt }: ScanReportDialogProps) {
  const vin = useAppStore((s) => s.vin);
  const user = useAppStore((s) => s.user);
  const scan = useAppStore((s) => s.scan);
  const bridgeMode = useAppStore((s) => s.bridgeMode);
  const activeJobId = useAppStore((s) => s.activeJobId);
  const appendEvent = useAppStore((s) => s.appendEvent);
  const [notes, setNotes] = useState("");

  const scanned = Object.values(scan).filter((state) => state.status !== "not-scanned").length;
  const critical = dtcs.filter((dtc) => dtc.severity === 3).length;

  const generate = () => {
    const technician = user?.name ?? "Unknown technician";
    downloadScanReport({
      vin,
      technician,
      scan,
      dtcs,
      notes,
      completedAt: completedAt ?? null,
      jobId: activeJobId,
      bridgeMode,
    });
    appendEvent({
      kind: "report",
      title: "Health scan PDF report generated",
      detail: `${scanned} ECUs · ${dtcs.length} DTCs · ${critical} critical${notes.trim() ? " · notes attached" : ""}`,
      status: "ok",
    });
    toast.success("Report downloaded");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Health scan report
          </DialogTitle>
          <DialogDescription>
            A PDF service record for {vin || "this vehicle"} with every ECU scanned, the DTC summary
            and your notes.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="ECUs" value={`${scanned}/${ecus.length}`} />
          <Stat label="DTCs" value={`${dtcs.length}`} />
          <Stat label="Critical" value={`${critical}`} tone={critical > 0} />
        </dl>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="report-notes">Technician notes</Label>
            <span className="text-[11px] text-muted-foreground numerals">
              {notes.length}/{NOTES_LIMIT}
            </span>
          </div>
          <Textarea
            id="report-notes"
            value={notes}
            maxLength={NOTES_LIMIT}
            onChange={(event) => setNotes(event.target.value.slice(0, NOTES_LIMIT))}
            placeholder="Observations, road test result, parts replaced, customer advice…"
            className="min-h-32 rounded-xl text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 rounded-xl" onClick={generate}>
            <Download className="size-4" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = false }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3 hairline">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold tracking-tight numerals ${tone ? "text-destructive" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
