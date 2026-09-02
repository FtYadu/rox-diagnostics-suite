import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ecus } from "@/data/vehicle-data";

export default defineTool({
  name: "list_ecus",
  title: "List ECUs",
  description:
    "List the ROX 01 (R11_Oversea) control units, optionally filtered by domain or a text search on ECU id/name.",
  inputSchema: {
    domain: z.string().trim().optional().describe("Domain filter, e.g. Powertrain, Chassis, ADAS."),
    search: z.string().trim().optional().describe("Text match on ECU id or full name."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ domain, search }) => {
    const term = search?.toLowerCase();
    const rows = ecus
      .filter((ecu) => (domain ? ecu.domain.toLowerCase() === domain.toLowerCase() : true))
      .filter((ecu) =>
        term ? `${ecu.id} ${ecu.fullName}`.toLowerCase().includes(term) : true,
      )
      .map((ecu) => ({
        id: ecu.id,
        fullName: ecu.fullName,
        domain: ecu.domain,
        dtcCount: ecu.dtcCount,
        routineCount: ecu.routines.length,
      }));

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, ecus: rows },
    };
  },
});
