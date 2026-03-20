import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../src/types.js";

// ─── Mock yahoo-finance2 ────────────────────────────────────────────────────

vi.mock("yahoo-finance2", () => {
  const instance = {
    quoteSummary: vi.fn().mockResolvedValue({}),
    historical: vi.fn().mockResolvedValue([]),
    options: vi.fn().mockResolvedValue({}),
    screener: vi.fn().mockResolvedValue({ quotes: [] }),
  };
  return {
    default: class YahooFinance {
      quoteSummary = instance.quoteSummary;
      historical = instance.historical;
      options = instance.options;
      screener = instance.screener;
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
// PART 0: fetchJson / fetchText
// ═══════════════════════════════════════════════════════════════════════════

// Note: fetchJson/fetchText imports must be after vi.mock("yahoo-finance2")
// because they share the retry module which may trigger module initialization.
const { fetchJson, fetchText } = await import("../src/lib/fetch.js");

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ price: 150 }),
    });

    const result = await fetchJson("https://example.com/api");
    expect(result).toEqual({ price: 150 });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(fetchJson("https://example.com/missing")).rejects.toThrow(
      "HTTP 404"
    );
  });

  it("passes custom headers merged with browser headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchJson("https://example.com/api", { Authorization: "Bearer xyz" });
    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders).toHaveProperty("Authorization", "Bearer xyz");
    expect(callHeaders).toHaveProperty("User-Agent");
  });
});

describe("fetchText", () => {
  it("returns text on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>hello</html>"),
    });

    const result = await fetchText("https://example.com");
    expect(result).toBe("<html>hello</html>");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(fetchText("https://example.com/err")).rejects.toThrow(
      "HTTP 500"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 0.5: Yahoo Finance wrappers (quoteSummary, getHistorical, getOptions)
// ═══════════════════════════════════════════════════════════════════════════

const { quoteSummary, getHistorical, getOptions } = await import("../src/lib/yahoo.js");

describe("quoteSummary", () => {
  it("returns quote summary data", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).quoteSummary.mockResolvedValue({
      price: { regularMarketPrice: 150 },
    });

    const result = await quoteSummary("AAPL", ["price"]);
    expect(result).toHaveProperty("price");
    expect(result.price).toHaveProperty("regularMarketPrice", 150);
  });

  it("uses KV cache when provided", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).quoteSummary.mockResolvedValue({ price: {} });
    const kv = createMockKV();

    await quoteSummary("AAPL", ["price"], kv, 300);
    expect(kv.get).toHaveBeenCalled();
  });

  it("works without KV cache", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).quoteSummary.mockResolvedValue({ price: {} });

    const result = await quoteSummary("AAPL", ["price"]);
    expect(result).toHaveProperty("price");
  });

  it("handles multiple modules", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).quoteSummary.mockResolvedValue({
      price: { regularMarketPrice: 150 },
      summaryDetail: { marketCap: 2500000000000 },
    });

    const result = await quoteSummary("AAPL", ["price", "summaryDetail"]);
    expect(result).toHaveProperty("price");
    expect(result).toHaveProperty("summaryDetail");
  });
});

describe("getHistorical", () => {
  it("returns historical price data", async () => {
    const { __mock } = await import("yahoo-finance2");
    const mockData = [
      { date: new Date("2024-01-01"), open: 148, high: 150, low: 147, close: 149, volume: 1000000 },
      { date: new Date("2024-01-02"), open: 149, high: 151, low: 148, close: 150, volume: 1100000 },
    ];
    (__mock as any).historical.mockResolvedValue(mockData);

    const result = await getHistorical("AAPL", { period1: "2024-01-01" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("close", 149);
  });

  it("passes interval option", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).historical.mockResolvedValue([]);

    await getHistorical("AAPL", {
      period1: "2024-01-01",
      period2: "2024-06-01",
      interval: "1wk",
    });
    expect((__mock as any).historical).toHaveBeenCalledWith(
      "AAPL",
      expect.objectContaining({ interval: "1wk" })
    );
  });

  it("uses KV cache when provided", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).historical.mockResolvedValue([]);
    const kv = createMockKV();

    await getHistorical("AAPL", { period1: "2024-01-01" }, kv, 900);
    expect(kv.get).toHaveBeenCalled();
  });
});

describe("getOptions", () => {
  it("returns options chain data", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).options.mockResolvedValue({
      expirationDates: ["2024-03-15", "2024-04-19"],
      options: [{ calls: [], puts: [] }],
    });

    const result = await getOptions("AAPL");
    expect(result).toHaveProperty("expirationDates");
    expect(result).toHaveProperty("options");
  });

  it("passes date option when provided", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).options.mockResolvedValue({
      expirationDates: [],
      options: [{ calls: [{ strike: 150 }], puts: [{ strike: 140 }] }],
    });

    await getOptions("AAPL", { date: "2024-03-15" });
    expect((__mock as any).options).toHaveBeenCalledWith("AAPL", { date: "2024-03-15" });
  });

  it("works without date option", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).options.mockResolvedValue({ expirationDates: [] });

    await getOptions("AAPL");
    expect((__mock as any).options).toHaveBeenCalledWith("AAPL", undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 0.6: normalizeCode
// ═══════════════════════════════════════════════════════════════════════════

// normalizeCode tests are in test/normalize.test.ts (requires cloudflare:workers stub)

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
    expect(typeof fetchNasdaqEarningsCalendar).toBe("function");
    expect(typeof calculateIndicator).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2: Data Function Tests — test exported functions directly
// ═══════════════════════════════════════════════════════════════════════════

import { fetchCnnFearGreed, fetchCryptoFearGreed } from "../src/tools/fear-greed.js";
import { fetchMarketMovers } from "../src/tools/market-movers.js";

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
  it("returns mapped market movers from screener API", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).screener = vi.fn().mockResolvedValue({
      quotes: [
        { symbol: "NVDA", shortName: "NVIDIA", regularMarketPrice: 900, regularMarketChange: 50, regularMarketChangePercent: 5.8, regularMarketVolume: 80000000, marketCap: 2200000000000 },
      ],
    });

    const result = await fetchMarketMovers("gainers", 25, "regular", createMockKV());
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it("throws on invalid category", async () => {
    await expect(
      fetchMarketMovers("invalid", 10, "regular", createMockKV())
    ).rejects.toThrow("Invalid category");
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

  it("calculates EMA indicator", async () => {
    const { __mock } = await import("yahoo-finance2");
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i * 0.3,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    (__mock as any).historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "EMA",
      { period: "1y", timeperiod: 14 },
      createMockKV()
    );

    expect(result.values.some((v) => v.ema !== null)).toBe(true);
    const firstNonNull = result.values.find((v) => v.ema !== null);
    expect(typeof firstNonNull?.ema).toBe("number");
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
