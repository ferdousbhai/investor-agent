[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/ferdousbhai-investor-agent-badge.png)](https://mseep.ai/app/ferdousbhai-investor-agent)

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/ferdousbhai/investor-agent)](https://archestra.ai/mcp-catalog/ferdousbhai__investor-agent)

# investor-agent: A Financial Analysis MCP Server

## Overview

The **investor-agent** is a Model Context Protocol (MCP) server that provides comprehensive financial insights and analysis to Large Language Models. It leverages real-time market data, fundamental and technical analysis to deliver:

- **Ticker Analysis:** Company overview, news, metrics, analyst recommendations, and upgrades/downgrades
- **Options Data:** Filtered options chains with customizable parameters
- **Historical Data:** Price trends and earnings history
- **Financial Statements:** Income, balance sheet, and cash flow statements
- **Ownership Analysis:** Institutional holders and insider trading activity
- **Market Sentiment:** CNN Fear & Greed Index, Crypto Fear & Greed Index, and Google Trends sentiment analysis
- **Technical Analysis:** SMA, EMA, RSI, MACD, BBANDS indicators (optional)

The server integrates with [yfinance](https://pypi.org/project/yfinance/) for market data and automatically optimizes data volume for better performance.

## Prerequisites

- **Python:** 3.12 or higher
- **Package Manager:** [uv](https://docs.astral.sh/uv/). Install if needed:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

### Optional: TA-Lib C Library
Required for technical indicators. Follow [official installation instructions](https://ta-lib.org/install/).

## Installation

### Quick Start

```bash
# Core features only
uvx investor-agent

# With technical indicators (requires TA-Lib)
uvx "investor-agent[ta]"
```

## Tools

### Market Data
- **`get_ticker_data(ticker, max_news=5, max_recommendations=5, max_upgrades=5)`** - Comprehensive ticker report with smart field filtering to exclude irrelevant metadata and configurable limits for news, recommendations, and upgrades/downgrades
- **`get_options(ticker_symbol, num_options=10, start_date, end_date, strike_lower, strike_upper, option_type)`** - Options data with advanced filtering by date range (YYYY-MM-DD), strike price bounds, and option type (C=calls, P=puts)
- **`get_price_history(ticker, period="1mo")`** - Historical OHLCV data with intelligent interval selection: daily intervals for periods ≤1y, monthly intervals for periods ≥2y to optimize data volume
- **`get_financial_statements(ticker, statement_type="income", frequency="quarterly", max_periods=8)`** - Financial statements (income/balance/cash) with period limiting for context optimization
- **`get_institutional_holders(ticker, top_n=20)`** - Major institutional and mutual fund holders data
- **`get_earnings_history(ticker, max_entries=8)`** - Historical earnings data with configurable entry limits
- **`get_insider_trades(ticker, max_trades=20)`** - Recent insider trading activity with configurable trade limits

### Market Sentiment
- **`get_cnn_fear_greed_index(days=0, indicators=None)`** - CNN Fear & Greed Index with support for up to 30 days of historical data and selective indicator filtering. Available indicators: fear_and_greed, fear_and_greed_historical, put_call_options, market_volatility_vix, market_volatility_vix_50, junk_bond_demand, safe_haven_demand
- **`get_crypto_fear_greed_index(days=7)`** - Crypto Fear & Greed Index with configurable historical data period
- **`get_google_trends(keywords, period_days=7)`** - Google Trends relative search interest for market-related keywords. Requires a list of keywords to track (e.g., ["stock market crash", "bull market", "recession", "inflation"]). Returns relative search interest scores that can be used as sentiment indicators.

### Technical Analysis
- **`calculate_technical_indicator(ticker, indicator, period="1y", timeperiod=14, ...)`** - Calculate technical indicators (SMA, EMA, RSI, MACD, BBANDS) with configurable parameters and result limiting. Returns time-aligned data with price history and indicator values. Requires TA-Lib library.

## Usage with MCP Clients

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "investor": {
      "command": "uvx",
      "args": ["investor-agent"]
    }
  }
}
```

## Debugging

```bash
npx @modelcontextprotocol/inspector uvx investor-agent
```

**Log locations:**
- macOS: `~/Library/Logs/Claude/mcp*.log`
- Windows: `%APPDATA%\Claude\logs\mcp*.log`

## License

MIT License. See [LICENSE](LICENSE) file for details.
