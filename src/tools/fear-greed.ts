import { fetchJson } from "../lib/fetch.js";
import { getOrFetch } from "../lib/cache.js";
import { CacheTTL } from "../types.js";

/** Fetch CNN Fear & Greed Index with all indicators. Strips bulky historical arrays. */
export async function fetchCnnFearGreed(kv: KVNamespace): Promise<Record<string, unknown>> {
  return getOrFetch<Record<string, unknown>>(
    kv,
    "fear_greed:cnn",
    async () => {
      const raw = await fetchJson<Record<string, unknown>>(
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
      );
      // Strip bulky historical time-series to keep response focused
      delete raw["fear_and_greed_historical"];
      for (const value of Object.values(raw)) {
        if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
          delete (value as Record<string, unknown>)["data"];
        }
      }
      return raw;
    },
    CacheTTL.FEAR_GREED
  );
}

/** Fetch Crypto Fear & Greed Index from Alternative.me. */
export async function fetchCryptoFearGreed(kv: KVNamespace): Promise<{
  value: string;
  classification: string;
  timestamp: string;
}> {
  return getOrFetch(
    kv,
    "fear_greed:crypto",
    async () => {
      const raw = await fetchJson<{ data: Array<Record<string, string>> }>(
        "https://api.alternative.me/fng/"
      );
      const entry = raw.data[0];
      return {
        value: entry.value,
        classification: entry.value_classification,
        timestamp: entry.timestamp,
      };
    },
    CacheTTL.FEAR_GREED
  );
}
