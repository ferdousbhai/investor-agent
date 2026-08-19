import { withRetry } from "./retry.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
} satisfies Record<string, string>;

export async function fetchJson<T>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
    // SAFETY: raw JSON from an external HTTP endpoint. `T` is the caller's expectation only;
    // every call site validates the decoded payload before trusting it.
    return (await res.json()) as T;
  });
}
