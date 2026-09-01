import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BatteryCharging,
  Cable,
  CircleCheck,
  Eraser,
  FilePlus2,
  Radio,
  RefreshCw,
  ScanLine,
  Stethoscope,
} from "lucide-react";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot, STATUS_LABEL } from "@/components/status/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOMAIN_ORDER, ecus, vehicle } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Live bridge status, vehicle identity, quick diagnostic actions and recent jobs for the ROX 01 (R11_Oversea).",
      },
      { property: "og:title", content: "Dashboard · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Bridge status, vehicle identity, quick actions and recent jobs.",
      },
    ],
  }),
  component: DashboardPage,
});

const CHART_TOKENS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

function DashboardPage() {
  const navigate = useNavigate();
  const { bridge, status, connection, usingFallback, reconnect } = useBridge();
  const vin = useAppStore((s) => s.vin);
  const jobs = useAppStore((s) => s.jobs);
  const scan = useAppStore((s) => s.scan);
  const applyDtcResult = useAppStore((s) => s.applyDtcResult);
  const addJob = useAppStore((s) => s.addJob);
  const [busy, setBusy] = useState<string | null>(null);

  const scanned = Object.values(scan);
  const totalDtcs = scanned.reduce((sum, entry) => sum + entry.dtcCount, 0);
  const faultyEcus = scanned.filter((entry) => entry.status === "faults").length;

  const domainData = DOMAIN_ORDER.map((domain) => ({
    name: domain,
    value: ecus.filter((e) => e.domain === domain).length,
  })).filter((entry) => entry.value > 0);

  const readAllDtcs = async () => {
    setBusy("read");
    let found = 0;
    for (const ecu of ecus) {
      const result = await bridge.readDtcs(ecu);
      applyDtcResult(result);
      found += result.dtcs.length;
    }
    addJob({
      title: "Read all DTCs",
      kind: "health-scan",
      technician: useAppStore.getState().user?.name ?? "Technician",
      status: "completed",
      summary: `${ecus.length} ECUs queried · ${found} stored DTCs`,
    });
    setBusy(null);
    toast.success(`Read complete — ${found} stored DTCs across ${ecus.length} ECUs`);
  };

  const clearAllDtcs = async () => {
    setBusy("clear");
    let cleared = 0;
    for (const ecu of ecus) {
      const result = await bridge.clearDtcs(ecu);
      cleared += result.cleared;
      applyDtcResult({ ecuId: ecu.id, responded: true, dtcs: [] });
    }
    addJob({
      title: "Clear all DTCs",
      kind: "clear-dtc",
      technician: useAppStore.getState().user?.name ?? "Technician",
      status: "completed",
      summary: `${cleared} codes cleared`,
    });
    setBusy(null);
    toast.success(`Cleared ${cleared} codes across the vehicle`);
  };

  const newJob = () => {
    addJob({
      title: "New workshop job",
      kind: "manual",
      technician: useAppStore.getState().user?.name ?? "Technician",
      status: "in-progress",
      summary: "Job opened from dashboard",
    });
    toast.success("Job created");
    void navigate({ to: "/job-history" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${vehicle.name} · ${vehicle.bus}`}
        actions={
          <Button variant="secondary" className="rounded-full" onClick={reconnect}>
            <RefreshCw className="size-4" />
            Reconnect bridge
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-hairline shadow-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Connection</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Metric
              icon={<Radio className="size-4" />}
              label="Bridge"
              value={
                usingFallback
                  ? "Offline → Simulator"
                  : status === "connected"
                    ? bridge.mode === "local"
                      ? "Hardware"
                      : "Simulator"
                    : "Connecting…"
              }
              tone={usingFallback ? "warning" : status === "connected" ? "success" : "muted"}
            />
            <Metric
              icon={<Cable className="size-4" />}
              label="VCI"
              value={connection?.vciName ?? "—"}
              hint={connection?.vciSerial}
            />
            <Metric
              icon={<BatteryCharging className="size-4" />}
              label="Battery"
              value={connection ? `${connection.batteryVoltage.toFixed(1)} V` : "—"}
              tone={connection && connection.batteryVoltage < 12 ? "warning" : "success"}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="text-lg font-semibold tracking-tight">{vehicle.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">VIN</p>
              <p className="font-mono text-sm numerals">{vin}</p>
            </div>
            <div className="flex gap-6 pt-1">
              <div>
                <p className="text-2xl font-semibold numerals">{ecus.length}</p>
                <p className="text-xs text-muted-foreground">ECUs</p>
              </div>
              <div>
                <p className="text-2xl font-semibold numerals">{totalDtcs}</p>
                <p className="text-xs text-muted-foreground">Stored DTCs</p>
              </div>
              <div>
                <p className="text-2xl font-semibold numerals">{faultyEcus}</p>
                <p className="text-xs text-muted-foreground">With faults</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction
          icon={<Stethoscope className="size-5" />}
          title="Full health scan"
          description={`Scan all ${ecus.length} control units`}
          onClick={() => void navigate({ to: "/health-scan" })}
        />
        <QuickAction
          icon={<ScanLine className="size-5" />}
          title="Read all DTCs"
          description="Query stored fault memory"
          loading={busy === "read"}
          onClick={() => void readAllDtcs()}
        />
        <QuickAction
          icon={<Eraser className="size-5" />}
          title="Clear all DTCs"
          description="Erase fault memory vehicle-wide"
          loading={busy === "clear"}
          onClick={() => void clearAllDtcs()}
        />
        <QuickAction
          icon={<FilePlus2 className="size-5" />}
          title="New job"
          description="Open a workshop job card"
          onClick={newJob}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Last 5 jobs</CardTitle>
            <Link to="/job-history" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {jobs.slice(0, 5).map((job) => (
                <li
                  key={job.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.id} · {job.technician} · {job.summary}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      job.status === "completed"
                        ? "bg-success/15 text-success"
                        : job.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary/15 text-primary"
                    }`}
                  >
                    {job.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">ECUs by domain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={domainData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {domainData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_TOKENS[index % CHART_TOKENS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      color: "var(--color-popover-foreground)",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {domainData.map((entry, index) => (
                <li key={entry.name} className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: CHART_TOKENS[index % CHART_TOKENS.length] }}
                  />
                  <span className="truncate text-muted-foreground">{entry.name}</span>
                  <span className="ml-auto numerals">{entry.value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {scanned.length > 0 && (
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest scan states</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(scan).map(([ecuId, state]) => (
              <Link
                key={ecuId}
                to="/ecus/$ecuId"
                params={{ ecuId }}
                className="flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1.5 text-xs hairline hover:bg-accent"
              >
                <StatusDot status={state.status} />
                <span className="font-medium">{ecuId}</span>
                <span className="text-muted-foreground">{STATUS_LABEL[state.status]}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: "success" | "warning" | "muted";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl bg-secondary/50 p-4 hairline">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={`mt-2 truncate text-lg font-semibold tracking-tight ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      disabled={loading}
      className="flex min-h-11 items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card hairline hover:bg-accent/40 disabled:opacity-60"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
        {loading ? <RefreshCw className="size-5 animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <CircleCheck className="ml-auto size-4 shrink-0 text-muted-foreground/40" />
    </motion.button>
  );
}
