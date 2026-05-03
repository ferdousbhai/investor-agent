import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearCache } from "../src/lib/cache.js";

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

// ─── Mock fetch globally ────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  clearCache();

  // Reset yahoo-finance2 mocks to prevent call history leaking between tests
  const { __mock } = await import("yahoo-finance2");
  (__mock as any).quoteSummary.mockReset();
  (__mock as any).historical.mockReset();
  (__mock as any).options.mockReset();
  (__mock as any).screener.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 0: fetchJson
// ═══════════════════════════════════════════════════════════════════════════

const { fetchJson } = await import("../src/lib/fetch.js");

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
    expect((__mock as any).historical).toHaveBeenCalledWith(
      "AAPL",
      expect.not.objectContaining({ period2: undefined })
    );
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
// PART 1: Tool exports are correct
// ═══════════════════════════════════════════════════════════════════════════

import { fetchCnnFearGreed, fetchCryptoFearGreed } from "../src/tools/fear-greed.js";
import { fetchMarketMovers } from "../src/tools/market-movers.js";
import { fetchNasdaqEarningsCalendar } from "../src/tools/earnings.js";
import { calculateIndicator } from "../src/tools/technical-indicators.js";

describe("Tool exports", () => {
  it("tool files export data functions", async () => {
    expect(typeof fetchCnnFearGreed).toBe("function");
    expect(typeof fetchCryptoFearGreed).toBe("function");
    expect(typeof fetchMarketMovers).toBe("function");
    expect(typeof fetchNasdaqEarningsCalendar).toBe("function");
    expect(typeof calculateIndicator).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2: Data Function Tests
// ═══════════════════════════════════════════════════════════════════════════

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

    const result = await fetchCnnFearGreed();
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

    const result = await fetchCnnFearGreed();
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

    const result = await fetchCnnFearGreed();
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

    const result = await fetchCryptoFearGreed();
    expect(result.value).toBe("72");
    expect(result.classification).toBe("Greed");
    expect(result.timestamp).toBe("1700000000");
  });
});

describe("fetchMarketMovers", () => {
  it("returns mapped market movers from screener API", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).screener.mockResolvedValue({
      quotes: [
        { symbol: "NVDA", shortName: "NVIDIA", regularMarketPrice: 900, regularMarketChange: 50, regularMarketChangePercent: 5.8, regularMarketVolume: 80000000, marketCap: 2200000000000 },
      ],
    });

    const result = await fetchMarketMovers("gainers", 25);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("Symbol", "NVDA");
  });

  it("throws on invalid category", async () => {
    await expect(
      fetchMarketMovers("invalid", 10)
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

    const result = await fetchNasdaqEarningsCalendar("2024-03-15", 100);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("symbol", "AAPL");
    expect(result[0]).toHaveProperty("date", "2024-03-15");
  });

  it("returns empty array when API returns no rows", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { rows: null, headers: null } }),
    });

    const result = await fetchNasdaqEarningsCalendar("2024-03-15", 100);
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

    const result = await fetchNasdaqEarningsCalendar("2024-03-15", 3);
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
      { period1: "2023-01-01", timeperiod: 14 }
    );

    expect(Array.isArray(result)).toBe(true);
    const firstNonNull = result.find((v) => v.sma !== null);
    expect(typeof firstNonNull?.sma).toBe("number");
    expect((__mock as any).historical).toHaveBeenCalledWith(
      "AAPL",
      expect.objectContaining({ period2: expect.any(String) })
    );
  });

  it("throws when insufficient data for indicator", async () => {
    const { __mock } = await import("yahoo-finance2");
    (__mock as any).historical.mockResolvedValue([
      { date: new Date("2024-01-01"), close: 149 },
      { date: new Date("2024-01-02"), close: 150 },
    ]);

    await expect(
      calculateIndicator("AAPL", "SMA", { period1: "2023-01-01", timeperiod: 14 })
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
      { period1: "2023-01-01", timeperiod: 14 }
    );

    expect(result.some((v) => v.rsi !== null)).toBe(true);
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
      { period1: "2023-01-01" }
    );

    const withValues = result.find((v) => v.macd !== null);
    expect(withValues).toBeDefined();
    expect(withValues).toHaveProperty("macd");
    expect(withValues).toHaveProperty("signal");
    expect(withValues).toHaveProperty("histogram");
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
      { period1: "2023-01-01", timeperiod: 14 }
    );

    expect(result.some((v) => v.ema !== null)).toBe(true);
    const firstNonNull = result.find((v) => v.ema !== null);
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
      { period1: "2023-01-01", timeperiod: 14, nbdev: 2 }
    );

    const withValues = result.find((v) => v.upper !== null);
    expect(withValues).toBeDefined();
    expect(withValues).toHaveProperty("upper");
    expect(withValues).toHaveProperty("middle");
    expect(withValues).toHaveProperty("lower");
  });

  it("throws on unsupported indicator type", async () => {
    const { __mock } = await import("yahoo-finance2");
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    (__mock as any).historical.mockResolvedValue(history);

    await expect(
      calculateIndicator("AAPL", "INVALID" as any, { period1: "2023-01-01" })
    ).rejects.toThrow("Unsupported indicator");
  });
});
