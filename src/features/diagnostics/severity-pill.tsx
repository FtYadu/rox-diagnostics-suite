import { severityText, severityTone } from "@/features/dtc/dtc-knowledge";
import { cn } from "@/lib/utils";

const TONE = {
  critical: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-secondary text-muted-foreground",
} as const;

export function SeverityPill({ severity, className }: { severity: number; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
        TONE[severityTone(severity)],
        className,
      )}
    >
      {severityText(severity)}
    </span>
  );
}
