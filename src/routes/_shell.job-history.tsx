import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";
import type { Job } from "@/store/app-store";

export const Route = createFileRoute("/_shell/job-history")({
  head: () => ({
    meta: [
      { title: "Job history · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Audit trail of every health scan, service function, clear-DTC and programming job performed on ROX 01 vehicles in this workshop.",
      },
      { property: "og:title", content: "Job history · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Audit trail of diagnostic and programming jobs on ROX 01 vehicles.",
      },
    ],
  }),
  component: JobHistoryPage,
});

const KINDS: Array<{ value: Job["kind"] | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "health-scan", label: "Health scans" },
  { value: "service", label: "Service" },
  { value: "programming", label: "Programming" },
  { value: "clear-dtc", label: "Clear DTC" },
];

function JobHistoryPage() {
  const jobs = useAppStore((s) => s.jobs);
  const [kind, setKind] = useState<Job["kind"] | "all">("all");

  const filtered = useMemo(
    () => (kind === "all" ? jobs : jobs.filter((job) => job.kind === kind)),
    [jobs, kind],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Job history" subtitle={`${jobs.length} recorded jobs`} />

      <div className="flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setKind(item.value)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition-colors hairline ${
              kind === item.value
                ? "bg-primary/15 text-primary"
                : "bg-secondary/50 text-muted-foreground hover:bg-accent/40"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="space-y-1.5 p-4">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No jobs of this type.</p>
          )}
          {filtered.map((job) => (
            <div
              key={job.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 hairline"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {job.id} · {job.technician} · {job.summary}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-xs font-medium ${
                    job.status === "failed"
                      ? "text-destructive"
                      : job.status === "in-progress"
                        ? "text-warning"
                        : "text-success"
                  }`}
                >
                  {job.status}
                </p>
                <p className="text-[11px] text-muted-foreground numerals">
                  {new Date(job.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
