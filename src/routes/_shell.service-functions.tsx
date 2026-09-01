import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { ecus, processCategories, processes } from "@/data/vehicle-data";
import { ProcessRunner } from "@/features/diagnostics/process-runner";

export const Route = createFileRoute("/_shell/service-functions")({
  head: () => ({
    meta: [
      { title: "Service functions · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Search and execute all guided service functions, calibrations and adaptations available across the ROX 01 control units.",
      },
      { property: "og:title", content: "Service functions · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Guided service functions, calibrations and adaptations for the ROX 01.",
      },
    ],
  }),
  component: ServiceFunctionsPage,
});

function ServiceFunctionsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [ecuFilter, setEcuFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return processes.filter((process) => {
      if (category !== "all" && process.category !== category) return false;
      if (ecuFilter !== "all" && process.ecu !== ecuFilter) return false;
      if (!needle) return true;
      return (
        process.name.toLowerCase().includes(needle) || process.ecu.toLowerCase().includes(needle)
      );
    });
  }, [query, category, ecuFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service functions"
        subtitle={`${processes.length} guided processes across ${new Set(processes.map((p) => p.ecu)).size} control units`}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search process or ECU"
            aria-label="Search service functions"
            className="h-11 rounded-full pl-10"
          />
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter by category"
          className="h-11 rounded-full bg-secondary/60 px-4 text-sm hairline"
        >
          <option value="all">All categories</option>
          {processCategories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={ecuFilter}
          onChange={(event) => setEcuFilter(event.target.value)}
          aria-label="Filter by control unit"
          className="h-11 rounded-full bg-secondary/60 px-4 text-sm hairline"
        >
          <option value="all">All ECUs</option>
          {ecus.map((ecu) => (
            <option key={ecu.id} value={ecu.id}>
              {ecu.id}
            </option>
          ))}
        </select>
      </div>

      <ProcessRunner processes={filtered} showEcu />
    </div>
  );
}
