import type { ZodError } from "zod";

/**
 * Yahoo concatenates the symbol straight into its request path without escaping, so this
 * allowlist is the only boundary between a tool argument and the outbound URL. The set
 * covers every shape the upstream uses: ^GSPC, ES=F, BRK-B, BTC-USD, 7203.T.
 */
const TICKER_PATTERN = /^[A-Z0-9.^=-]{1,20}$/u;

export function validateTicker(ticker: string): string {
  const cleaned = ticker.toUpperCase().trim();
  if (!cleaned) throw new Error("Ticker symbol cannot be empty");
  if (!TICKER_PATTERN.test(cleaned)) throw new Error("Invalid ticker symbol");
  return cleaned;
}

export function describeSchemaError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
    .join("; ");
}
