import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertTriangle, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { programmingFlows } from "@/data/vehicle-data";
import type { ProgrammingFlow } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import type { ProgrammingProgressEvent } from "@/features/bridge/types";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell/programming")({
  head: () => ({
    meta: [
      { title: "Programming · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Flash and reprogram ROX 01 control units with guided phase-by-phase programming flows, package selection and live progress.",
      },
      { property: "og:title", content: "Programming · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Guided ECU flashing and reprogramming flows for the ROX 01.",
      },
    ],
  }),
  component: ProgrammingPage,
});

const PACKAGES = [
  "R11OS_ADCU_MCU_0.98.vbf",
  "R11OS_ADCU_SOC_1.14.vbf",
  "R11OS_BCM_2.07.vbf",
  "R11OS_VCU_3.02.vbf",
];

function ProgrammingPage() {
  const { bridge, connection } = useBridge();
  const appendEvent = useAppStore((s) => s.appendEvent);
  const [flow, setFlow] = useState<ProgrammingFlow>(programmingFlows[0]!);
  const [pkg, setPkg] = useState(PACKAGES[0]!);
  const [events, setEvents] = useState<ProgrammingProgressEvent[]>([]);
  const [percent, setPercent] = useState(0);
  const [running, setRunning] = useState(false);

  const lowBattery = (connection?.batteryVoltage ?? 12.6) < 12.2;

  const start = async () => {
    setRunning(true);
    setEvents([]);
    setPercent(0);
    const result = await bridge.startProgramming(flow, pkg, (event) => {
      setPercent(event.percent);
      setEvents((prev) => [...prev, event]);
    });
    setRunning(false);
    appendEvent({
      kind: "programming",
      title: `${flow.name} · ${pkg}`,
      detail: result.message,
      status: result.ok ? "ok" : "failed",
    });
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programming"
        subtitle="Guided reflash and reprogramming flows for ROX 01 control units"
      />

      {lowBattery && (
        <div className="flex items-start gap-3 rounded-2xl bg-warning/10 p-4 text-sm text-warning hairline">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Battery voltage is below 12.2 V. Connect a stable power supply before starting a flash
            session.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-4">
          <Card className="rounded-2xl border-hairline shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Select flow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {programmingFlows.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setFlow(item)}
                  disabled={running}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm transition-colors hairline ${
                    flow.name === item.name
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary/40 hover:bg-accent/40"
                  }`}
                >
                  <span className="block font-medium">{item.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.type} · {item.ecus.join(", ")} · {item.phases.length} phases
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-hairline shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Software package</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                value={pkg}
                onChange={(event) => setPkg(event.target.value)}
                aria-label="Software package"
                disabled={running}
                className="h-11 w-full rounded-full bg-secondary/60 px-4 text-sm hairline"
              >
                {PACKAGES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <Button
                className="w-full rounded-full"
                onClick={() => void start()}
                disabled={running}
              >
                <Upload className="size-4" />
                {running ? "Programming…" : "Start programming"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Do not switch off the ignition or disconnect the VCI while a flash is in progress.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {flow.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
                {percent}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percent} className="h-2" />
            <ol className="space-y-2">
              {flow.phases.map((phase, index) => {
                const phaseEvents = events.filter((event) => event.phaseIndex === index);
                const last = phaseEvents.at(-1);
                return (
                  <li
                    key={phase}
                    className={`rounded-xl px-4 py-3 text-sm hairline ${
                      last?.state === "failed"
                        ? "bg-destructive/10 text-destructive"
                        : last?.state === "done"
                          ? "bg-success/10 text-success"
                          : last
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span className="truncate font-medium">
                        {index + 1}. {phase}
                      </span>
                      {last && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="shrink-0 text-xs"
                        >
                          {last.state === "done"
                            ? "Done"
                            : last.state === "failed"
                              ? "Failed"
                              : "Running"}
                        </motion.span>
                      )}
                    </div>
                    {last && <p className="mt-1 text-xs opacity-80">{last.message}</p>}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
