import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eraser, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot, STATUS_LABEL } from "@/components/status/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { flowsForEcu, getEcu, identDidsFor, processesForEcu } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { LiveDataPanel } from "@/features/diagnostics/live-data-panel";
import { ProcessRunner } from "@/features/diagnostics/process-runner";
import { SeverityPill } from "@/features/diagnostics/severity-pill";
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

const TABS = [
  { value: "identification", label: "Identification" },
  { value: "dtcs", label: "DTCs" },
  { value: "live-data", label: "Live data" },
  { value: "routines", label: "Routines" },
  { value: "functions", label: "Service functions" },
  { value: "programming", label: "Programming" },
];

function EcuDetailPage() {
  const { ecuId } = Route.useParams();
  const navigate = useNavigate();
  const ecu = getEcu(ecuId);
  const { bridge } = useBridge();
  const scan = useAppStore((s) => s.scan);
  const applyDtcResult = useAppStore((s) => s.applyDtcResult);
  const addJob = useAppStore((s) => s.addJob);
  const [busy, setBusy] = useState(false);

  const identification = useQuery({
    queryKey: ["identification", ecuId, bridge.mode],
    queryFn: () => bridge.readIdentification(ecu!),
    enabled: Boolean(ecu),
  });

  const dtcQuery = useQuery({
    queryKey: ["dtcs", ecuId, bridge.mode],
    queryFn: async () => {
      const result = await bridge.readDtcs(ecu!);
      applyDtcResult(result);
      return result;
    },
    enabled: Boolean(ecu),
  });

  if (!ecu) {
    return (
      <div className="space-y-4">
        <PageHeader title="Unknown control unit" subtitle={`No ECU named ${ecuId}`} />
        <Button
          variant="secondary"
          className="rounded-full"
          onClick={() => void navigate({ to: "/ecus" })}
        >
          Back to ECUs
        </Button>
      </div>
    );
  }

  const state = scan[ecu.id] ?? { status: "not-scanned" as const, dtcCount: 0 };

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
        <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-full bg-secondary/70 p-1">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="shrink-0 rounded-full px-4 text-xs"
            >
              {tab.label}
            </TabsTrigger>
          ))}
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
              {dtcQuery.isFetching && (
                <p className="text-sm text-muted-foreground">Reading 19 02…</p>
              )}
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
                <div key={routine} className="rounded-xl bg-secondary/40 px-4 py-3 text-sm hairline">
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
