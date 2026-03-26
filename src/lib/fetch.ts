import { withRetry } from "./retry.js";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export async function fetchJson<T = Record<string, unknown>>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: headers ? { ...BROWSER_HEADERS, ...headers } : BROWSER_HEADERS,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
    return res.json() as Promise<T>;
  });
}
