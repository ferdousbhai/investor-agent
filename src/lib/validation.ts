import type { ZodError } from "zod";

export function validateTicker(ticker: string): string {
  const cleaned = ticker.toUpperCase().trim();
  if (!cleaned) throw new Error("Ticker symbol cannot be empty");
  return cleaned;
}

export function describeSchemaError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
    .join("; ");
}
