import { fetchJson } from "../lib/fetch.js";
import { getOrFetch } from "../lib/cache.js";
import { CacheTTL } from "../lib/cache.js";
import { describeSchemaError } from "../lib/validation.js";
import { z } from "zod";

const cnnResponseSchema = z.object({
  fear_and_greed: z.object({
    score: z.number().finite(),
    rating: z.string().min(1),
  }).passthrough(),
}).passthrough();

const cryptoResponseSchema = z.object({
  data: z.array(z.object({
    value: z.string().regex(/^\d+(?:\.\d+)?$/),
    value_classification: z.string().min(1),
    timestamp: z.string().regex(/^\d+$/),
  }).passthrough()).min(1),
}).passthrough();

const CNN_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.cnn.com/markets/fear-and-greed",
  Origin: "https://www.cnn.com",
};

export async function fetchCnnFearGreed(): Promise<Record<string, unknown>> {
  return getOrFetch<Record<string, unknown>>(
    "fear_greed:cnn",
    async () => {
      const response = await fetchJson<unknown>(
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        CNN_HEADERS
      );
      const parsed = cnnResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error(`CNN fear and greed response was malformed: ${describeSchemaError(parsed.error)}`);
      }
      const raw: Record<string, unknown> = parsed.data;
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

export async function fetchCryptoFearGreed(): Promise<{
  value: string;
  classification: string;
  timestamp: string;
}> {
  return getOrFetch(
    "fear_greed:crypto",
    async () => {
      const response = await fetchJson<unknown>(
        "https://api.alternative.me/fng/"
      );
      const parsed = cryptoResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error(`Crypto fear and greed response was malformed: ${describeSchemaError(parsed.error)}`);
      }
      const entry = parsed.data.data[0];
      return {
        value: entry.value,
        classification: entry.value_classification,
        timestamp: entry.timestamp,
      };
    },
    CacheTTL.FEAR_GREED
  );
}
