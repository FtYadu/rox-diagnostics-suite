import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEcu } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { liveDataCatalog } from "@/features/bridge/live-data";
import type { LiveDataSignal } from "@/features/bridge/types";

export function LiveDataPanel({ ecuId }: { ecuId: string }) {
  const ecu = getEcu(ecuId);
  const { bridge } = useBridge();
  const [signals, setSignals] = useState<LiveDataSignal[]>([]);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    if (!ecu || !streaming) return;
    let active = true;
    const ids = liveDataCatalog(ecu).map((definition) => definition.id);
    const tick = async () => {
      const next = await bridge.readLiveData(ecu, ids);
      if (active) setSignals(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), 900);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bridge, ecu, streaming]);

  if (!ecu) return null;

  return (
    <Card className="rounded-2xl border-hairline shadow-card">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">
          Live data
          <span className="ml-2 text-sm font-normal text-muted-foreground numerals">
            {ecu.liveDataCount} signals
          </span>
        </CardTitle>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => setStreaming((value) => !value)}
        >
          {streaming ? "Pause" : "Resume"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-xl bg-secondary/40 p-4 hairline">
            <p className="truncate text-xs text-muted-foreground">{signal.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight numerals">
              {signal.value}
              {signal.unit && (
                <span className="ml-1 text-sm text-muted-foreground">{signal.unit}</span>
              )}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
