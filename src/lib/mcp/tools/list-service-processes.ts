import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { processes } from "@/data/vehicle-data";

export default defineTool({
  name: "list_service_processes",
  title: "List service functions",
  description:
    "Search the ROX 01 guided service functions (resets, coding, immobiliser, calibration, actuator tests) by ECU, category, security level or free text.",
  inputSchema: {
    ecuId: z.string().trim().optional().describe("Restrict to one ECU id."),
    category: z.string().trim().optional().describe("Category, e.g. Reset, Coding, Calibration."),
    securityLevel: z
      .number()
      .int()
      .optional()
      .describe("Security level: 0 none, 1 extended, 17 immobiliser."),
    search: z.string().trim().optional().describe("Text match on the process name."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ ecuId, category, securityLevel, search, limit = 25 }) => {
    const term = search?.toLowerCase();
    const matches = processes.filter((process) => {
      if (ecuId && process.ecu.toLowerCase() !== ecuId.toLowerCase()) return false;
      if (category && process.category.toLowerCase() !== category.toLowerCase()) return false;
      if (securityLevel !== undefined && process.securityLevel !== securityLevel) return false;
      if (term && !process.name.toLowerCase().includes(term)) return false;
      return true;
    });

    const rows = matches.slice(0, limit).map((process) => ({
      ecu: process.ecu,
      name: process.name,
      category: process.category,
      securityLevel: process.securityLevel,
      udsServices: process.udsServices,
      stepCount: process.steps.length,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { total: matches.length, returned: rows.length, processes: rows },
    };
  },
});
