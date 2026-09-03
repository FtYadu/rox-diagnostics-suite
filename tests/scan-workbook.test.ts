import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { ScanReportInput } from "@/features/reports/scan-report";
import { buildScanWorkbook, scanWorkbookFileName } from "@/features/reports/scan-workbook";
import { ecus } from "@/data/vehicle-data";

const first = ecus[0]!;
const dtc = first.dtcs[0]!;

const input: ScanReportInput = {
  vin: "LRX01TEST00000001",
  technician: "Alex Tester",
  scan: { [first.id]: { status: "faults", dtcCount: 1 } },
  dtcs: [
    {
      ...dtc,
      ecuId: first.id,
      status: { current: true, pending: false, confirmed: true, testFailedThisCycle: false },
      statusByte: "0xC9",
      occurrences: 3,
      firstSeen: "2026-09-01T09:00:00.000Z",
      lastSeen: "2026-09-03T09:00:00.000Z",
    },
  ],
  notes: "Replaced connector, cleared faults.",
  completedAt: "2026-09-03T09:30:00.000Z",
  jobId: "job-1",
  bridgeMode: "simulator",
  dealerName: "ROX Dealer Dubai",
  variant: "R11",
};

describe("buildScanWorkbook", () => {
  it("creates summary, ECU and DTC sheets", () => {
    const book = buildScanWorkbook(input);
    expect(book.SheetNames).toEqual(["Summary", "Control units", "Fault codes"]);
  });

  it("writes the dealer, VIN and technician into the summary", () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(buildScanWorkbook(input).Sheets["Summary"]!, {
      header: 1,
    });
    const flat = new Map(rows.map((row) => [row[0], row[1]]));
    expect(flat.get("Dealer")).toBe("ROX Dealer Dubai");
    expect(flat.get("VIN")).toBe("LRX01TEST00000001");
    expect(flat.get("Technician")).toBe("Alex Tester");
    expect(flat.get("Fault codes")).toBe(1);
  });

  it("lists each fault code with status and severity", () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(
      buildScanWorkbook(input).Sheets["Fault codes"]!,
      { header: 1 },
    );
    expect(rows[0]).toContain("Code");
    expect(rows[1]?.[1]).toBe(dtc.code);
    expect(String(rows[1]?.[4])).toContain("Current");
  });

  it("names the file after the VIN", () => {
    expect(scanWorkbookFileName("LRX01TEST00000001")).toContain("LRX01TEST00000001");
    expect(scanWorkbookFileName("")).toContain("unknown-vin");
  });
});
