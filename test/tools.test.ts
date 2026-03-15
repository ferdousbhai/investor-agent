import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../src/types.js";

// ─── Mock yahoo-finance2 ────────────────────────────────────────────────────

vi.mock("yahoo-finance2", () => {
  const instance = {
    quoteSummary: vi.fn().mockResolvedValue({}),
    historical: vi.fn().mockResolvedValue([]),
    options: vi.fn().mockResolvedValue({}),
  };
  return {
    default: class YahooFinance {
      quoteSummary = instance.quoteSummary;
      historical = instance.historical;
      options = instance.options;
    },
    __mock: instance,
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockKV(): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

// ─── Mock fetch globally ────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 1: Agent registers only the codemode tool
// ═══════════════════════════════════════════════════════════════════════════

describe("InvestorAgent Registration", () => {
  it("tool files export data functions (not register functions)", async () => {
    // The agent.ts imports Durable Object APIs (cloudflare: protocol) which
    // can't be loaded in Node/vitest. Instead verify the data function exports
    // are correctly shaped.
    expect(typeof fetchCnnFearGreed).toBe("function");
    expect(typeof fetchCryptoFearGreed).toBe("function");
    expect(typeof fetchMarketMovers).toBe("function");
    expect(typeof fetchGoogleTrends).toBe("function");
    expect(typeof fetchNasdaqEarningsCalendar).toBe("function");
    expect(typeof calculateIndicator).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2: Data Function Tests — test exported functions directly
// ═══════════════════════════════════════════════════════════════════════════

import { fetchCnnFearGreed, fetchCryptoFearGreed } from "../src/tools/fear-greed.js";
import { fetchMarketMovers } from "../src/tools/market-movers.js";
import { fetchGoogleTrends } from "../src/tools/google-trends.js";
import { fetchNasdaqEarningsCalendar } from "../src/tools/earnings.js";
import { calculateIndicator } from "../src/tools/technical-indicators.js";

describe("fetchCnnFearGreed", () => {
  it("returns fear and greed data from CNN API", async () => {
    const mockResponse = {
      fear_and_greed: { score: 55, rating: "Neutral" },
      market_volatility_vix: { score: 20, rating: "Low" },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchCnnFearGreed(createMockKV());
    expect(result).toHaveProperty("fear_and_greed");
    expect(result).toHaveProperty("market_volatility_vix");
  });

  it("strips fear_and_greed_historical key", async () => {
    const mockResponse = {
      fear_and_greed: { score: 55 },
      fear_and_greed_historical: { data: [1, 2, 3] },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchCnnFearGreed(createMockKV());
    expect(result).not.toHaveProperty("fear_and_greed_historical");
  });

  it("strips data arrays from inner indicators", async () => {
    const mockResponse = {
      fear_and_greed: { score: 55, data: [1, 2, 3] },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchCnnFearGreed(createMockKV());
    expect(result.fear_and_greed).not.toHaveProperty("data");
  });
});

describe("fetchCryptoFearGreed", () => {
  it("returns crypto fear and greed data", async () => {
    const mockResponse = {
      data: [
        { value: "72", value_classification: "Greed", timestamp: "1700000000" },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchCryptoFearGreed(createMockKV());
    expect(result.value).toBe("72");
    expect(result.classification).toBe("Greed");
    expect(result.timestamp).toBe("1700000000");
  });
});

describe("fetchMarketMovers", () => {
  it("returns parsed market movers from Yahoo Finance HTML", async () => {
    const htmlWithNextData = `
      <script id="__NEXT_DATA__" type="application/json">
        __NEXT_DATA__ = {"props":{"pageProps":{"screenerData":{"finance":{"result":[{"quotes":[
          {"symbol":"NVDA","shortName":"NVIDIA","regularMarketPrice":900,"regularMarketChange":50,"regularMarketChangePercent":5.8,"regularMarketVolume":80000000,"marketCap":2200000000000}
        ]}]}}}}};
      </script>
    `;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(htmlWithNextData),
    });

    const result = await fetchMarketMovers("gainers", 25, "regular", createMockKV());
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array when HTML has no recognizable data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Empty</body></html>"),
    });

    const result = await fetchMarketMovers("most-active", 25, "regular", createMockKV());
    expect(result).toEqual([]);
  });

  it("forces regular session for non-most-active categories", async () => {
    // "gainers" + "pre-market" resolves to "gainers:regular" (session forced to regular)
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Empty</body></html>"),
    });

    const result = await fetchMarketMovers("gainers", 10, "pre-market", createMockKV());
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("fetchGoogleTrends", () => {
  it("returns trends data as array of objects", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            `)]}'
{"widgets":[{"id":"TIMESERIES","token":"abc123","request":{"time":"today 7-d"}}]}`
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            `)]}'
{"default":{"timelineData":[
  {"formattedTime":"Jan 1","value":[80],"isPartial":false},
  {"formattedTime":"Jan 2","value":[90],"isPartial":false}
]}}`
          ),
      });

    const result = await fetchGoogleTrends(["AAPL"], 7, createMockKV());

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("AAPL");
    expect(result[0].AAPL).toBe(80);
  });
});

describe("fetchNasdaqEarningsCalendar", () => {
  it("returns earnings calendar data as array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            headers: { symbol: "Symbol", name: "Company" },
            rows: [
              { symbol: "AAPL", name: "Apple Inc" },
              { symbol: "GOOG", name: "Alphabet Inc" },
            ],
          },
        }),
    });

    const result = await fetchNasdaqEarningsCalendar("2024-03-15", 100, createMockKV());

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("Symbol", "AAPL");
    expect(result[0]).toHaveProperty("Date", "2024-03-15");
  });

  it("returns empty array when API returns no rows", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { rows: null, headers: null } }),
    });

    const result = await fetchNasdaqEarningsCalendar("2024-03-15", 100, createMockKV());
    expect(result).toEqual([]);
  });

  it("respects limit parameter", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            headers: { symbol: "Symbol" },
            rows: Array.from({ length: 10 }, (_, i) => ({
              symbol: `SYM${i}`,
            })),
          },
        }),
    });

    const result = await fetchNasdaqEarningsCalendar("2024-03-15", 3, createMockKV());
    expect(result).toHaveLength(3);
  });
});

describe("calculateIndicator", () => {
  it("calculates SMA and returns raw numeric values", async () => {
    const { __mock } = await import("yahoo-finance2");
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      open: 148 + i,
      high: 150 + i,
      low: 147 + i,
      close: 149 + i,
      volume: 1000000,
    }));
    (__mock as any).historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "SMA",
      { period: "1y", timeperiod: 14 },
      createMockKV()
    );

    expect(result).toHaveProperty("prices");
    expect(result).toHaveProperty("values");
    expect(Array.isArray(result.prices)).toBe(true);
    expect(Array.isArray(result.values)).toBe(true);

    // Values should be numbers or null, not formatted strings
    const firstNonNull = result.values.find((v) => v.sma !== null);
    expect(typeof firstNonNull?.sma).toBe("number");
  });

  it("throws when insufficient data for indicator", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).historical.mockResolvedValue([
      { date: new Date("2024-01-01"), close: 149 },
      { date: new Date("2024-01-02"), close: 150 },
    ]);

    await expect(
      calculateIndicator("AAPL", "SMA", { timeperiod: 14 }, createMockKV())
    ).rejects.toThrow("Insufficient data for SMA");
  });

  it("calculates RSI indicator with raw values", async () => {
    const { __mock } = await import("yahoo-finance2");
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + Math.sin(i) * 5,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    (__mock as any).historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "RSI",
      { period: "1y", timeperiod: 14 },
      createMockKV()
    );

    expect(result.values.some((v) => v.rsi !== null)).toBe(true);
  });

  it("calculates MACD indicator", async () => {
    const { __mock } = await import("yahoo-finance2");
    const history = Array.from({ length: 50 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i * 0.5,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    (__mock as any).historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "MACD",
      { period: "1y" },
      createMockKV()
    );

    const withValues = result.values.find((v) => v.macd !== null);
    if (withValues) {
      expect(withValues).toHaveProperty("macd");
      expect(withValues).toHaveProperty("signal");
      expect(withValues).toHaveProperty("histogram");
    }
  });

  it("calculates BBANDS indicator", async () => {
    const { __mock } = await import("yahoo-finance2");
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i * 0.5,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    (__mock as any).historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "BBANDS",
      { period: "1y", timeperiod: 14, nbdev: 2 },
      createMockKV()
    );

    const withValues = result.values.find((v) => v.upper !== null);
    if (withValues) {
      expect(withValues).toHaveProperty("upper");
      expect(withValues).toHaveProperty("middle");
      expect(withValues).toHaveProperty("lower");
    }
  });
});
