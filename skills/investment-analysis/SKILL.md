---
description: Triggers on stock/market analysis, investment research, earnings, valuations, sentiment queries.
---

# Investment Analysis

The **investor-agent** MCP server provides financial data tools. Tools are self-documenting - check their signatures.

## Guidelines

- Validate ticker exists before multiple API calls
- Fear/Greed indices: <25 extreme fear, >75 extreme greed
- Present analysis with context, not raw data dumps
- Highlight both opportunities and risks
- Financial data may be delayed - note data freshness when relevant
