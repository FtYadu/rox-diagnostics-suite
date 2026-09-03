import {
  Circle,
  Download,
  LayoutGrid,
  LineChart as LineChartIcon,
  Pause,
  Play,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Ecu } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { defaultSignalIds, liveDataCatalog } from "@/features/bridge/live-data";
import type { LiveDataSignal } from "@/features/bridge/types";
import { useAppStore } from "@/store/app-store";

const RATES = [100, 250, 500] as const;
const WINDOW_MS = 60_000;
const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary)",
];

type Sample = { t: number } & Record<string, number>;

const decimals = (signal: LiveDataSignal) => (signal.max - signal.min <= 5 ? 2 : 1);

export function LiveDataWorkbench({ ecu }: { ecu: Ecu }) {
  const { bridge } = useBridge();
  const appendEvent = useAppStore((s) => s.appendEvent);
  const catalog = useMemo(() => liveDataCatalog(ecu), [ecu]);

  const [selected, setSelected] = useState<string[]>(() => defaultSignalIds(ecu));
  const [view, setView] = useState<"grid" | "chart">("grid");
  const [rate, setRate] = useState<(typeof RATES)[number]>(250);
  const [running, setRunning] = useState(true);
  const [signals, setSignals] = useState<LiveDataSignal[]>([]);
  const [history, setHistory] = useState<Sample[]>([]);
  const [recording, setRecording] = useState(false);
  const recordRef = useRef<string[]>([]);

  useEffect(() => {
    setSelected(defaultSignalIds(ecu));
    setHistory([]);
    setSignals([]);
  }, [ecu]);

  useEffect(() => {
    if (!running || selected.length === 0) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const next = await bridge.readLiveData(ecu, selected);
        if (!alive) return;
        setSignals(next);
        const sample = { t: Date.now() } as Sample;
        next.forEach((signal) => {
          sample[signal.id] = Number(signal.value.toFixed(3));
        });
        setHistory((prev) => [...prev, sample].filter((item) => sample.t - item.t <= WINDOW_MS));
        if (recordRef.current.length > 0) {
          recordRef.current.push(
            [new Date(sample.t).toISOString(), ...next.map((s) => s.value.toFixed(3))].join(","),
          );
        }
      } catch {
        if (alive) setRunning(false);
      }
      if (alive) timer = setTimeout(() => void poll(), rate);
    };

    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [bridge, ecu, rate, running, selected]);

  const toggleSignal = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  const downloadCsv = useCallback((csv: string, name: string) => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const toggleRecording = () => {
    if (!recording) {
      recordRef.current = [
        ["timestamp", ...signals.map((s) => `${s.label} (${s.unit})`)].join(","),
      ];
      setRecording(true);
      toast.success("Recording started");
      return;
    }
    setRecording(false);
    const csv = recordRef.current.join("\n");
    const rows = Math.max(0, recordRef.current.length - 1);
    recordRef.current = [];
    const name = `${ecu.id}-live-${Date.now()}.csv`;
    appendEvent({
      kind: "recording",
      title: `Live data recording · ${ecu.id}`,
      detail: `${rows} samples at ${rate} ms across ${signals.length} signals.`,
      ecuId: ecu.id,
      status: "ok",
      csv,
    });
    downloadCsv(csv, name);
    toast.success(`Recording saved to job · ${rows} samples`);
  };

  const chartData = history.map((sample) => ({
    ...sample,
    label: new Date(sample.t).toLocaleTimeString(),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" className="h-11 rounded-full">
              Signals ({selected.length}/{catalog.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <ScrollArea className="h-72">
              <div className="p-2">
                {catalog.map((definition) => (
                  <label
                    key={definition.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={selected.includes(definition.id)}
                      onCheckedChange={() => toggleSignal(definition.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{definition.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {definition.did}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <div className="flex gap-1 rounded-full bg-secondary/60 p-1 hairline">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${view === "grid" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            <LayoutGrid className="size-4" /> Grid
          </button>
          <button
            type="button"
            onClick={() => setView("chart")}
            aria-label="Chart view"
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${view === "chart" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            <LineChartIcon className="size-4" /> Chart
          </button>
        </div>

        <div className="flex gap-1 rounded-full bg-secondary/60 p-1 hairline">
          {RATES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRate(value)}
              className={`min-h-9 rounded-full px-3 text-xs font-medium numerals ${rate === value ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              {value} ms
            </button>
          ))}
        </div>

        <Button
          variant="secondary"
          className="h-11 rounded-full"
          onClick={() => setRunning((prev) => !prev)}
        >
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          {running ? "Pause" : "Resume"}
        </Button>

        <Button
          variant={recording ? "destructive" : "secondary"}
          className="h-11 rounded-full"
          onClick={toggleRecording}
          disabled={signals.length === 0}
        >
          {recording ? <Download className="size-4" /> : <Circle className="size-4" />}
          {recording ? "Stop & save CSV" : "Record"}
        </Button>
      </div>

      {selected.length === 0 && (
        <p className="rounded-2xl bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground hairline">
          Select at least one signal to start streaming.
        </p>
      )}

      {view === "grid" && signals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((signal) => (
            <div key={signal.id} className="rounded-2xl bg-card/70 p-4 hairline">
              <p className="truncate text-xs text-muted-foreground">{signal.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight numerals">
                {signal.value.toFixed(decimals(signal))}
                {signal.unit && (
                  <span className="ml-1 text-sm text-muted-foreground">{signal.unit}</span>
                )}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground numerals">
                range {signal.min} – {signal.max}
              </p>
            </div>
          ))}
        </div>
      )}

      {view === "chart" && signals.length > 0 && (
        <div className="rounded-2xl bg-card/70 p-4 hairline">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                  minTickGap={40}
                />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" width={44} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                {signals.map((signal, index) => (
                  <Line
                    key={signal.id}
                    type="monotone"
                    dataKey={signal.id}
                    name={`${signal.label} (${signal.unit})`}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={1.75}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            60-second rolling window · hover the chart for a cursor readout
          </p>
        </div>
      )}
    </div>
  );
}
