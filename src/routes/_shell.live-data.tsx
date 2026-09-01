import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ecus, getEcu } from "@/data/vehicle-data";
import { LiveDataWorkbench } from "@/features/diagnostics/live-data-workbench";

export const Route = createFileRoute("/_shell/live-data")({
  head: () => ({
    meta: [
      { title: "Live data · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Stream real-time measured values from any ROX 01 control unit with pause and resume control.",
      },
      { property: "og:title", content: "Live data · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Stream real-time measured values from ROX 01 control units.",
      },
    ],
  }),
  component: LiveDataPage,
});

function LiveDataPage() {
  const [ecuId, setEcuId] = useState(ecus[0]!.id);
  const ecu = getEcu(ecuId) ?? ecus[0]!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live data"
        subtitle="Multi-signal streaming with charting, 100–500 ms sampling and CSV recording"
        actions={
          <select
            value={ecuId}
            onChange={(event) => setEcuId(event.target.value)}
            aria-label="Select control unit"
            className="h-11 rounded-full bg-secondary/60 px-4 text-sm hairline"
          >
            {ecus.map((ecu) => (
              <option key={ecu.id} value={ecu.id}>
                {ecu.id} — {ecu.fullName}
              </option>
            ))}
          </select>
        }
      />
      <LiveDataWorkbench key={ecu.id} ecu={ecu} />
    </div>
  );
}
