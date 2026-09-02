import { createFileRoute } from "@tanstack/react-router";
import { Download, FileDown, FileText } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot, STATUS_LABEL } from "@/components/status/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ecus, getEcu, vehicle } from "@/data/vehicle-data";
import { ScanReportDialog } from "@/features/reports/report-dialog";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell/reports")({
  head: () => ({
    meta: [
      { title: "Reports · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Build a customer-ready diagnostic report from the latest ROX 01 health scan, including per-ECU results and fault counts.",
      },
      { property: "og:title", content: "Reports · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Customer-ready diagnostic reports from the latest ROX 01 health scan.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const scan = useAppStore((s) => s.scan);
  const vin = useAppStore((s) => s.vin);
  const user = useAppStore((s) => s.user);
  const scanDtcs = useAppStore((s) => s.scanDtcs);
  const [reportOpen, setReportOpen] = useState(false);
  const entries = Object.entries(scan);
  const totalDtcs = entries.reduce((sum, [, state]) => sum + state.dtcCount, 0);

  const download = () => {
    const lines = [
      `ROX Diagnostics report`,
      `Vehicle: ${vehicle.name} (${vehicle.code})`,
      `VIN: ${vin}`,
      `Technician: ${user?.name ?? "Unknown"}`,
      `Generated: ${new Date().toISOString()}`,
      `Scanned control units: ${entries.length} of ${ecus.length}`,
      `Stored DTCs: ${totalDtcs}`,
      "",
      ...entries.map(
        ([ecuId, state]) =>
          `${ecuId.padEnd(12)} ${STATUS_LABEL[state.status].padEnd(14)} ${state.dtcCount} DTC — ${getEcu(ecuId)?.fullName ?? ""}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rox-report-${vin}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Export the latest scan results as a shareable service record"
        actions={
          <>
            <Button
              className="rounded-full"
              onClick={() => setReportOpen(true)}
              disabled={entries.length === 0}
            >
              <FileDown className="size-4" />
              Download PDF
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={download}
              disabled={entries.length === 0}
            >
              <Download className="size-4" />
              Plain text
            </Button>
          </>
        }
      />

      <ScanReportDialog open={reportOpen} onOpenChange={setReportOpen} dtcs={scanDtcs} />

      {entries.length === 0 ? (
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Run a health scan first — reports are generated from the most recent scan results.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Scan summary
              <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
                {entries.length} ECUs · {totalDtcs} DTCs
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {entries.map(([ecuId, state]) => (
              <div
                key={ecuId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-2.5 hairline"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusDot status={state.status} />
                  <span className="shrink-0 text-sm font-medium">{ecuId}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {getEcu(ecuId)?.fullName}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground numerals">
                  {state.dtcCount} DTC
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
