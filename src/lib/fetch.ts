import { withRetry } from "./retry.js";
import { BROWSER_HEADERS } from "../types.js";

/** Fetch JSON with retry and browser headers. */
export async function fetchJson<T = Record<string, unknown>>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: headers ? { ...BROWSER_HEADERS, ...headers } : BROWSER_HEADERS,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
    }
    return res.json() as Promise<T>;
  });
}

/** Fetch text with retry and browser headers. */
export async function fetchText(
  url: string,
  headers?: Record<string, string>
): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: headers ? { ...BROWSER_HEADERS, ...headers } : BROWSER_HEADERS,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
    }
    return res.text();
  });
}
