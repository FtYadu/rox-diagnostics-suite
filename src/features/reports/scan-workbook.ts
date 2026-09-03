import * as XLSX from "xlsx";
import { getEcu, severityLabel } from "@/data/vehicle-data";
import type { ScanReportInput } from "./scan-report";

const STATUS_TEXT: Record<string, string> = {
  "not-scanned": "Not scanned",
  scanning: "Interrupted",
  ok: "No faults",
  faults: "Faults stored",
  "no-response": "No response",
};

const flagText = (record: ScanReportInput["dtcs"][number]): string => {
  const flags: string[] = [];
  if (record.status.current) flags.push("Current");
  if (record.status.pending) flags.push("Pending");
  if (record.status.confirmed) flags.push("Confirmed");
  if (record.status.testFailedThisCycle) flags.push("Failed this cycle");
  return flags.length > 0 ? flags.join(", ") : "History";
};

/** Builds the XLSX health-scan workbook: summary, ECU sheet and DTC sheet. */
export function buildScanWorkbook(input: ScanReportInput): XLSX.WorkBook {
  const entries = Object.entries(input.scan);
  const book = XLSX.utils.book_new();

  const summary = [
    ["Dealer", input.dealerName ?? "—"],
    ["VIN", input.vin],
    ["Vehicle", "ROX 01 (R11_Oversea)"],
    ["Variant", input.variant ?? "R11"],
    ["Technician", input.technician],
    ["Bridge", input.bridgeMode === "local" ? "Local VCI bridge" : "Simulator"],
    ["Job", input.jobId ?? "—"],
    ["Scan completed", input.completedAt ?? "—"],
    ["Generated", new Date().toISOString()],
    ["ECUs scanned", entries.filter(([, state]) => state.status !== "not-scanned").length],
    ["ECUs with faults", entries.filter(([, state]) => state.status === "faults").length],
    ["No response", entries.filter(([, state]) => state.status === "no-response").length],
    ["Fault codes", input.dtcs.length],
    ["Critical faults", input.dtcs.filter((dtc) => dtc.severity === 3).length],
    ["Notes", input.notes],
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), "Summary");

  const ecuRows = [
    ["ECU", "Full name", "Domain", "Status", "Fault codes"],
    ...entries.map(([ecuId, state]) => {
      const ecu = getEcu(ecuId);
      return [
        ecuId,
        ecu?.fullName ?? "—",
        ecu?.domain ?? "—",
        STATUS_TEXT[state.status] ?? state.status,
        state.dtcCount,
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(ecuRows), "Control units");

  const dtcRows = [
    ["ECU", "Code", "Description", "Severity", "Status", "Occurrences", "Last seen"],
    ...input.dtcs.map((record) => [
      record.ecuId,
      record.code,
      record.name,
      severityLabel(record.severity),
      flagText(record),
      record.occurrences,
      record.lastSeen,
    ]),
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(dtcRows), "Fault codes");

  return book;
}

export const scanWorkbookFileName = (vin: string): string =>
  `ROX-health-scan-${vin || "unknown-vin"}-${new Date().toISOString().slice(0, 10)}.xlsx`;

export function downloadScanWorkbook(input: ScanReportInput): void {
  XLSX.writeFile(buildScanWorkbook(input), scanWorkbookFileName(input.vin));
}
