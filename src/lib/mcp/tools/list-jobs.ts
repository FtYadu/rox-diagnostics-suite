import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_jobs",
  title: "List diagnostic jobs",
  description:
    "List the signed-in technician's diagnostic jobs (VIN, kind, status, DTC totals), newest first.",
  inputSchema: {
    vin: z.string().trim().optional().describe("Filter by VIN."),
    status: z.enum(["in-progress", "completed", "failed"]).optional(),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ vin, status, limit = 20 }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("jobs")
      .select(
        "id, vin, technician, title, kind, status, summary, dtc_total, dtc_critical, actions_count, started_at, ended_at",
      )
      .order("started_at", { ascending: false })
      .limit(limit);
    if (vin) query = query.eq("vin", vin);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { count: data?.length ?? 0, jobs: data ?? [] },
    };
  },
});
