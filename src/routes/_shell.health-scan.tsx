import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Eraser, FileText, Play, RefreshCw, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot, STATUS_LABEL } from "@/components/status/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ecus, severityLabel } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import type { DtcRecord } from "@/features/bridge/types";
import { DtcTable } from "@/features/dtc/dtc-table";
import { useAppStore } from "@/store/app-store";
import type { EcuScanState } from "@/store/app-store";

export const Route = createFileRoute("/_shell/health-scan")({
  head: () => ({
    meta: [
      { title: "Health Scan · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Run a full-vehicle health scan across all 41 ROX 01 control units, review DTCs by severity and clear fault memory or generate a report.",
      },
      { property: "og:title", content: "Health Scan · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Full-vehicle scan across all 41 ROX 01 control units with severity summary.",
      },
    ],
  }),
  component: HealthScanPage,
});

function HealthScanPage() {
  const navigate = useNavigate();
  const { bridge } = useBridge();
  const scan = useAppStore((s) => s.scan);
  const setEcuState = useAppStore((s) => s.setEcuState);
  const applyDtcResult = useAppStore((s) => s.applyDtcResult);
  const resetScan = useAppStore((s) => s.resetScan);
  const appendEvent = useAppStore((s) => s.appendEvent);
  const ensureJob = useAppStore((s) => s.ensureJob);
  const updateJob = useAppStore((s) => s.updateJob);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<DtcRecord[]>([]);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const cancelled = useRef(false);

  const runScan = async () => {
    cancelled.current = false;
    setRunning(true);
    setProgress(0);
    setFound([]);
    setCompletedAt(null);
    resetScan();

    const collected: DtcRecord[] = [];
    for (let index = 0; index < ecus.length; index += 1) {
      if (cancelled.current) break;
      const ecu = ecus[index]!;
      setEcuState(ecu.id, { status: "scanning", dtcCount: 0 });
      const result = await bridge.readDtcs(ecu);
      applyDtcResult(result);
      collected.push(...result.dtcs);
      setFound([...collected]);
      setProgress(Math.round(((index + 1) / ecus.length) * 100));
    }

    setRunning(false);
    if (cancelled.current) {
      toast.info("Scan stopped");
      return;
    }
    setCompletedAt(new Date().toISOString());
    const critical = collected.filter((dtc) => dtc.severity === 3).length;
    const jobId = ensureJob({ title: "Full health scan", kind: "health-scan" });
    updateJob(jobId, {
      dtcTotal: collected.length,
      dtcCritical: critical,
      summary: `${ecus.length} ECUs scanned · ${collected.length} stored DTCs`,
    });
    appendEvent({
      jobId,
      kind: "scan",
      title: "Full health scan",
      detail: `${ecus.length} ECUs scanned · ${collected.length} stored DTCs · ${collected.filter((dtc) => dtc.severity === 3).length} critical`,
      status: "ok",
    });
    toast.success(`Scan complete — ${collected.length} stored DTCs`);
  };

  const clearAll = async () => {
    const faulted = ecus.filter((ecu) => scan[ecu.id]?.status === "faults");
    let cleared = 0;
    for (const ecu of faulted) {
      const result = await bridge.clearDtcs(ecu);
      cleared += result.cleared;
      applyDtcResult({ ecuId: ecu.id, responded: true, dtcs: [] });
    }
    setFound([]);
    appendEvent({
      kind: "dtc-clear",
      title: "Clear all DTCs after scan",
      detail: `${cleared} codes cleared across ${faulted.length} control units`,
      status: "ok",
    });
    toast.success(`${cleared} codes cleared`);
  };

  const clearRecords = async (records: DtcRecord[]) => {
    let cleared = 0;
    for (const ecu of ecus) {
      const codes = records.filter((record) => record.ecuId === ecu.id).map((r) => r.code);
      if (codes.length === 0) continue;
      const result = await bridge.clearDtcs(ecu, codes);
      cleared += result.cleared;
    }
    const keys = new Set(records.map((record) => `${record.ecuId}:${record.code}`));
    setFound((prev) => prev.filter((item) => !keys.has(`${item.ecuId}:${item.code}`)));
    appendEvent({
      kind: "dtc-clear",
      title: `Clear ${records.length} code${records.length === 1 ? "" : "s"} from scan`,
      detail: records.map((record) => `${record.ecuId} ${record.code}`).join(", "),
      status: "ok",
    });
    toast.success(`${cleared} code${cleared === 1 ? "" : "s"} cleared`);
  };

  const severityCounts = {
    High: found.filter((dtc) => severityLabel(dtc.severity) === "High").length,
    Medium: found.filter((dtc) => severityLabel(dtc.severity) === "Medium").length,
    Low: found.filter((dtc) => severityLabel(dtc.severity) === "Low").length,
  };

  const scannedStates = Object.values(scan);
  const faultyCount = scannedStates.filter((entry) => entry.status === "faults").length;
  const noResponseCount = scannedStates.filter((entry) => entry.status === "no-response").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health scan"
        subtitle={`Sequential DTC read across ${ecus.length} control units`}
        actions={
          <>
            {running ? (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => {
                  cancelled.current = true;
                }}
              >
                <Square className="size-4" />
                Stop
              </Button>
            ) : (
              <Button className="rounded-full" onClick={() => void runScan()}>
                <Play className="size-4" />
                {completedAt ? "Rescan" : "Start scan"}
              </Button>
            )}
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => void clearAll()}
              disabled={running || faultyCount === 0}
            >
              <Eraser className="size-4" />
              Clear all
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => void navigate({ to: "/reports" })}
              disabled={!completedAt}
            >
              <FileText className="size-4" />
              Generate report
            </Button>
          </>
        }
      />

      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="space-y-4 p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {running ? "Scanning vehicle…" : completedAt ? "Scan complete" : "Ready to scan"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {Object.keys(scan).length} of {ecus.length} control units processed
              </p>
            </div>
            <p className="text-4xl font-semibold tracking-tight numerals">{progress}%</p>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label="Total DTCs" value={found.length} />
            <Summary label="High severity" value={severityCounts.High} tone="destructive" />
            <Summary label="ECUs with faults" value={faultyCount} tone="warning" />
            <Summary label="No response" value={noResponseCount} tone="warning" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Per-ECU progress</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[560px] space-y-1.5 overflow-y-auto">
            {ecus.map((ecu) => {
              const state: EcuScanState = scan[ecu.id] ?? { status: "not-scanned", dtcCount: 0 };
              return (
                <motion.div
                  key={ecu.id}
                  layout
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-2.5 hairline"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StatusDot status={state.status} />
                    <span className="shrink-0 text-sm font-medium">{ecu.id}</span>
                    <span className="truncate text-xs text-muted-foreground">{ecu.fullName}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground numerals">
                    {state.status === "faults"
                      ? `${state.dtcCount} DTC`
                      : STATUS_LABEL[state.status]}
                  </span>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Findings</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[560px] overflow-y-auto">
            {found.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {running ? "Collecting fault memory…" : "No stored faults found yet."}
              </p>
            ) : (
              <DtcTable records={found} showEcu onClear={clearRecords} />
            )}
          </CardContent>
        </Card>
      </div>

      {!running && completedAt && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5" />
          Last completed {new Date(completedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "";
  return (
    <div className="rounded-xl bg-secondary/50 p-4 hairline">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight numerals ${toneClass}`}>{value}</p>
    </div>
  );
}
