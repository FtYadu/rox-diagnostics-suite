import { AnimatePresence, motion } from "framer-motion";
import { Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceProcess } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import type { ProcessStepEvent } from "@/features/bridge/types";
import { useAppStore } from "@/store/app-store";

export function ProcessRunner({
  processes,
  showEcu = false,
}: {
  processes: ServiceProcess[];
  showEcu?: boolean;
}) {
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
      setEvents((prev) =>
        [...prev.filter((item) => item.index !== event.index), event].sort(
          (a, b) => a.index - b.index,
        ),
      ),
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
    <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Guided processes
            <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
              {processes.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-[560px] space-y-2 overflow-y-auto">
          {processes.length === 0 && (
            <p className="text-sm text-muted-foreground">No guided processes match.</p>
          )}
          {processes.map((process) => (
            <div
              key={`${process.ecu}-${process.name}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 hairline"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {showEcu && <span className="text-primary">{process.ecu} · </span>}
                  {process.name}
                </p>
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
              <p className="text-sm font-medium">
                {active.ecu} · {active.name}
              </p>
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
