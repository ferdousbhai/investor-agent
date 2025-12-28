---
description: Compare two or more stocks side by side
arguments:
  - name: tickers
    description: Comma-separated ticker symbols (e.g., AAPL,MSFT,GOOGL)
    required: true
---

# Stock Comparison: $1

Compare the specified stocks side by side.

## Gather Data

For each ticker in "$1" (split by comma):

1. **Get ticker data** - key metrics, valuation, and fundamentals
2. **Get price history** (3 months) - for performance comparison

## Comparison Analysis

Create a comparison table with:
- Current price and market cap
- Valuation metrics (P/E, P/B, EV/EBITDA)
- Growth metrics (revenue growth, earnings growth)
- Profitability (margins, ROE)
- Recent performance (1-month, 3-month returns)

## Synthesis

Summarize:
- Which stock appears most attractively valued
- Growth vs value trade-offs between them
- Key differentiators and competitive positions
- Risks specific to each
