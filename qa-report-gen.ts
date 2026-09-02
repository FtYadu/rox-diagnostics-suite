import { buildScanReportDocument } from "@/features/reports/scan-report";
import { ecus } from "@/data/vehicle-data";
import type { DtcRecord } from "@/features/bridge/types";

const scan: Record<string, any> = {};
ecus.forEach((e, i) => {
  scan[e.id] = {
    status: i % 7 === 0 ? "faults" : i % 11 === 0 ? "no-response" : "ok",
    dtcCount: i % 7 === 0 ? 2 : 0,
    scannedAt: new Date().toISOString(),
  };
});
const dtcs: DtcRecord[] = [];
ecus.forEach((e, i) => {
  if (i % 7 !== 0) return;
  const list = (e as any).dtcs?.slice(0, 2) ?? [];
  for (const d of list) {
    dtcs.push({
      ...d,
      ecuId: e.id,
      status: { current: true, pending: false, confirmed: true, testFailedThisCycle: i % 2 === 0 },
      statusByte: "0x2F",
      occurrences: 3 + i,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
  }
});
const doc = buildScanReportDocument({
  vin: "HJ4ABBHK4RN000123",
  technician: "Yadu Kumar",
  scan,
  dtcs,
  notes:
    "Customer reported intermittent warning lamp on cold start. Battery measured 12.1 V before test, 14.3 V charging. Cleared historic network codes after reseating the rear body connector; road tested 12 km with no recurrence. Recommend replacing the corroded chassis ground strap at next service.",
  completedAt: new Date().toISOString(),
  jobId: "JOB-2091",
  bridgeMode: "simulator",
});
const buf = Buffer.from(doc.output("arraybuffer"));
await Bun.write("/tmp/pdfqa/report.pdf", buf);
console.log("pages", doc.getNumberOfPages(), "dtcs", dtcs.length);
