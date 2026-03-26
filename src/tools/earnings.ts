import { getOrFetch } from "../lib/cache.js";
import { fetchJson } from "../lib/fetch.js";
import { CacheTTL } from "../lib/cache.js";

const NASDAQ_HEADERS = { Referer: "https://www.nasdaq.com/" };

export async function fetchNasdaqEarningsCalendar(
  date: string | undefined,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  const dateStr = date ?? new Date().toISOString().slice(0, 10);

  return getOrFetch<Array<Record<string, unknown>>>(
    `earnings_cal:${dateStr}`,
    async () => {
      const raw = await fetchJson<{
        data?: { rows?: Array<Record<string, string>> };
      }>(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, NASDAQ_HEADERS);

      const rawRows = raw.data?.rows;
      if (!rawRows) return [];

      return rawRows.map((row) => ({
        date: dateStr,
        symbol: row.symbol,
        name: row.name,
        time: row.time,
        quarter: row.fiscalQuarterEnding,
        epsForecast: row.epsForecast,
        lastYearEPS: row.lastYearEPS,
      }));
    },
    CacheTTL.EARNINGS_CALENDAR
  ).then(rows => rows.slice(0, limit));
}
