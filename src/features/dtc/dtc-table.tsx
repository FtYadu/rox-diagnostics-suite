import { ChevronRight, Eraser, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { DtcRecord } from "@/features/bridge/types";
import { SeverityPill } from "@/features/diagnostics/severity-pill";
import { DtcDetailSheet } from "./dtc-detail-sheet";
import { StatusFlags } from "./status-flags";

type Filter = "all" | "current" | "history" | "critical";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "current", label: "Current" },
  { value: "history", label: "History" },
  { value: "critical", label: "Severity 3" },
];

const keyOf = (record: DtcRecord) => `${record.ecuId}:${record.code}`;

export function DtcTable({
  records,
  showEcu = false,
  emptyMessage = "No stored faults.",
  onClear,
}: {
  records: DtcRecord[];
  showEcu?: boolean;
  emptyMessage?: string;
  onClear?: (records: DtcRecord[]) => Promise<void> | void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<DtcRecord | null>(null);
  const [clearing, setClearing] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records
      .filter((record) => {
        if (filter === "current" && !record.status.current) return false;
        if (filter === "history" && record.status.current) return false;
        if (filter === "critical" && record.severity < 3) return false;
        if (!needle) return true;
        return (
          record.code.toLowerCase().includes(needle) ||
          record.name.toLowerCase().includes(needle) ||
          record.ecuId.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.severity - a.severity || a.code.localeCompare(b.code));
  }, [records, filter, query]);

  const toggle = (record: DtcRecord) =>
    setSelected((prev) =>
      prev.includes(keyOf(record))
        ? prev.filter((item) => item !== keyOf(record))
        : [...prev, keyOf(record)],
    );

  const clearSelected = async () => {
    if (!onClear) return;
    const targets = records.filter((record) => selected.includes(keyOf(record)));
    if (targets.length === 0) return;
    setClearing(true);
    await onClear(targets);
    setSelected([]);
    setClearing(false);
  };

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.includes(keyOf(r)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-secondary/60 p-1 hairline">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                filter === item.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code or description"
            aria-label="Search diagnostic trouble codes"
            className="h-11 rounded-full pl-10"
          />
        </div>

        {onClear && (
          <Button
            variant="secondary"
            className="h-11 rounded-full"
            disabled={selected.length === 0 || clearing}
            onClick={() => void clearSelected()}
          >
            <Eraser className="size-4" />
            Clear selected{selected.length > 0 ? ` (${selected.length})` : ""}
          </Button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="rounded-2xl bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground hairline">
          {records.length === 0 ? emptyMessage : "No codes match the current filter."}
        </p>
      )}

      {filtered.length > 0 && onClear && (
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) =>
              setSelected(checked === true ? filtered.map(keyOf) : [])
            }
            aria-label="Select all listed codes"
          />
          Select all {filtered.length} listed
        </label>
      )}

      <ul className="space-y-2">
        {filtered.map((record) => (
          <li
            key={keyOf(record)}
            className="flex items-center gap-3 rounded-2xl bg-secondary/40 px-3 py-3 hairline transition-colors hover:bg-accent/40"
          >
            {onClear && (
              <Checkbox
                checked={selected.includes(keyOf(record))}
                onCheckedChange={() => toggle(record)}
                aria-label={`Select ${record.code}`}
              />
            )}
            <button
              type="button"
              onClick={() => setActive(record)}
              className="grid min-h-11 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold numerals">{record.code}</span>
                  {showEcu && <span className="text-xs text-primary">{record.ecuId}</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{record.name}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusFlags status={record.status} />
                  <span className="text-[10px] text-muted-foreground numerals">
                    ×{record.occurrences}
                  </span>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <SeverityPill severity={record.severity} />
                <ChevronRight className="size-4 text-muted-foreground" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <DtcDetailSheet
        record={active}
        onOpenChange={(open) => !open && setActive(null)}
        {...(onClear ? { onClear } : {})}
      />
    </div>
  );
}
