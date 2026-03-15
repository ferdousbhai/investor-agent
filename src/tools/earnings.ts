import { getOrFetch } from "../lib/cache.js";
import { fetchJson } from "../lib/fetch.js";
import { CacheTTL, NASDAQ_HEADERS } from "../types.js";

/** Fetch NASDAQ earnings calendar for a specific date. Returns raw row objects. */
export async function fetchNasdaqEarningsCalendar(
  date: string | undefined,
  limit: number,
  kv: KVNamespace
): Promise<Array<Record<string, unknown>>> {
  const dateStr = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `earnings_cal:${dateStr}`;

  const rows = await getOrFetch<Array<Record<string, unknown>>>(
    kv,
    cacheKey,
    async () => {
      const url = `https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`;
      const raw = await fetchJson<{
        data?: {
          rows?: Array<Record<string, string>>;
          headers?: Record<string, string>;
        };
      }>(url, NASDAQ_HEADERS);

      const rawRows = raw.data?.rows;
      const headers = raw.data?.headers;
      if (!rawRows || !headers) return [];

      return rawRows.map((row) => {
        const mapped: Record<string, unknown> = { Date: dateStr };
        for (const [key, label] of Object.entries(headers)) {
          mapped[label] = row[key] ?? "";
        }
        return mapped;
      });
    },
    CacheTTL.EARNINGS_CALENDAR
  );

  return rows.slice(0, limit);
}
