/**
 * Input validation utilities.
 * Replaces validate_ticker, validate_date, validate_date_range from the Python version.
 */

export function validateTicker(ticker: string): string {
  const cleaned = ticker.toUpperCase().trim();
  if (!cleaned) throw new Error("Ticker symbol cannot be empty");
  return cleaned;
}

export function validateDate(dateStr: string): Date {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
  if (!match) throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD`);
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  return d;
}

export function validateDateRange(
  startStr: string | undefined,
  endStr: string | undefined
): void {
  const start = startStr ? validateDate(startStr) : undefined;
  const end = endStr ? validateDate(endStr) : undefined;
  if (start && end && start > end) {
    throw new Error("start_date must be before or equal to end_date");
  }
}

export function formatDateString(dateStr: string): string | null {
  try {
    const d = new Date(dateStr.replace("Z", ""));
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr?.slice(0, 10) ?? null;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
