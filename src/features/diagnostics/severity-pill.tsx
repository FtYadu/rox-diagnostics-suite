import { severityLabel } from "@/data/vehicle-data";

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
