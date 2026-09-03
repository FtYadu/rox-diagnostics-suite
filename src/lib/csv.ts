/** RFC 4180 style escaping: quote when the cell contains a delimiter, quote or newline. */
export const escapeCsvCell = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string =>
  [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";

/** Live-data recording → CSV with one column per signal. */
export const liveDataCsv = (
  signalLabels: string[],
  samples: Array<{ at: string; values: Record<string, number | undefined> }>,
): string =>
  toCsv(
    ["timestamp", ...signalLabels],
    samples.map((sample) => [
      sample.at,
      ...signalLabels.map((label) => sample.values[label] ?? ""),
    ]),
  );

export const downloadTextFile = (filename: string, text: string, mime = "text/csv"): void => {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
