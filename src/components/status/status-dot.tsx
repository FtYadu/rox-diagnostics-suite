import { cn } from "@/lib/utils";
import type { EcuScanState } from "@/store/app-store";

const TONE: Record<EcuScanState["status"], string> = {
  ok: "bg-success",
  faults: "bg-destructive",
  "no-response": "bg-warning",
  scanning: "bg-primary animate-pulse",
  "not-scanned": "bg-muted-foreground/40",
};

export const STATUS_LABEL: Record<EcuScanState["status"], string> = {
  ok: "OK",
  faults: "DTCs",
  "no-response": "No response",
  scanning: "Scanning",
  "not-scanned": "Not scanned",
};

export function StatusDot({
  status,
  className,
}: {
  status: EcuScanState["status"];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", TONE[status], className)}
    />
  );
}
