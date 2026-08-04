export function validateTicker(ticker: string): string {
  const cleaned = ticker.toUpperCase().trim();
  if (!cleaned) throw new Error("Ticker symbol cannot be empty");
  return cleaned;
}
