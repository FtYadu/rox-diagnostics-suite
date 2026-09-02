import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getEcu, severityLabel, vehicle } from "@/data/vehicle-data";
import type { DtcRecord } from "@/features/bridge/types";
import type { EcuScanState } from "@/store/app-store";

export type ScanReportInput = {
  vin: string;
  technician: string;
  /** Per-ECU scan state, keyed by ECU id. */
  scan: Record<string, EcuScanState>;
  dtcs: DtcRecord[];
  notes: string;
  completedAt?: string | null;
  jobId?: string | null;
  bridgeMode: "simulator" | "local";
};

const INK = { r: 17, g: 17, b: 21 };
const MUTED = { r: 120, g: 120, b: 128 };
const ACCENT = { r: 10, g: 132, b: 255 };
const MARGIN = 48;

const STATUS_TEXT: Record<EcuScanState["status"], string> = {
  "not-scanned": "Not scanned",
  scanning: "Interrupted",
  ok: "No faults",
  faults: "Faults stored",
  "no-response": "No response",
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const statusFlags = (record: DtcRecord): string => {
  const flags: string[] = [];
  if (record.status.current) flags.push("Current");
  if (record.status.pending) flags.push("Pending");
  if (record.status.confirmed) flags.push("Confirmed");
  if (record.status.testFailedThisCycle) flags.push("Failed this cycle");
  return flags.length > 0 ? flags.join(", ") : "History";
};

/** Builds the multi-page diagnostic report and returns the jsPDF document. */
export function buildScanReportDocument(input: ScanReportInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();

  const entries = Object.entries(input.scan);
  const scannedCount = entries.filter(([, state]) => state.status !== "not-scanned").length;
  const faulted = entries.filter(([, state]) => state.status === "faults");
  const noResponse = entries.filter(([, state]) => state.status === "no-response");
  const critical = input.dtcs.filter((dtc) => dtc.severity === 3);

  // --- Header band -----------------------------------------------------------
  doc.setFillColor(INK.r, INK.g, INK.b);
  doc.rect(0, 0, pageWidth, 104, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Vehicle health scan report", MARGIN, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(170, 172, 180);
  doc.text(`ROX Diagnostics · ${vehicle.name}`, MARGIN, 68);
  doc.text(`Generated ${formatDateTime(generatedAt)}`, MARGIN, 84);

  doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(input.vin || "VIN NOT SET", pageWidth - MARGIN, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(170, 172, 180);
  doc.text(
    input.bridgeMode === "local" ? "Hardware VCI session" : "Simulator session",
    pageWidth - MARGIN,
    68,
    { align: "right" },
  );

  // --- Vehicle & session -----------------------------------------------------
  let cursor = 140;
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Vehicle and session", MARGIN, cursor);
  cursor += 12;

  autoTable(doc, {
    startY: cursor,
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 0, right: 8 } },
    columnStyles: {
      0: { textColor: [MUTED.r, MUTED.g, MUTED.b], cellWidth: 120 },
      1: { fontStyle: "bold", cellWidth: 150 },
      2: { textColor: [MUTED.r, MUTED.g, MUTED.b], cellWidth: 110 },
      3: { fontStyle: "bold" },
    },
    body: [
      ["VIN", input.vin || "Not set", "Technician", input.technician],
      [
        "Vehicle",
        vehicle.name,
        "Scan completed",
        input.completedAt ? formatDateTime(input.completedAt) : "Not completed",
      ],
      [
        "Bus / protocol",
        vehicle.bus,
        "Job reference",
        input.jobId ?? "Not linked",
      ],
    ],
    margin: { left: MARGIN, right: MARGIN },
  });

  // --- Summary tiles ---------------------------------------------------------
  cursor = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  const tiles: Array<[string, string]> = [
    ["ECUs scanned", `${scannedCount} / ${vehicle.ecuCount}`],
    ["Stored DTCs", `${input.dtcs.length}`],
    ["Critical (sev 3)", `${critical.length}`],
    ["ECUs with faults", `${faulted.length}`],
  ];
  const tileWidth = (pageWidth - MARGIN * 2 - 12 * 3) / 4;
  tiles.forEach(([label, value], index) => {
    const x = MARGIN + index * (tileWidth + 12);
    doc.setFillColor(245, 245, 247);
    doc.roundedRect(x, cursor, tileWidth, 58, 8, 8, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(label.toUpperCase(), x + 12, cursor + 20);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text(value, x + 12, cursor + 44);
  });
  cursor += 84;

  // --- Technician notes ------------------------------------------------------
  const notes = input.notes.trim();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("Technician notes", MARGIN, cursor);
  cursor += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (notes) {
    const lines = doc.splitTextToSize(notes, pageWidth - MARGIN * 2 - 24);
    const boxHeight = lines.length * 13 + 24;
    doc.setFillColor(245, 245, 247);
    doc.roundedRect(MARGIN, cursor - 12, pageWidth - MARGIN * 2, boxHeight, 8, 8, "F");
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text(lines, MARGIN + 12, cursor + 4);
    cursor += boxHeight + 14;
  } else {
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("No notes recorded for this scan.", MARGIN, cursor);
    cursor += 22;
  }

  // --- DTC summary -----------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text(`Diagnostic trouble codes (${input.dtcs.length})`, MARGIN, cursor);

  const sorted = [...input.dtcs].sort(
    (a, b) => b.severity - a.severity || a.ecuId.localeCompare(b.ecuId) || a.code.localeCompare(b.code),
  );

  autoTable(doc, {
    startY: cursor + 12,
    head: [["Code", "ECU", "Description", "Severity", "Status", "Count"]],
    body:
      sorted.length > 0
        ? sorted.map((record) => [
            record.code,
            record.ecuId,
            record.name,
            `${record.severity} · ${severityLabel(record.severity)}`,
            statusFlags(record),
            `${record.occurrences}`,
          ])
        : [["—", "—", "No stored fault codes found during this scan", "—", "—", "0"]],
    styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak", textColor: [INK.r, INK.g, INK.b] },
    headStyles: { fillColor: [INK.r, INK.g, INK.b], textColor: 255, fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 60, font: "courier", fontStyle: "bold" },
      1: { cellWidth: 66 },
      2: { cellWidth: 156 },
      3: { cellWidth: 62 },
      4: { cellWidth: 115 },
      5: { cellWidth: 40, halign: "right" },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const label = String(data.cell.raw).split("·")[1]?.trim();
        if (label === "High") data.cell.styles.textColor = [200, 40, 35];
        else if (label === "Medium") data.cell.styles.textColor = [170, 110, 0];
      }
    },
  });

  // --- Per-ECU results -------------------------------------------------------
  let ecuStart = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  if (ecuStart > doc.internal.pageSize.getHeight() - 170) {
    doc.addPage();
    ecuStart = MARGIN + 24;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text(`Control units scanned (${entries.length})`, MARGIN, ecuStart);

  autoTable(doc, {
    startY: ecuStart + 12,
    head: [["ECU", "Control unit", "Result", "DTCs", "Scanned at"]],
    body: entries.map(([ecuId, state]) => [
      ecuId,
      getEcu(ecuId)?.fullName ?? ecuId,
      STATUS_TEXT[state.status],
      `${state.dtcCount}`,
      state.scannedAt ? formatDateTime(state.scannedAt) : "—",
    ]),
    styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak", textColor: [INK.r, INK.g, INK.b] },
    headStyles: { fillColor: [INK.r, INK.g, INK.b], textColor: 255, fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 68, fontStyle: "bold" },
      1: { cellWidth: 193 },
      2: { cellWidth: 86 },
      3: { cellWidth: 40, halign: "right" },
      4: { cellWidth: 112 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // --- Footers ---------------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 226, 231);
    doc.line(MARGIN, pageHeight - 42, pageWidth - MARGIN, pageHeight - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      `${input.vin || "VIN not set"} · ${input.technician} · ${noResponse.length} ECU${noResponse.length === 1 ? "" : "s"} without response`,
      MARGIN,
      pageHeight - 26,
    );
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 26, {
      align: "right",
    });
  }

  return doc;
}

export const scanReportFileName = (vin: string): string =>
  `rox-health-scan-${vin || "no-vin"}-${new Date().toISOString().slice(0, 10)}.pdf`;

/** Triggers a browser download of the generated report. */
export function downloadScanReport(input: ScanReportInput): void {
  const doc = buildScanReportDocument(input);
  doc.save(scanReportFileName(input.vin));
}
