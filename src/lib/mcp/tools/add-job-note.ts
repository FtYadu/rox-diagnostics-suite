import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_job_note",
  title: "Add job note",
  description: "Append a technician note to one of the signed-in user's diagnostic jobs.",
  inputSchema: {
    jobId: z.string().trim().min(1).describe("Job id, e.g. JOB-12345."),
    title: z.string().trim().min(1).max(120).describe("Short note title."),
    detail: z.string().trim().min(1).max(2000).describe("Note body."),
    ecuId: z.string().trim().optional().describe("Related ECU id, if any."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ jobId, title, detail, ecuId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) return { content: [{ type: "text", text: jobError.message }], isError: true };
    if (!job)
      return { content: [{ type: "text", text: `Job ${jobId} not found.` }], isError: true };

    const clientEventId = `EVT-MCP-${Date.now().toString(36)}`;
    const { error } = await supabase.from("job_events").insert({
      job_id: jobId,
      user_id: ctx.getUserId(),
      client_event_id: clientEventId,
      kind: "note",
      title,
      detail,
      ecu_id: ecuId ?? null,
      status: "info",
      payload: { source: "mcp" },
      occurred_at: new Date().toISOString(),
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Note added to ${jobId}.` }],
      structuredContent: { jobId, eventId: clientEventId },
    };
  },
});
