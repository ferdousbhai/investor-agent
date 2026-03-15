import { getOrFetch } from "../lib/cache.js";
import { fetchText } from "../lib/fetch.js";
import { CacheTTL } from "../types.js";

/** Strip Google's XSSI protection prefix and parse JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGoogleJson(text: string): any {
  return JSON.parse(text.replace(/^\)\]\}',?\n?/, ""));
}

/** Map period_days to Google Trends API timeframe parameter. */
function getTimeframe(days: number): string {
  if (days <= 1) return "now 1-d";
  if (days <= 7) return "now 7-d";
  if (days <= 30) return "today 1-m";
  if (days <= 90) return "today 3-m";
  if (days <= 365) return "today 12-m";
  return "today 5-y";
}

/**
 * Fetch Google Trends interest over time using direct HTTP.
 * Replicates the pytrends flow: get cookies → get token → fetch data.
 */
async function fetchTrendsData(
  keywords: string[],
  timeframe: string
): Promise<Array<Record<string, unknown>>> {
  const comparisonItem = keywords.map((kw) => ({
    keyword: kw,
    geo: "",
    time: timeframe,
  }));
  const req = JSON.stringify({ comparisonItem, category: 0, property: "" });

  const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=360&req=${encodeURIComponent(req)}`;
  const exploreText = await fetchText(exploreUrl, { Accept: "application/json" });

  const exploreData = parseGoogleJson(exploreText);

  const widget = exploreData.widgets?.find(
    (w: Record<string, unknown>) => w.id === "TIMESERIES"
  );
  if (!widget) {
    throw new Error("Could not find TIMESERIES widget in Google Trends response");
  }

  const token = widget.token;
  const widgetReq = JSON.stringify(widget.request);

  const dataUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=360&req=${encodeURIComponent(widgetReq)}&token=${token}`;
  const dataText = await fetchText(dataUrl);

  const trendData = parseGoogleJson(dataText);

  const timelineData = trendData.default?.timelineData;
  if (!timelineData || timelineData.length === 0) {
    throw new Error("No data returned from Google Trends");
  }

  return timelineData
    .filter((point: Record<string, unknown>) => !point.isPartial)
    .map((point: Record<string, unknown>) => {
      const row: Record<string, unknown> = {
        date: point.formattedTime,
      };
      const values = point.value as number[];
      for (let i = 0; i < keywords.length; i++) {
        row[keywords[i]] = values[i] ?? 0;
      }
      return row;
    });
}

/** Fetch Google Trends interest over time for 1-5 keywords with caching. */
export async function fetchGoogleTrends(
  keywords: string[],
  periodDays: number,
  kv: KVNamespace
): Promise<Array<Record<string, unknown>>> {
  const timeframe = getTimeframe(periodDays);
  const cacheKey = `trends:${[...keywords].sort().join(",")}:${periodDays}`;

  return getOrFetch<Array<Record<string, unknown>>>(
    kv,
    cacheKey,
    async () => {
      try {
        return await fetchTrendsData(keywords, timeframe);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("429")) {
          throw new Error(
            `Google Trends rate limit exceeded. Google aggressively rate-limits server-side requests. ` +
            `Try again later, or check trends.google.com directly for: ${keywords.join(", ")}`
          );
        }
        throw err;
      }
    },
    CacheTTL.GOOGLE_TRENDS
  );
}
