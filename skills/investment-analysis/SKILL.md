---
description: Use this skill when the user asks about stocks, market analysis, investment decisions, portfolio questions, or financial research. Triggers on queries about tickers, earnings, valuations, market sentiment, or trading.
---

# Investment Analysis Skill

You have access to the **investor-agent** MCP server which provides comprehensive financial analysis tools.

## Available Tools

### Market Overview
- `get_market_movers` - Top gainers, losers, and most active stocks
- `get_cnn_fear_greed_index` - Market sentiment indicator (0-100 scale)
- `get_crypto_fear_greed_index` - Crypto market sentiment
- `get_google_trends` - Search interest for market-related keywords

### Stock Research
- `get_ticker_data` - Comprehensive stock info (metrics, news, recommendations)
- `get_price_history` - Historical OHLCV data
- `get_options` - Options chain with filtering
- `get_financial_statements` - Income statement, balance sheet, cash flow
- `get_institutional_holders` - Major institutional and fund holders

### Earnings & Insider Activity
- `get_nasdaq_earnings_calendar` - Upcoming earnings announcements
- `get_earnings_history` - Historical EPS estimates vs actuals
- `get_insider_trades` - Recent insider buying/selling

### Technical Analysis (if TA-Lib installed)
- `calculate_technical_indicator` - SMA, EMA, RSI, MACD, Bollinger Bands

## Analysis Framework

When analyzing stocks or markets, follow this framework:

### 1. Fundamental Analysis
- **Valuation**: P/E, P/B, EV/EBITDA relative to sector
- **Growth**: Revenue and earnings growth rates
- **Profitability**: Margins, ROE, ROA
- **Financial Health**: Debt levels, cash position

### 2. Sentiment Analysis
- **Market Mood**: Fear & Greed Index level
- **Institutional Interest**: Who's buying/selling
- **Insider Activity**: Are executives buying their own stock?
- **Analyst Ratings**: Upgrades, downgrades, price targets

### 3. Technical Context
- **Price Action**: Recent trend, support/resistance
- **Volume**: Confirming or diverging from price
- **Momentum**: RSI, MACD signals if available

## Best Practices

1. **Always validate tickers** before making multiple API calls
2. **Use parallel fetching** when gathering multiple data points
3. **Present data clearly** with context, not just raw numbers
4. **Highlight risks** alongside opportunities
5. **Cite data freshness** - financial data can be delayed
6. **Avoid specific recommendations** - present analysis, let user decide

## Example Queries This Skill Handles

- "What's happening in the market today?"
- "Analyze NVDA for me"
- "Who's reporting earnings this week?"
- "Is the market fearful or greedy right now?"
- "What are the most active stocks?"
- "Show me AAPL's financials"
- "What are institutions buying?"
