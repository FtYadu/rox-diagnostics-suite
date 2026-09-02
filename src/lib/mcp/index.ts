import { auth, defineMcp } from "@lovable.dev/mcp-js";
import type { McpDefinitionInput } from "@lovable.dev/mcp-js";
import listEcusTool from "./tools/list-ecus";
import getEcuTool from "./tools/get-ecu";
import listServiceProcessesTool from "./tools/list-service-processes";
import listJobsTool from "./tools/list-jobs";
import getJobTool from "./tools/get-job";
import addJobNoteTool from "./tools/add-job-note";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "rox-diagnostics-suite",
  title: "Rox Diagnostics Suite",
  version: "0.1.0",
  instructions:
    "Tools for the ROX Diagnostics workstation (ROX 01 / R11_Oversea). Use `list_ecus` and `get_ecu` to explore the 41 control units, their fault codes and routines, `list_service_processes` to find guided service functions, and `list_jobs` / `get_job` / `add_job_note` to review and annotate the signed-in technician's diagnostic jobs.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listEcusTool,
    getEcuTool,
    listServiceProcessesTool,
    listJobsTool,
    getJobTool,
    addJobNoteTool,
    // Tools omit `outputSchema`; the SDK's optional-property typing needs the cast
  // under exactOptionalPropertyTypes.
  ] as unknown as McpDefinitionInput["tools"],
});
