import type { DtcStatusFlags } from "@/features/bridge/types";
import { cn } from "@/lib/utils";

const FLAGS: Array<{ key: keyof DtcStatusFlags; label: string; tone: string }> = [
  { key: "current", label: "Current", tone: "bg-destructive/15 text-destructive" },
  { key: "pending", label: "Pending", tone: "bg-warning/15 text-warning" },
  { key: "confirmed", label: "Confirmed", tone: "bg-primary/15 text-primary" },
  {
    key: "testFailedThisCycle",
    label: "Test failed this cycle",
    tone: "bg-warning/15 text-warning",
  },
];

export function StatusFlags({ status, className }: { status: DtcStatusFlags; className?: string }) {
  const active = FLAGS.filter((flag) => status[flag.key]);
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {active.length === 0 && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          History
        </span>
      )}
      {active.map((flag) => (
        <span
          key={flag.key}
          className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", flag.tone)}
        >
          {flag.label}
        </span>
      ))}
    </div>
  );
}
