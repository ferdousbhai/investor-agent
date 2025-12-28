---
description: Check market sentiment indicators (Fear & Greed, trends)
arguments:
  - name: keywords
    description: Optional comma-separated keywords to check Google Trends (e.g., "recession,inflation")
    required: false
---

# Market Sentiment Check

Analyze current market sentiment using multiple indicators.

## Gather Sentiment Data

1. **Get CNN Fear & Greed Index** - overall equity market sentiment

2. **Get Crypto Fear & Greed Index** - crypto market sentiment (often leads risk appetite)

3. **Get market movers** - top gainers and losers to see what's moving

4. If keywords provided ("$1"), also **check Google Trends** for those terms

## Analysis

Synthesize the data into a market sentiment summary:
- Current fear/greed level and what it suggests
- Key themes driving market moves today
- Risk appetite assessment (risk-on vs risk-off environment)
- Any divergences between indicators worth noting
