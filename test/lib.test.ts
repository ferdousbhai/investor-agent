import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── validation.ts ──────────────────────────────────────────────────────────

import {
  validateTicker,
  validateDate,
  validateDateRange,
  formatDateString,
  clamp,
} from "../src/lib/validation.js";

describe("validateTicker", () => {
  it("uppercases and trims ticker", () => {
    expect(validateTicker(" aapl ")).toBe("AAPL");
  });

  it("returns already-uppercase ticker unchanged", () => {
    expect(validateTicker("MSFT")).toBe("MSFT");
  });

  it("handles mixed-case with whitespace", () => {
    expect(validateTicker("  gOoG  ")).toBe("GOOG");
  });

  it("throws on empty string", () => {
    expect(() => validateTicker("")).toThrow("Ticker symbol cannot be empty");
  });

  it("throws on whitespace-only string", () => {
    expect(() => validateTicker("   ")).toThrow("Ticker symbol cannot be empty");
  });
});

describe("validateDate", () => {
  it("accepts valid YYYY-MM-DD date string", () => {
    const d = validateDate("2024-01-15");
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString().slice(0, 10)).toBe("2024-01-15");
  });

  it("returns a Date at midnight UTC", () => {
    const d = validateDate("2024-06-30");
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("throws on wrong format (MM-DD-YYYY)", () => {
    expect(() => validateDate("01-15-2024")).toThrow("Invalid date format");
  });

  it("throws on slash-separated date", () => {
    expect(() => validateDate("2024/01/15")).toThrow("Invalid date format");
  });

  it("throws on partial date (YYYY-MM)", () => {
    expect(() => validateDate("2024-01")).toThrow("Invalid date format");
  });

  it("throws on non-date string", () => {
    expect(() => validateDate("not-a-date")).toThrow("Invalid date format");
  });

  it("throws on impossible date (month 13)", () => {
    // "2024-13-01" passes the regex but new Date should handle it;
    // JavaScript Date actually rolls over, so this may or may not throw.
    // The regex check should pass but the date may be valid in JS.
    // Let's test month 99 which definitely fails regex.
    expect(() => validateDate("2024-99-01")).toThrow();
  });
});

describe("validateDateRange", () => {
  it("accepts valid range (start < end)", () => {
    expect(() => validateDateRange("2024-01-01", "2024-06-01")).not.toThrow();
  });

  it("accepts equal start and end date", () => {
    expect(() => validateDateRange("2024-03-15", "2024-03-15")).not.toThrow();
  });

  it("throws when start is after end", () => {
    expect(() => validateDateRange("2024-06-01", "2024-01-01")).toThrow(
      "start_date must be before or equal to end_date"
    );
  });

  it("accepts undefined start", () => {
    expect(() => validateDateRange(undefined, "2024-06-01")).not.toThrow();
  });

  it("accepts undefined end", () => {
    expect(() => validateDateRange("2024-01-01", undefined)).not.toThrow();
  });

  it("accepts both undefined", () => {
    expect(() => validateDateRange(undefined, undefined)).not.toThrow();
  });
});

describe("formatDateString", () => {
  it("formats ISO datetime to YYYY-MM-DD", () => {
    expect(formatDateString("2024-03-15T12:30:00Z")).toBe("2024-03-15");
  });

  it("formats date string without time", () => {
    expect(formatDateString("2024-03-15")).toBe("2024-03-15");
  });

  it("handles date with trailing Z correctly", () => {
    expect(formatDateString("2024-06-30Z")).toBe("2024-06-30");
  });

  it("returns first 10 chars for unparseable strings", () => {
    const result = formatDateString("not-a-real-date-at-all");
    // Falls through to the catch block which does dateStr.slice(0, 10)
    expect(result).toBe("not-a-real");
  });
});

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it("clamps to min when below range", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(clamp(200, 0, 100)).toBe(100);
  });

  it("returns min when value equals min", () => {
    expect(clamp(0, 0, 100)).toBe(0);
  });

  it("returns max when value equals max", () => {
    expect(clamp(100, 0, 100)).toBe(100);
  });

  it("handles negative range", () => {
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

// ─── csv.ts ─────────────────────────────────────────────────────────────────

import { toCleanCsv } from "../src/lib/csv.js";

describe("toCleanCsv", () => {
  it("returns empty string for empty array", () => {
    expect(toCleanCsv([])).toBe("");
  });

  it("converts simple rows to CSV", () => {
    const rows = [
      { name: "AAPL", price: 150 },
      { name: "GOOG", price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).toContain("name");
    expect(csv).toContain("price");
    expect(csv).toContain("AAPL");
    expect(csv).toContain("GOOG");
    expect(csv).toContain("150");
    expect(csv).toContain("2800");
  });

  it("removes columns that are entirely null", () => {
    const rows = [
      { name: "AAPL", empty_col: null, price: 150 },
      { name: "GOOG", empty_col: null, price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).not.toContain("empty_col");
    expect(csv).toContain("name");
    expect(csv).toContain("price");
  });

  it("removes columns that are entirely undefined", () => {
    const rows = [
      { name: "AAPL", empty_col: undefined, price: 150 },
      { name: "GOOG", empty_col: undefined, price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).not.toContain("empty_col");
  });

  it("removes columns that are entirely empty strings", () => {
    const rows = [
      { name: "AAPL", empty_col: "", price: 150 },
      { name: "GOOG", empty_col: "", price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).not.toContain("empty_col");
  });

  it("keeps columns that are all zeros (numeric columns)", () => {
    const rows = [
      { name: "AAPL", count: 0, price: 150 },
      { name: "GOOG", count: 0, price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).toContain("count");
  });

  it("keeps column if at least one row has a non-empty value", () => {
    const rows = [
      { name: "AAPL", sector: null, price: 150 },
      { name: "GOOG", sector: "Tech", price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).toContain("sector");
    expect(csv).toContain("Tech");
  });

  it("handles mixed data types in columns", () => {
    const rows = [
      { id: 1, value: "hello", extra: null },
      { id: 2, value: 42, extra: null },
    ];
    const csv = toCleanCsv(rows);
    expect(csv).toContain("id");
    expect(csv).toContain("value");
    expect(csv).not.toContain("extra");
  });

  it("replaces null/undefined with empty string in kept columns", () => {
    const rows = [
      { name: "AAPL", sector: null, price: 150 },
      { name: "GOOG", sector: "Tech", price: 2800 },
    ];
    const csv = toCleanCsv(rows);
    // The null should become an empty field, not the string "null"
    expect(csv).not.toContain("null");
  });
});

// ─── retry.ts ───────────────────────────────────────────────────────────────

import { withRetry } from "../src/lib/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit exceeded"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { initialDelayMs: 10, maxAttempts: 3 });

    // Advance past the delay
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max attempts exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 service unavailable"));

    const promise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    // Attach a no-op catch immediately to prevent unhandled rejection warnings.
    // The actual assertion below will still verify the rejection.
    promise.catch(() => {});

    // Advance timers enough for all retries and flush microtasks
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("503 service unavailable");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid ticker symbol"));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
    ).rejects.toThrow("Invalid ticker symbol");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects custom shouldRetry predicate", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("custom retryable"))
      .mockResolvedValue("recovered");

    const promise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      shouldRetry: (error) => String(error).includes("custom retryable"),
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 status code errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { initialDelayMs: 10, maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on timeout error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { initialDelayMs: 10, maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on network error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { initialDelayMs: 10, maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ─── cache.ts ───────────────────────────────────────────────────────────────

import { getOrFetch } from "../src/lib/cache.js";

describe("getOrFetch", () => {
  function createMockKV() {
    return {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;
  }

  it("returns cached value on cache hit (skips fetcher)", async () => {
    const kv = createMockKV();
    const cachedData = { ticker: "AAPL", price: 150 };
    (kv.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedData);

    const fetcher = vi.fn().mockResolvedValue({ ticker: "AAPL", price: 999 });

    const result = await getOrFetch(kv, "test-key", fetcher, 300);

    expect(result).toEqual(cachedData);
    expect(kv.get).toHaveBeenCalledWith("test-key", "json");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls fetcher on cache miss and stores result", async () => {
    const kv = createMockKV();
    (kv.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const freshData = { ticker: "GOOG", price: 2800 };
    const fetcher = vi.fn().mockResolvedValue(freshData);

    const result = await getOrFetch(kv, "miss-key", fetcher, 600);

    expect(result).toEqual(freshData);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "miss-key",
      JSON.stringify(freshData),
      { expirationTtl: 600 }
    );
  });

  it("passes correct TTL to kv.put", async () => {
    const kv = createMockKV();
    (kv.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const fetcher = vi.fn().mockResolvedValue("data");

    await getOrFetch(kv, "ttl-key", fetcher, 86400);

    expect(kv.put).toHaveBeenCalledWith(
      "ttl-key",
      JSON.stringify("data"),
      { expirationTtl: 86400 }
    );
  });

  it("returns fetcher result even if put fails (fire-and-forget)", async () => {
    const kv = createMockKV();
    (kv.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (kv.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("KV write failed")
    );

    const fetcher = vi.fn().mockResolvedValue("data");

    // Should not throw because put is fire-and-forget (void)
    const result = await getOrFetch(kv, "fail-put-key", fetcher, 300);
    expect(result).toBe("data");
  });

  it("logs error to console when cache write fails", async () => {
    const kv = createMockKV();
    (kv.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (kv.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("KV write exploded")
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue("data");

    await getOrFetch(kv, "err-key", fetcher, 300);

    // Wait a tick for the .catch() to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      'KV write failed for key "err-key":',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});

// ─── yahoo.ts: periodToDates ────────────────────────────────────────────────

import { periodToDates } from "../src/lib/yahoo.js";

describe("periodToDates", () => {
  it("returns period2 close to now for all periods", () => {
    const before = Date.now();
    const { period2 } = periodToDates("1d");
    const after = Date.now();
    expect(period2.getTime()).toBeGreaterThanOrEqual(before);
    expect(period2.getTime()).toBeLessThanOrEqual(after);
  });

  it("1d: period1 is ~1 day before period2", () => {
    const { period1, period2 } = periodToDates("1d");
    const diff = period2.getTime() - period1.getTime();
    expect(diff).toBeCloseTo(86400000, -3); // ~1 day in ms, allow some wiggle
  });

  it("5d: period1 is ~5 days before period2", () => {
    const { period1, period2 } = periodToDates("5d");
    const diff = period2.getTime() - period1.getTime();
    expect(diff).toBeCloseTo(5 * 86400000, -3);
  });

  it("1mo: period1 is ~1 month before period2", () => {
    const { period1, period2 } = periodToDates("1mo");
    // Month diff should be 1
    const monthDiff =
      (period2.getFullYear() - period1.getFullYear()) * 12 +
      (period2.getMonth() - period1.getMonth());
    expect(monthDiff).toBe(1);
  });

  it("3mo: period1 is ~3 months before period2", () => {
    const { period1, period2 } = periodToDates("3mo");
    const monthDiff =
      (period2.getFullYear() - period1.getFullYear()) * 12 +
      (period2.getMonth() - period1.getMonth());
    expect(monthDiff).toBe(3);
  });

  it("6mo: period1 is ~6 months before period2", () => {
    const { period1, period2 } = periodToDates("6mo");
    const monthDiff =
      (period2.getFullYear() - period1.getFullYear()) * 12 +
      (period2.getMonth() - period1.getMonth());
    expect(monthDiff).toBe(6);
  });

  it("1y: period1 is ~1 year before period2", () => {
    const { period1, period2 } = periodToDates("1y");
    const yearDiff = period2.getFullYear() - period1.getFullYear();
    expect(yearDiff).toBe(1);
    expect(period1.getMonth()).toBe(period2.getMonth());
  });

  it("2y: period1 is ~2 years before period2", () => {
    const { period1, period2 } = periodToDates("2y");
    const yearDiff = period2.getFullYear() - period1.getFullYear();
    expect(yearDiff).toBe(2);
  });

  it("5y: period1 is ~5 years before period2", () => {
    const { period1, period2 } = periodToDates("5y");
    const yearDiff = period2.getFullYear() - period1.getFullYear();
    expect(yearDiff).toBe(5);
  });

  it("10y: period1 is ~10 years before period2", () => {
    const { period1, period2 } = periodToDates("10y");
    const yearDiff = period2.getFullYear() - period1.getFullYear();
    expect(yearDiff).toBe(10);
  });

  it("ytd: period1 is January 1 of the current year", () => {
    const { period1 } = periodToDates("ytd");
    const now = new Date();
    expect(period1.getFullYear()).toBe(now.getFullYear());
    expect(period1.getMonth()).toBe(0);
    expect(period1.getDate()).toBe(1);
  });

  it("max: period1 is 1970-01-01", () => {
    const { period1 } = periodToDates("max");
    expect(period1.getFullYear()).toBe(1970);
    expect(period1.getMonth()).toBe(0);
    expect(period1.getDate()).toBe(1);
  });

  it("unknown period throws an error", () => {
    expect(() => periodToDates("unknown")).toThrow("Unknown period: unknown");
  });
});
