import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ecus } from "@/data/vehicle-data";
import { LiveDataPanel } from "@/features/diagnostics/live-data-panel";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live data"
        subtitle="Real-time measured values streamed from the selected control unit"
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
      <LiveDataPanel ecuId={ecuId} />
    </div>
  );
}
