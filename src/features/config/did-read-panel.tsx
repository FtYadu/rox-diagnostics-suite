import { Download, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Did, Ecu } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { describeNrcWithHint } from "@/features/bridge/types";
import type { TraceLine } from "@/features/bridge/types";
import { TraceConsole } from "@/features/diagnostics/trace-console";
import { compareToExpected, decodeDid, parseHex } from "@/lib/did-codec";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type ReadRow = {
  did: Did;
  raw: string;
  value: string;
  error?: string;
  at: string;
};

const didHex = (did: number) => `0x${did.toString(16).toUpperCase().padStart(4, "0")}`;

const readableDids = (ecu: Ecu): Did[] => {
  const seen = new Map<number, Did>();
  for (const did of [...(ecu.identDids ?? []), ...(ecu.liveDids ?? []), ...(ecu.writeDids ?? [])]) {
    if (!seen.has(did.did)) seen.set(did.did, did);
  }
  return [...seen.values()].sort((a, b) => a.did - b.did);
};

/**
 * ReadDataByIdentifier (0x22) workbench. Reads any canonical identifier the
 * control unit publishes through the active bridge — simulator or real car —
 * and shows raw bytes, the decoded value and the expected-value comparison.
 */
export function DidReadPanel({ ecu }: { ecu: Ecu }) {
  const { bridge } = useBridge();
  const appendEvent = useAppStore((s) => s.appendEvent);

  const catalog = useMemo(() => readableDids(ecu), [ecu]);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReadRow[]>([]);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [busyDid, setBusyDid] = useState<number | null>(null);
  const [readingAll, setReadingAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return catalog;
    return catalog.filter(
      (did) =>
        did.label.toLowerCase().includes(needle) || didHex(did.did).toLowerCase().includes(needle),
    );
  }, [catalog, query]);

  const readOne = async (did: Did): Promise<ReadRow> => {
    setBusyDid(did.did);
    const result = await bridge.readDid({ ecu, did: did.did });
    setTrace((prev) => [...prev, ...result.trace]);
    const raw = result.raw ?? "";
    const row: ReadRow = {
      did,
      raw,
      value: result.value ?? (raw === "" ? "—" : decodeDid(did, parseHex(raw))),
      at: new Date().toISOString(),
      ...(result.ok
        ? {}
        : { error: result.error ? describeNrcWithHint(result.error.nrc) : result.message }),
    };
    setRows((prev) => [row, ...prev.filter((entry) => entry.did.did !== did.did)]);
    setBusyDid(null);
    return row;
  };

  const handleRead = async (did: Did) => {
    const row = await readOne(did);
    setTraceOpen(true);
    appendEvent({
      kind: "identification",
      title: `Read ${did.label} · ${ecu.id}`,
      detail: `22 ${didHex(did.did)} → ${row.error ? row.error : `${row.value} (${row.raw || "no data"})`}`,
      ecuId: ecu.id,
      status: row.error ? "failed" : "ok",
    });
    if (row.error) toast.error(row.error);
  };

  const handleReadAll = async () => {
    setReadingAll(true);
    let failures = 0;
    for (const did of filtered) {
      const row = await readOne(did);
      if (row.error) failures += 1;
    }
    setReadingAll(false);
    setTraceOpen(true);
    if (failures === 0) toast.success(`${filtered.length} identifiers read`);
    else toast.warning(`${filtered.length - failures} read, ${failures} refused`);
  };

  const exportCsv = () => {
    const header = "identifier,label,raw,value,read_at\n";
    const body = rows
      .map((row) =>
        [didHex(row.did.did), row.did.label, row.raw, row.error ?? row.value, row.at]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${ecu.id}-identifiers.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (catalog.length === 0) {
    return (
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {ecu.id} publishes no readable identifiers.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            Readable identifiers
            <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
              {filtered.length}/{catalog.length}
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name or 0x…"
                className="h-11 w-56 rounded-xl pl-8"
                aria-label="Filter identifiers"
              />
            </div>
            <Button
              className="min-h-11 rounded-full"
              onClick={() => void handleReadAll()}
              disabled={readingAll || busyDid !== null}
            >
              <RefreshCw className={readingAll ? "size-4 animate-spin" : "size-4"} />
              Read all
            </Button>
            <Button
              variant="secondary"
              className="min-h-11 rounded-full"
              onClick={exportCsv}
              disabled={rows.length === 0}
            >
              <Download className="size-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Identifier</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Raw</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 pr-3 font-medium">Expected</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((did) => {
                const row = rows.find((entry) => entry.did.did === did.did);
                const match =
                  row && !row.error && did.expected
                    ? compareToExpected(did, parseHex(row.raw))
                    : null;
                return (
                  <tr key={did.did} className="border-t border-hairline/60">
                    <td className="py-2 pr-3 font-mono text-xs numerals">{didHex(did.did)}</td>
                    <td className="py-2 pr-3">{did.label}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                      {row?.raw || "—"}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 numerals",
                        row?.error && "text-danger",
                        match === true && "text-success",
                      )}
                    >
                      {row ? (row.error ?? row.value) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {did.expected ?? "—"}
                      {match === false ? <span className="ml-1 text-warning">mismatch</span> : null}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-9 rounded-full"
                        onClick={() => void handleRead(did)}
                        disabled={busyDid !== null || readingAll}
                      >
                        {busyDid === did.did ? "Reading…" : "Read"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <TraceConsole lines={trace} open={traceOpen} onOpenChange={setTraceOpen} />
    </div>
  );
}
