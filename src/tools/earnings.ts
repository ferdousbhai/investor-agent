import { z } from "zod";
import { CacheTTL, getOrFetch } from "../lib/cache.js";
import { fetchJson } from "../lib/fetch.js";

const NASDAQ_HEADERS = { Referer: "https://www.nasdaq.com/" };

const symbolSchema = z.string().refine((symbol) => symbol.trim() !== "");

/** NASDAQ omits fields it has no value for, so everything but the symbol may be absent. */
export interface EarningsCalendarRow {
  date: string;
  symbol: string;
  name: string | undefined;
  time: string | undefined;
  quarter: string | undefined;
  epsForecast: string | undefined;
  lastYearEPS: string | undefined;
}

export async function fetchNasdaqEarningsCalendar(
  date: string | undefined,
  limit: number
): Promise<EarningsCalendarRow[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Limit must be a positive integer");
  }
  const dateStr = date ?? new Date().toISOString().slice(0, 10);

  return getOrFetch<EarningsCalendarRow[]>(
    `earnings_cal:${dateStr}`,
    async () => {
      const raw = await fetchJson<{
        data?: { rows?: Array<Record<string, string>> | null };
      }>(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, NASDAQ_HEADERS);

      const rawRows = raw.data?.rows;
      if (rawRows === null) return [];
      if (!Array.isArray(rawRows)) {
        throw new Error("NASDAQ earnings response did not include a rows array");
      }

      return rawRows.map((row, index) => {
        const symbol = symbolSchema.safeParse(row.symbol);
        if (!symbol.success) {
          throw new Error(`NASDAQ earnings row ${index} is missing a symbol`);
        }
        return {
          date: dateStr,
          symbol: symbol.data,
          name: row.name,
          time: row.time,
          quarter: row.fiscalQuarterEnding,
          epsForecast: row.epsForecast,
          lastYearEPS: row.lastYearEPS,
        };
      });
    },
    CacheTTL.EARNINGS_CALENDAR
  ).then(rows => rows.slice(0, limit));
}
