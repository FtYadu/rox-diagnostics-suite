import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CloudOff, Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchCloudJobs } from "@/features/jobs/job-cloud";
import { traceToText, type Job, type JobEvent } from "@/features/jobs/types";
import { useAppStore } from "@/store/app-store";

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

const STATUS_TONE: Record<Job["status"], string> = {
  failed: "text-destructive",
  "in-progress": "text-warning",
  completed: "text-success",
};

const download = (content: string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

function JobHistoryPage() {
  const jobs = useAppStore((s) => s.jobs);
  const mergeJobs = useAppStore((s) => s.mergeJobs);
  const [kind, setKind] = useState<Job["kind"] | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const cloud = useQuery({
    queryKey: ["cloud-jobs"],
    queryFn: fetchCloudJobs,
    retry: false,
  });

  useEffect(() => {
    if (cloud.data && cloud.data.length > 0) mergeJobs(cloud.data);
  }, [cloud.data, mergeJobs]);

  const filtered = useMemo(
    () => (kind === "all" ? jobs : jobs.filter((job) => job.kind === kind)),
    [jobs, kind],
  );

  const active = jobs.find((job) => job.id === activeId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job history"
        subtitle={`${jobs.length} recorded jobs · ${jobs.reduce((sum, job) => sum + job.events.length, 0)} logged actions`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setKind(item.value)}
            className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors hairline ${
              kind === item.value
                ? "bg-primary/15 text-primary"
                : "bg-secondary/50 text-muted-foreground hover:bg-accent/40"
            }`}
          >
            {item.label}
          </button>
        ))}
        {cloud.isError && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudOff className="size-3.5" />
            Offline — showing locally stored jobs
          </span>
        )}
      </div>

      <Card className="rounded-2xl border-hairline shadow-card">
        <CardContent className="space-y-1.5 p-4">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No jobs of this type.</p>
          )}
          {filtered.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => setActiveId(job.id)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 text-left hairline hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{job.vin}</span> · {job.technician} ·{" "}
                  <span className="numerals">{job.events.length} actions</span> ·{" "}
                  <span className="numerals">
                    {job.dtcTotal} DTC / {job.dtcCritical} critical
                  </span>
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-right">
                  <span className={`block text-xs font-medium ${STATUS_TONE[job.status]}`}>
                    {job.status}
                  </span>
                  <span className="block text-[11px] text-muted-foreground numerals">
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Sheet open={Boolean(active)} onOpenChange={(open) => !open && setActiveId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
          {active && (
            <>
              <SheetHeader className="glass-chrome sticky top-0 z-10 gap-1 border-b p-6">
                <SheetTitle className="text-base">{active.title}</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {active.id} · <span className="font-mono">{active.vin}</span> ·{" "}
                  {active.technician}
                </p>
                <p className="text-xs text-muted-foreground numerals">
                  {new Date(active.createdAt).toLocaleString()}
                  {active.endedAt && ` → ${new Date(active.endedAt).toLocaleTimeString()}`} ·{" "}
                  <span className={STATUS_TONE[active.status]}>{active.status}</span>
                </p>
              </SheetHeader>

              <ol className="space-y-2 p-6">
                {active.events.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No actions recorded against this job yet.
                  </p>
                )}
                {active.events.map((event) => (
                  <EventRow key={event.id} event={event} jobId={active.id} />
                ))}
              </ol>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EventRow({ event, jobId }: { event: JobEvent; jobId: string }) {
  const tone =
    event.status === "failed"
      ? "text-destructive"
      : event.status === "info"
        ? "text-muted-foreground"
        : "text-success";

  return (
    <li className="rounded-2xl bg-secondary/40 p-4 hairline">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</p>
        <span className={`text-[11px] font-medium ${tone}`}>{event.status}</span>
        <span className="text-[11px] text-muted-foreground numerals">
          {new Date(event.at).toLocaleTimeString()}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.detail}</p>
      {(event.trace?.length || event.csv) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.trace && event.trace.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 rounded-full"
              onClick={() =>
                download(
                  traceToText(event.trace ?? []),
                  `${jobId}-${event.id}-trace.txt`,
                  "text/plain",
                )
              }
            >
              <FileText className="size-3.5" />
              Trace ({event.trace.length})
            </Button>
          )}
          {event.csv && (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 rounded-full"
              onClick={() => download(event.csv ?? "", `${jobId}-${event.id}.csv`, "text/csv")}
            >
              <Download className="size-3.5" />
              CSV
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
