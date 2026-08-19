import { fetchJson } from "../lib/fetch.js";
import { CacheTTL, getOrFetch } from "../lib/cache.js";
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

const CNN_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.cnn.com/markets/fear-and-greed",
  Origin: "https://www.cnn.com",
} satisfies Record<string, string>;

export type CnnFearGreed = z.infer<typeof cnnResponseSchema>;

/**
 * CNN wraps each indicator in an object carrying a bulky `data` time series
 * that callers never read. Decoding strips that series; values that are not
 * indicator objects fail to decode and are left untouched.
 */
const cnnIndicatorSchema = z
  .object({ data: z.unknown().optional() })
  .passthrough()
  .transform(({ data: _series, ...indicator }) => indicator);

export async function fetchCnnFearGreed(): Promise<CnnFearGreed> {
  return getOrFetch<CnnFearGreed>(
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
      const raw = parsed.data;
      delete raw["fear_and_greed_historical"];
      for (const [key, value] of Object.entries(raw)) {
        const stripped = cnnIndicatorSchema.safeParse(value);
        if (stripped.success) {
          raw[key] = stripped.data;
        }
      }
      return raw;
    },
    CacheTTL.FEAR_GREED
  );
}

export interface CryptoFearGreed {
  value: string;
  classification: string;
  timestamp: string;
}

export async function fetchCryptoFearGreed(): Promise<CryptoFearGreed> {
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
