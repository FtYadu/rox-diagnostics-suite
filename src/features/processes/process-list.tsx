import { Lock, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { processKey, type ServiceProcess } from "@/data/vehicle-data";
import { GuidedRunner } from "@/features/processes/guided-runner";
import { securityLabel } from "@/features/processes/step-model";

export function ProcessList({
  processes,
  showEcu = false,
  emptyMessage = "No guided processes for this control unit.",
}: {
  processes: ServiceProcess[];
  showEcu?: boolean;
  emptyMessage?: string;
}) {
  const [active, setActive] = useState<ServiceProcess | null>(null);

  return (
    <>
      {processes.length === 0 && (
        <p className="rounded-2xl bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground hairline">
          {emptyMessage}
        </p>
      )}
      <ul className="space-y-2">
        {processes.map((process) => (
          <li
            key={processKey(process)}
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-card/60 px-4 py-3 hairline transition-colors hover:bg-accent/30"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{process.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {showEcu && <span className="text-primary">{process.ecu}</span>}
                <span>{process.category}</span>
                <span className="numerals">{process.steps.length} steps</span>
                <span className="font-mono">{process.udsServices.join(" ")}</span>
              </p>
            </div>
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                process.securityLevel === 17
                  ? "bg-destructive/15 text-destructive"
                  : process.securityLevel === 1
                    ? "bg-warning/15 text-warning"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {process.securityLevel > 0 && <Lock className="size-3" />}
              {securityLabel(process.securityLevel)}
            </span>
            <Button className="h-11 rounded-full" onClick={() => setActive(process)}>
              <Play className="size-4" />
              Run
            </Button>
          </li>
        ))}
      </ul>

      <GuidedRunner
        process={active}
        open={Boolean(active)}
        onOpenChange={(open) => !open && setActive(null)}
      />
    </>
  );
}
