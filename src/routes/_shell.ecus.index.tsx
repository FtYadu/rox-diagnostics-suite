import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot, STATUS_LABEL } from "@/components/status/status-dot";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DOMAIN_ORDER, ecus, processesForEcu } from "@/data/vehicle-data";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/ecus/")({
  head: () => ({
    meta: [
      { title: "ECUs · ROX Diagnostics" },
      {
        name: "description",
        content:
          "All 41 ROX 01 control units grouped by domain with scan status, stored DTC counts and direct access to identification, live data and routines.",
      },
      { property: "og:title", content: "ECUs · ROX Diagnostics" },
      {
        property: "og:description",
        content: "All 41 ROX 01 control units grouped by domain with scan status.",
      },
    ],
  }),
  component: EcuListPage,
});

function EcuListPage() {
  const scan = useAppStore((s) => s.scan);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<string>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ecus.filter((ecu) => {
      const matchesDomain = domain === "All" || ecu.domain === domain;
      const matchesQuery =
        q.length === 0 ||
        ecu.id.toLowerCase().includes(q) ||
        ecu.fullName.toLowerCase().includes(q);
      return matchesDomain && matchesQuery;
    });
  }, [query, domain]);

  const groups = DOMAIN_ORDER.map((d) => ({
    domain: d,
    items: filtered.filter((ecu) => ecu.domain === d),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control units"
        subtitle={`${ecus.length} ECUs across ${DOMAIN_ORDER.length} domains`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ECU or name"
            aria-label="Search control units"
            className="h-11 rounded-full pl-9"
          />
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {["All", ...DOMAIN_ORDER].map((option) => (
            <button
              key={option}
              onClick={() => setDomain(option)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
                domain === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/70 text-muted-foreground hover:bg-accent",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.domain} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {group.domain}
            <span className="ml-2 numerals">{group.items.length}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((ecu) => {
              const state = scan[ecu.id] ?? { status: "not-scanned" as const, dtcCount: 0 };
              return (
                <motion.div key={ecu.id} whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                  <Link to="/ecus/$ecuId" params={{ ecuId: ecu.id }} className="block">
                    <Card className="rounded-2xl border-hairline shadow-card transition-colors hover:bg-accent/30">
                      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-5">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <StatusDot status={state.status} />
                            <p className="truncate text-sm font-semibold">{ecu.id}</p>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {ecu.fullName}
                          </p>
                          <p className="mt-3 text-xs text-muted-foreground numerals">
                            {STATUS_LABEL[state.status]} · {state.dtcCount} active ·{" "}
                            {ecu.dtcs.length} known · {processesForEcu(ecu.id).length} functions
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No control units match this filter.</p>
      )}
    </div>
  );
}
