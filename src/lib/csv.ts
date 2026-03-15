import Papa from "papaparse";

/**
 * Convert array of objects to clean CSV string.
 * Removes columns that are entirely empty/null/undefined.
 * Zero is treated as a real value and kept.
 */
export function toCleanCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const allKeys = [...new Set(rows.flatMap(Object.keys))];

  // Keep a column if any row has a value that isn't null, undefined, or ""
  const keysToKeep = allKeys.filter((key) =>
    rows.some((row) => {
      const v = row[key];
      return v !== null && v !== undefined && v !== "";
    })
  );

  const cleaned = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const key of keysToKeep) {
      obj[key] = row[key] ?? "";
    }
    return obj;
  });

  return Papa.unparse(cleaned);
}
