import { createFileRoute, Link } from "@tanstack/react-router";
import { Cpu, Gauge, Network, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ecusByDomain, processes, programmingFlows, vehicle } from "@/data/vehicle-data";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell/vehicle")({
  head: () => ({
    meta: [
      { title: "Vehicle overview · ROX Diagnostics" },
      {
        name: "description",
        content:
          "ROX 01 (R11_Oversea) vehicle identification, bus topology and the full control-unit map grouped by vehicle domain.",
      },
      { property: "og:title", content: "Vehicle overview · ROX Diagnostics" },
      {
        property: "og:description",
        content: "ROX 01 vehicle identification, bus topology and control-unit map.",
      },
    ],
  }),
  component: VehiclePage,
});

function VehiclePage() {
  const vin = useAppStore((s) => s.vin);
  const groups = ecusByDomain();

  return (
    <div className="space-y-6">
      <PageHeader
        title={vehicle.name}
        subtitle={`Internal code ${vehicle.code} · connected via ${vehicle.bus}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Cpu className="size-4" />} label="Control units" value={vehicle.ecuCount} />
        <Metric icon={<Network className="size-4" />} label="Bus" value={vehicle.bus} />
        <Metric icon={<Wrench className="size-4" />} label="Service processes" value={processes.length} />
        <Metric
          icon={<Gauge className="size-4" />}
          label="Programming flows"
          value={programmingFlows.length}
        />
      </div>

      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Identification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="VIN" value={vin || "Not set — use the VIN chip in the top bar"} mono />
          <Field label="Example VIN" value={vehicle.vinExample} mono />
          <Field label="Model" value={vehicle.name} />
          <Field label="Project code" value={vehicle.code} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-hairline shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Topology by domain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.map((group) => (
            <div key={group.domain}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{group.domain}</h3>
                <span className="text-xs text-muted-foreground numerals">
                  {group.ecus.length} units
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.ecus.map((ecu) => (
                  <Link
                    key={ecu.id}
                    to="/ecus/$ecuId"
                    params={{ ecuId: ecu.id }}
                    className="rounded-full bg-secondary/60 px-3 py-1.5 text-xs font-medium hairline transition-colors hover:bg-accent/50"
                  >
                    {ecu.id}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="rounded-2xl border-hairline shadow-card">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <p className="text-xs">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight numerals">{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-4 hairline">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
