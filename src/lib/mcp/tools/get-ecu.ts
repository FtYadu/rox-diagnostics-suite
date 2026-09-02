import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getEcu, processesForEcu } from "@/data/vehicle-data";

export default defineTool({
  name: "get_ecu",
  title: "Get ECU detail",
  description:
    "Return one ECU's detail: domain, identification DIDs, routines, fault codes with severity, and available service processes.",
  inputSchema: {
    ecuId: z.string().trim().min(1).describe("ECU id, e.g. EMS, BMS, ESC."),
    includeDtcs: z.boolean().optional().describe("Include the full DTC list (default true)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ ecuId, includeDtcs = true }) => {
    const ecu = getEcu(ecuId.toUpperCase()) ?? getEcu(ecuId);
    if (!ecu) throw new ToolError(`Unknown ECU "${ecuId}".`);

    const detail = {
      id: ecu.id,
      fullName: ecu.fullName,
      domain: ecu.domain,
      dtcCount: ecu.dtcCount,
      liveDataCount: ecu.liveDataCount,
      identificationDids: ecu.identificationDids,
      routines: ecu.routines,
      processes: processesForEcu(ecu.id).map((process) => ({
        name: process.name,
        category: process.category,
        securityLevel: process.securityLevel,
        udsServices: process.udsServices,
        stepCount: process.steps.length,
      })),
      ...(includeDtcs ? { dtcs: ecu.dtcs } : {}),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
      structuredContent: { ecu: detail },
    };
  },
});
