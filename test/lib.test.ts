import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── validation.ts ──────────────────────────────────────────────────────────

import {
  validateTicker,
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

    promise.catch(() => {});

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
  it("returns fetcher result on cache miss", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ticker: "AAPL", price: 150 });
    // Use unique key to avoid hitting cache from other tests
    const result = await getOrFetch(`test-miss-${Date.now()}`, fetcher, 300);
    expect(result).toEqual({ ticker: "AAPL", price: 150 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on cache hit", async () => {
    const key = `test-hit-${Date.now()}`;
    const fetcher1 = vi.fn().mockResolvedValue("first");
    const fetcher2 = vi.fn().mockResolvedValue("second");

    await getOrFetch(key, fetcher1, 300);
    const result = await getOrFetch(key, fetcher2, 300);

    expect(result).toBe("first");
    expect(fetcher2).not.toHaveBeenCalled();
  });
});

