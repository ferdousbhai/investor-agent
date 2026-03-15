import { fetchText } from "../lib/fetch.js";
import { getOrFetch } from "../lib/cache.js";
import { clamp } from "../lib/validation.js";
import { CacheTTL } from "../types.js";

/** Yahoo Finance URL map for market movers */
const URL_MAP: Record<string, string> = {
  "most-active:regular": "https://finance.yahoo.com/most-active",
  "most-active:pre-market": "https://finance.yahoo.com/markets/stocks/pre-market",
  "most-active:after-hours": "https://finance.yahoo.com/markets/stocks/after-hours",
  "gainers:regular": "https://finance.yahoo.com/gainers",
  "losers:regular": "https://finance.yahoo.com/losers",
};

/**
 * Extract market movers data from Yahoo Finance HTML.
 * Tries __NEXT_DATA__ JSON first, falls back to table parsing.
 */
function parseYahooHtml(html: string): Array<Record<string, unknown>> {
  const nextDataMatch = /__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const quotes =
        nextData?.props?.pageProps?.screenerData?.finance?.result?.[0]?.quotes ??
        nextData?.props?.pageProps?.finance?.result?.[0]?.quotes;
      if (quotes && Array.isArray(quotes)) {
        return quotes.map((q: Record<string, unknown>) => ({
          Symbol: q.symbol,
          Name: q.shortName || q.longName,
          Price: q.regularMarketPrice,
          Change: q.regularMarketChange,
          "Change %": q.regularMarketChangePercent,
          Volume: q.regularMarketVolume,
          "Market Cap": q.marketCap,
        }));
      }
    } catch {
      // Fall through to table parsing
    }
  }

  // Fallback: basic regex table extraction
  const rows: Array<Record<string, unknown>> = [];
  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/.exec(html);
  if (!tableMatch) return rows;

  const headerMatch = /<thead>([\s\S]*?)<\/thead>/.exec(tableMatch[1]);
  const bodyMatch = /<tbody>([\s\S]*?)<\/tbody>/.exec(tableMatch[1]);
  if (!headerMatch || !bodyMatch) return rows;

  const headers: string[] = [];
  const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
  let thMatch;
  while ((thMatch = thRegex.exec(headerMatch[1])) !== null) {
    headers.push(thMatch[1].replace(/<[^>]*>/g, "").trim());
  }

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let trMatch;
  while ((trMatch = trRegex.exec(bodyMatch[1])) !== null) {
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]*>/g, "").trim());
    }
    if (cells.length > 0) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < Math.min(headers.length, cells.length); i++) {
        if (!headers[i].startsWith("Unnamed")) {
          row[headers[i]] = cells[i];
        }
      }
      rows.push(row);
    }
  }

  return rows;
}

/** Fetch top market movers (gainers, losers, most active) from Yahoo Finance. */
export async function fetchMarketMovers(
  category: string,
  count: number,
  session: string,
  kv: KVNamespace
): Promise<Array<Record<string, unknown>>> {
  const safeCount = clamp(count, 1, 100);
  const sessionKey = category === "most-active" ? session : "regular";
  const urlKey = `${category}:${sessionKey}`;
  const baseUrl = URL_MAP[urlKey];

  if (!baseUrl) {
    throw new Error(`Invalid category '${category}' or session '${session}'`);
  }

  const url = `${baseUrl}?count=${safeCount}&offset=0`;
  const cacheKey = `movers:${urlKey}:${safeCount}`;

  const rows = await getOrFetch<Array<Record<string, unknown>>>(
    kv,
    cacheKey,
    async () => {
      const html = await fetchText(url);
      return parseYahooHtml(html);
    },
    CacheTTL.MARKET_MOVERS
  );

  return rows.slice(0, safeCount);
}
