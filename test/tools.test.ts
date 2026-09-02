import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearCache } from "../src/lib/cache.js";
import { resetYahooClient, setYahooClient } from "../src/lib/yahoo.js";

const yahoo = {
  quoteSummary: vi.fn(),
  historical: vi.fn(),
  options: vi.fn(),
  screener: vi.fn(),
};

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  clearCache();

  yahoo.quoteSummary.mockReset();
  yahoo.historical.mockReset();
  yahoo.options.mockReset();
  yahoo.screener.mockReset();
  setYahooClient(yahoo);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetYahooClient();
});

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

const { quoteSummary, getHistorical, getOptions } = await import("../src/lib/yahoo.js");

describe("quoteSummary", () => {
  it("returns quote summary data", async () => {
    yahoo.quoteSummary.mockResolvedValue({
      price: { regularMarketPrice: 150 },
    });

    const result = await quoteSummary("AAPL", ["price"]);
    expect(result).toHaveProperty("price");
    expect(result.price).toHaveProperty("regularMarketPrice", 150);
  });

  it("handles multiple modules", async () => {
    yahoo.quoteSummary.mockResolvedValue({
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
    const mockData = [
      { date: new Date("2024-01-01"), open: 148, high: 150, low: 147, close: 149, volume: 1000000 },
      { date: new Date("2024-01-02"), open: 149, high: 151, low: 148, close: 150, volume: 1100000 },
    ];
    yahoo.historical.mockResolvedValue(mockData);

    const result = await getHistorical("AAPL", { period1: "2024-01-01" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("close", 149);
    expect(yahoo.historical).toHaveBeenCalledWith(
      "AAPL",
      expect.not.objectContaining({ period2: undefined })
    );
  });

  it("passes interval option", async () => {
    yahoo.historical.mockResolvedValue([]);

    await getHistorical("AAPL", {
      period1: "2024-01-01",
      period2: "2024-06-01",
      interval: "1wk",
    });
    expect(yahoo.historical).toHaveBeenCalledWith(
      "AAPL",
      expect.objectContaining({ interval: "1wk" })
    );
  });

  it("rejects malformed historical rows instead of caching partial OHLCV data", async () => {
    yahoo.historical.mockResolvedValue([
      { date: new Date("2024-01-01"), close: 149 },
    ]);

    await expect(
      getHistorical("AAPL", { period1: "2024-01-01" })
    ).rejects.toThrow("Yahoo historical response was malformed");
  });
});

describe("getOptions", () => {
  it("returns options chain data", async () => {
    yahoo.options.mockResolvedValue({
      expirationDates: ["2024-03-15", "2024-04-19"],
      options: [{ calls: [], puts: [] }],
    });

    const result = await getOptions("AAPL");
    expect(result).toHaveProperty("expirationDates");
    expect(result).toHaveProperty("options");
  });

  it("passes date option when provided", async () => {
    yahoo.options.mockResolvedValue({
      expirationDates: [],
      options: [{ calls: [{ strike: 150 }], puts: [{ strike: 140 }] }],
    });

    await getOptions("AAPL", { date: "2024-03-15" });
    expect(yahoo.options).toHaveBeenCalledWith("AAPL", { date: "2024-03-15" });
  });

  it("works without date option", async () => {
    yahoo.options.mockResolvedValue({ expirationDates: [] });

    await getOptions("AAPL");
    expect(yahoo.options).toHaveBeenCalledWith("AAPL", undefined);
  });
});

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

    const result = await fetchCnnFearGreed();
    expect(result).toHaveProperty("fear_and_greed");
    expect(result).toHaveProperty("market_volatility_vix");
  });

  it("strips fear_and_greed_historical key", async () => {
    const mockResponse = {
      fear_and_greed: { score: 55, rating: "Neutral" },
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
      fear_and_greed: { score: 55, rating: "Neutral", data: [1, 2, 3] },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchCnnFearGreed();
    expect(result.fear_and_greed).not.toHaveProperty("data");
  });

  it("rejects an incomplete CNN response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fear_and_greed: {} }),
    });

    await expect(fetchCnnFearGreed()).rejects.toThrow(
      "CNN fear and greed response was malformed"
    );
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

  it("rejects an incomplete crypto response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{}] }),
    });

    await expect(fetchCryptoFearGreed()).rejects.toThrow(
      "Crypto fear and greed response was malformed"
    );
  });
});

describe("fetchMarketMovers", () => {
  it("returns mapped market movers from screener API", async () => {
    yahoo.screener.mockResolvedValue({
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

  it("throws when Yahoo omits the quotes array", async () => {
    yahoo.screener.mockResolvedValue({});

    await expect(fetchMarketMovers("gainers", 10)).rejects.toThrow(
      "did not include a quotes array"
    );
  });

  it("rejects counts instead of silently clamping them", async () => {
    await expect(fetchMarketMovers("gainers", 0)).rejects.toThrow(
      "Count must be an integer"
    );
  });

  it("rejects malformed quotes instead of returning undefined fields", async () => {
    yahoo.screener.mockResolvedValue({ quotes: [{}] });

    await expect(fetchMarketMovers("gainers", 10)).rejects.toThrow(
      "Yahoo screener quote 0 was malformed"
    );
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

  it("throws when the API omits rows", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await expect(
      fetchNasdaqEarningsCalendar("2024-03-15", 100)
    ).rejects.toThrow("did not include a rows array");
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

  it("rejects invalid limits instead of changing slice semantics", async () => {
    await expect(fetchNasdaqEarningsCalendar("2024-03-15", 0)).rejects.toThrow(
      "Limit must be a positive integer"
    );
  });
});

describe("calculateIndicator", () => {
  it("calculates SMA and returns raw numeric values", async () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      open: 148 + i,
      high: 150 + i,
      low: 147 + i,
      close: 149 + i,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "SMA",
      { period1: "2023-01-01", timeperiod: 14 }
    );

    expect(Array.isArray(result)).toBe(true);
    const firstNonNull = result.find((v) => v.sma !== null);
    expect(firstNonNull?.sma).toEqual(expect.any(Number));
    expect(yahoo.historical).toHaveBeenCalledWith(
      "AAPL",
      expect.objectContaining({ period2: expect.any(String) })
    );
  });

  it("throws when insufficient data for indicator", async () => {
    yahoo.historical.mockResolvedValue([
      { date: new Date("2024-01-01"), open: 148, high: 150, low: 147, close: 149, volume: 1000 },
      { date: new Date("2024-01-02"), open: 149, high: 151, low: 148, close: 150, volume: 1100 },
    ]);

    await expect(
      calculateIndicator("AAPL", "SMA", { period1: "2023-01-01", timeperiod: 14 })
    ).rejects.toThrow("Insufficient data for SMA");
  });

  it("rejects missing close prices instead of treating them as zero", async () => {
    const history = Array.from({ length: 14 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      open: 148 + i,
      high: 150 + i,
      low: 147 + i,
      close: i === 7 ? undefined : 149 + i,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

    await expect(
      calculateIndicator("AAPL", "SMA", { period1: "2023-01-01", timeperiod: 14 })
    ).rejects.toThrow("7.close: Required");
  });

  it("rejects missing dates instead of emitting an undefined date", async () => {
    const history = Array.from({ length: 14 }, (_, i) => ({
      date: i === 4 ? undefined : new Date(2024, 0, i + 1),
      open: 148 + i,
      high: 150 + i,
      low: 147 + i,
      close: 149 + i,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

    await expect(
      calculateIndicator("AAPL", "SMA", { period1: "2023-01-01", timeperiod: 14 })
    ).rejects.toThrow("4.date: Invalid input");
  });

  it("calculates RSI indicator with raw values", async () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + Math.sin(i) * 5,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "RSI",
      { period1: "2023-01-01", timeperiod: 14 }
    );

    expect(result.some((v) => v.rsi !== null)).toBe(true);
  });

  it("calculates MACD indicator", async () => {
    const history = Array.from({ length: 50 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i * 0.5,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

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
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i * 0.3,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

    const result = await calculateIndicator(
      "AAPL",
      "EMA",
      { period1: "2023-01-01", timeperiod: 14 }
    );

    expect(result.some((v) => v.ema !== null)).toBe(true);
    const firstNonNull = result.find((v) => v.ema !== null);
    expect(firstNonNull?.ema).toEqual(expect.any(Number));
  });

  it("calculates BBANDS indicator", async () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i * 0.5,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

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
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2024, 0, i + 1),
      close: 149 + i,
      open: 148,
      high: 155,
      low: 145,
      volume: 1000000,
    }));
    yahoo.historical.mockResolvedValue(history);

    // SAFETY: deliberately out-of-contract input — this test exists to prove the runtime
    // guard rejects indicators the IndicatorType union cannot express.
    await expect(
      calculateIndicator("AAPL", "INVALID" as any, { period1: "2023-01-01" })
    ).rejects.toThrow("Unsupported indicator");
  });

  it("rejects invalid result counts instead of applying negative slice semantics", async () => {
    await expect(
      calculateIndicator("AAPL", "SMA", { period1: "2023-01-01", numResults: -1 })
    ).rejects.toThrow("numResults must be a positive integer");
  });
});
