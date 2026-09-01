import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eraser, Play, RefreshCw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot, STATUS_LABEL } from "@/components/status/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  flowsForEcu,
  getEcu,
  identDidsFor,
  processesForEcu,
  severityLabel,
} from "@/data/vehicle-data";
import type { ServiceProcess } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { liveDataCatalog } from "@/features/bridge/live-data";
import type { ProcessStepEvent } from "@/features/bridge/types";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell/ecus/$ecuId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.ecuId} · ECU detail · ROX Diagnostics` },
      {
        name: "description",
        content: `Identification DIDs, fault memory, live data, routines, service functions and programming flows for the ${params.ecuId} control unit on the ROX 01.`,
      },
      { property: "og:title", content: `${params.ecuId} · ECU detail · ROX Diagnostics` },
      {
        property: "og:description",
        content: `Diagnostics for the ${params.ecuId} control unit on the ROX 01.`,
      },
    ],
  }),
  component: EcuDetailPage,
});

function EcuDetailPage() {
  const { ecuId } = Route.useParams();
  const navigate = useNavigate();
  const ecu = getEcu(ecuId);
  const { bridge } = useBridge();
  const scan = useAppStore((s) => s.scan);
  const applyDtcResult = useAppStore((s) => s.applyDtcResult);
  const addJob = useAppStore((s) => s.addJob);
  const [busy, setBusy] = useState(false);

  if (!ecu) {
    return (
      <div className="space-y-4">
        <PageHeader title="Unknown control unit" subtitle={`No ECU named ${ecuId}`} />
        <Button variant="secondary" className="rounded-full" onClick={() => void navigate({ to: "/ecus" })}>
          Back to ECUs
        </Button>
      </div>
    );
  }

  const state = scan[ecu.id] ?? { status: "not-scanned" as const, dtcCount: 0 };

  const identification = useQuery({
    queryKey: ["identification", ecu.id, bridge.mode],
    queryFn: () => bridge.readIdentification(ecu),
  });

  const dtcQuery = useQuery({
    queryKey: ["dtcs", ecu.id, bridge.mode],
    queryFn: async () => {
      const result = await bridge.readDtcs(ecu);
      applyDtcResult(result);
      return result;
    },
  });

  const clear = async () => {
    setBusy(true);
    const { cleared } = await bridge.clearDtcs(ecu);
    applyDtcResult({ ecuId: ecu.id, responded: true, dtcs: [] });
    await dtcQuery.refetch();
    addJob({
      title: `Clear DTCs · ${ecu.id}`,
      kind: "clear-dtc",
      technician: useAppStore.getState().user?.name ?? "Technician",
      status: "completed",
      summary: `${cleared} codes cleared`,
    });
    setBusy(false);
    toast.success(`${cleared} codes cleared on ${ecu.id}`);
  };

  return (
    <div className="space-y-6">
      <Link
        to="/ecus"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All control units
      </Link>

      <PageHeader
        title={ecu.id}
        subtitle={`${ecu.fullName} · ${ecu.domain} domain`}
        actions={
          <>
            <span className="flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-2 text-xs hairline">
              <StatusDot status={state.status} />
              {STATUS_LABEL[state.status]}
            </span>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => void dtcQuery.refetch()}
              disabled={dtcQuery.isFetching}
            >
              <RefreshCw className={dtcQuery.isFetching ? "size-4 animate-spin" : "size-4"} />
              Re-read
            </Button>
            <Button className="rounded-full" onClick={() => void clear()} disabled={busy}>
              <Eraser className="size-4" />
              Clear DTCs
            </Button>
          </>
        }
      />

      <Tabs defaultValue="identification" className="space-y-4">
        <TabsList className="h-11 rounded-full bg-secondary/70 p-1">
          {["identification", "dtcs", "live-data", "routines", "functions", "programming"].map(
            (value) => (
              <TabsTrigger key={value} value={value} className="rounded-full px-4 text-xs capitalize">
                {value.replace("-", " ")}
              </TabsTrigger>
            ),
          )}
        </TabsList>

        <TabsContent value="identification">
          <Card className="rounded-2xl border-hairline shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Identification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {identification.isPending && (
                <p className="text-sm text-muted-foreground">Reading DIDs…</p>
              )}
              {(identification.data ?? []).map((entry) => (
                <div
                  key={entry.did}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 hairline"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.label}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">DID {entry.did}</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm numerals">{entry.value}</p>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Requested identifiers: {identDidsFor(ecu).join(", ")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dtcs">
          <Card className="rounded-2xl border-hairline shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Fault memory
                <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
                  {dtcQuery.data?.dtcs.length ?? 0} active · {ecu.dtcs.length} supported
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dtcQuery.isFetching && <p className="text-sm text-muted-foreground">Reading 19 02…</p>}
              {dtcQuery.data && !dtcQuery.data.responded && (
                <p className="text-sm text-warning">
                  No response from {ecu.id} — check bus wiring and power supply.
                </p>
              )}
              {dtcQuery.data?.responded && dtcQuery.data.dtcs.length === 0 && (
                <p className="text-sm text-success">No stored faults.</p>
              )}
              {(dtcQuery.data?.dtcs ?? []).map((dtc) => (
                <div
                  key={dtc.code}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 hairline"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium">{dtc.code}</p>
                    <p className="truncate text-xs text-muted-foreground">{dtc.name}</p>
                  </div>
                  <SeverityPill severity={dtc.severity} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live-data">
          <LiveDataPanel ecuId={ecu.id} />
        </TabsContent>

        <TabsContent value="routines">
          <Card className="rounded-2xl border-hairline shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Routines (0x31)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ecu.routines.length === 0 && (
                <p className="text-sm text-muted-foreground">No routines defined for this ECU.</p>
              )}
              {ecu.routines.map((routine) => (
                <div
                  key={routine}
                  className="rounded-xl bg-secondary/40 px-4 py-3 text-sm hairline"
                >
                  {routine}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="functions">
          <ProcessRunner processes={processesForEcu(ecu.id)} />
        </TabsContent>

        <TabsContent value="programming">
          <Card className="rounded-2xl border-hairline shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Programming</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {flowsForEcu(ecu.id).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No programming flow covers {ecu.id}. Use the Programming workspace for
                  vehicle-level flows.
                </p>
              )}
              {flowsForEcu(ecu.id).map((flow) => (
                <div key={flow.name} className="rounded-xl bg-secondary/40 p-4 hairline">
                  <p className="text-sm font-semibold">{flow.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {flow.type} · {flow.phases.length} phases
                  </p>
                  <Button asChild size="sm" className="mt-3 rounded-full">
                    <Link to="/programming">
                      <Upload className="size-4" />
                      Open flow
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SeverityPill({ severity }: { severity: number }) {
  const label = severityLabel(severity);
  const tone =
    label === "High"
      ? "bg-destructive/15 text-destructive"
      : label === "Medium"
        ? "bg-warning/15 text-warning"
        : "bg-secondary text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function LiveDataPanel({ ecuId }: { ecuId: string }) {
  const ecu = getEcu(ecuId)!;
  const { bridge } = useBridge();
  const [signals, setSignals] = useState<
    Array<{ id: string; label: string; value: number; unit: string }>
  >([]);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    if (!streaming) return;
    let active = true;
    const ids = liveDataCatalog(ecu).map((definition) => definition.id);
    const tick = async () => {
      const next = await bridge.readLiveData(ecu, ids);
      if (active) setSignals(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), 900);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bridge, ecu, streaming]);

  return (
    <Card className="rounded-2xl border-hairline shadow-card">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Live data</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => setStreaming((value) => !value)}
        >
          {streaming ? "Pause" : "Resume"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-xl bg-secondary/40 p-4 hairline">
            <p className="truncate text-xs text-muted-foreground">{signal.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight numerals">
              {signal.value}
              {signal.unit && <span className="ml-1 text-sm text-muted-foreground">{signal.unit}</span>}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ProcessRunner({ processes }: { processes: ServiceProcess[] }) {
  const { bridge } = useBridge();
  const addJob = useAppStore((s) => s.addJob);
  const [active, setActive] = useState<ServiceProcess | null>(null);
  const [events, setEvents] = useState<ProcessStepEvent[]>([]);
  const [running, setRunning] = useState(false);

  const run = async (process: ServiceProcess) => {
    setActive(process);
    setEvents([]);
    setRunning(true);
    const result = await bridge.runProcess(process, (event) =>
      setEvents((prev) => {
        const next = prev.filter((item) => item.index !== event.index);
        return [...next, event].sort((a, b) => a.index - b.index);
      }),
    );
    setRunning(false);
    addJob({
      title: `${process.ecu} · ${process.name}`,
      kind: "service",
      technician: useAppStore.getState().user?.name ?? "Technician",
      status: result.ok ? "completed" : "failed",
      summary: result.message,
    });
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Service functions
            <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
              {processes.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {processes.length === 0 && (
            <p className="text-sm text-muted-foreground">No guided processes for this ECU.</p>
          )}
          {processes.map((process) => (
            <div
              key={`${process.ecu}-${process.name}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 hairline"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{process.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {process.category} · security L{process.securityLevel} · SID{" "}
                  {process.udsServices.join(" ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 rounded-full"
                onClick={() => void run(process)}
                disabled={running}
              >
                <Play className="size-3.5" />
                Run
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Execution log</CardTitle>
        </CardHeader>
        <CardContent>
          {!active && <p className="text-sm text-muted-foreground">Select a process to begin.</p>}
          {active && (
            <>
              <p className="text-sm font-medium">{active.name}</p>
              <ul className="mt-3 space-y-2">
                <AnimatePresence initial={false}>
                  {events.map((event) => (
                    <motion.li
                      key={event.index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-xl px-4 py-3 text-sm hairline ${
                        event.state === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : event.state === "running"
                            ? "bg-primary/10 text-primary"
                            : event.level === "warning"
                              ? "bg-warning/10 text-warning"
                              : "bg-secondary/40"
                      }`}
                    >
                      <span className="mr-2 font-mono text-[11px] opacity-70">
                        {event.index + 1}/{event.total}
                      </span>
                      {event.text}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
