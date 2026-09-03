import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_job",
  title: "Get job detail",
  description:
    "Return one of the signed-in technician's jobs with its action timeline (scan, DTC clear, service, programming, notes).",
  inputSchema: {
    jobId: z.string().trim().min(1).describe("Job id, e.g. JOB-12345."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ jobId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: job, error } = await supabase
      .from("jobs")
      .select(
        "id, vin, technician, title, kind, status, summary, dtc_total, dtc_critical, started_at, ended_at",
      )
      .eq("id", jobId)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!job)
      return { content: [{ type: "text", text: `Job ${jobId} not found.` }], isError: true };

    const { data: events, error: eventsError } = await supabase
      .from("job_events")
      .select("client_event_id, kind, title, detail, ecu_id, status, occurred_at")
      .eq("job_id", jobId)
      .order("occurred_at", { ascending: true });
    if (eventsError) {
      return { content: [{ type: "text", text: eventsError.message }], isError: true };
    }

    const detail = { ...job, events: events ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
      structuredContent: { job: detail },
    };
  },
});
