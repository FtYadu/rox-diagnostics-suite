import { describe, expect, it } from "vitest";
import { escapeCsvCell, liveDataCsv, toCsv } from "@/lib/csv";

describe("escapeCsvCell", () => {
  it("quotes cells containing commas, quotes or newlines", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("writes CRLF rows with a header", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\r\n1,2\r\n");
  });
});

describe("liveDataCsv", () => {
  it("emits one column per signal and blanks missing samples", () => {
    const csv = liveDataCsv(
      ["Battery voltage", "Vehicle speed"],
      [
        { at: "2026-09-03T10:00:00.000Z", values: { "Battery voltage": 13.8, "Vehicle speed": 0 } },
        { at: "2026-09-03T10:00:00.200Z", values: { "Battery voltage": 13.7 } },
      ],
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("timestamp,Battery voltage,Vehicle speed");
    expect(lines[1]).toBe("2026-09-03T10:00:00.000Z,13.8,0");
    expect(lines[2]).toBe("2026-09-03T10:00:00.200Z,13.7,");
  });
});
