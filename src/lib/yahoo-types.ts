/** Historical OHLCV price data row from yahoo-finance2. */
export interface HistoricalRow {
  date?: Date | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  [key: string]: unknown;
}
