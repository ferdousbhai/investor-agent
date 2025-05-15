[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/ferdousbhai-investor-agent-badge.png)](https://mseep.ai/app/ferdousbhai-investor-agent)

# investor-agent: A Financial Analysis MCP Server

## Overview

The **investor-agent** is a Model Context Protocol (MCP) server that provides comprehensive financial insights and analysis to Large Language Models. It leverages real-time market data, fundamental and technical analysis to help users obtain:

- Detailed ticker reports including company overview, news, key metrics, performance, dates, analyst recommendations, and upgrades/downgrades.
- Options data highlighting high open interest.
- Historical price trends for stocks.
- Essential financial statements (income, balance sheet, cash flow).
- Up-to-date institutional ownership and mutual fund holdings.
- Earnings history and insider trading activity.
- Current and historical CNN Fear & Greed Index data and trend analysis.
- Technical indicator calculations (SMA, EMA, RSI, MACD, BBANDS).
- Prompts related to core investment principles and portfolio construction strategies.

The server integrates with [yfinance](https://pypi.org/project/yfinance/) for market data retrieval and fetches Fear & Greed data from CNN. It automatically caches `yfinance` API responses for an hour in a local `yfinance.cache` file to improve performance and reduce redundant API calls.

Combine this with an MCP server for placing trades on a brokerage platform such as [tasty-agent](https://github.com/ferdousbhai/tasty-agent) to place trades on tastytrade platform. Make sure to also enable web search functionality if you would like to incoporate latest news in your analysis.

## Prerequisites

- **Python:** 3.12 or higher
- **Package Manager:** [uv](https://docs.astral.sh/uv/). Install if you haven't:

  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

### Optional: TA-Lib C Library

- Required if you need the `calculate_technical_indicator` tool. Follow the [official installation instructions](https://ta-lib.org/install/) for your operating system.

## Installation

### Quick Start (Run without Installing)

The easiest way to run the agent is using `uvx`, which fetches and runs the package without installing it globally or in a specific environment:

```bash
# Run with core features only
uvx investor-agent
```

If you need the `calculate_technical_indicator` tool (and have the prerequisite [TA-Lib C Library](#optional-ta-lib-c-library) installed), you can include the optional dependencies:

```bash
# Run with technical indicator features included
uvx "investor-agent[ta]"
```

*Note: Using `uvx "package[extra]"` requires a recent version of `uv` (0.7.0 or later).*
*Note: Using `uvx` with `[ta]` requires the TA-Lib C library to be properly installed and discoverable on your system beforehand.*

## Tools

The **investor-agent** server comes with several tools to support financial analysis:

### Ticker Information

1. **`get_ticker_data`**
   - **Description:** Retrieves a comprehensive report for a given ticker symbol, including company overview, news, key metrics, performance, dates, analyst recommendations, and upgrades/downgrades.
   - **Input:**
     - `ticker` (string): Stock ticker symbol (e.g., `"AAPL"`).
   - **Return:** A formatted multi-section report.

2. **`get_options`**
   - **Description:** Provides a list of stock options with the highest open interest.
   - **Inputs:**
     - `ticker_symbol` (string): Stock ticker symbol.
     - `num_options` (int, optional): Number of options to return (default: 10).
     - `start_date` & `end_date` (string, optional): Date range in `YYYY-MM-DD` format.
     - `strike_lower` & `strike_upper` (float, optional): Desired strike price range.
     - `option_type` (string, optional): Option type (`"C"` for calls, `"P"` for puts).
   - **Return:** A formatted table of options data.

3. **`get_price_history`**
   - **Description:** Retrieves historical price data for a specific ticker.
   - **Inputs:**
     - `ticker` (string): Stock ticker symbol.
     - `period` (string): Time period (choose from `"1d"`, `"5d"`, `"1mo"`, `"3mo"`, `"6mo"`, `"1y"`, `"2y"`, `"5y"`, `"10y"`, `"ytd"`, `"max"`).
   - **Return:** A table showing price history.

### Financial Data Tools

1. **`get_financial_statements`**
   - **Description:** Fetches financial statements (income, balance, or cash flow) formatted in millions USD.
   - **Inputs:**
     - `ticker` (string): Stock ticker symbol.
     - `statement_type` (string): `"income"`, `"balance"`, or `"cash"`.
     - `frequency` (string): `"quarterly"` or `"annual"`.
   - **Return:** A formatted financial statement.

2. **`get_institutional_holders`**
   - **Description:** Retrieves details about major institutional and mutual fund holders.
   - **Input:**
     - `ticker` (string): Stock ticker symbol.
   - **Return:** Two formatted tables listing institutional and mutual fund holders.

3. **`get_earnings_history`**
   - **Description:** Retrieves a formatted table of earnings history.
   - **Input:**
     - `ticker` (string): Stock ticker symbol.
   - **Return:** A table displaying historical earnings data.

4. **`get_insider_trades`**
   - **Description:** Fetches the recent insider trading activity for a given ticker.
   - **Input:**
     - `ticker` (string): Stock ticker symbol.
   - **Return:** A formatted table showing insider trades.

### CNN Fear & Greed Index Tools

1. **`get_current_fng_tool`**
   - **Description:** Retrieves the current CNN Fear & Greed Index score, rating, and classification.
   - **Inputs:** None
   - **Return:** A string containing the current index details.

2. **`get_historical_fng_tool`**
   - **Description:** Fetches historical CNN Fear & Greed Index data for a specified number of days.
   - **Inputs:**
     - `days` (int): Number of days of historical data to retrieve.
   - **Return:** A string listing historical scores and classifications.

3. **`analyze_fng_trend`**
   - **Description:** Analyzes the trend of the CNN Fear & Greed Index over a specified number of days.
   - **Inputs:**
     - `days` (int): Number of days to include in the trend analysis.
   - **Return:** A summary string including the latest value, average, range, trend direction, and classification.

### Technical Analysis Tools

1. **`calculate_technical_indicator`**
   - **Description:** Calculates a specified technical indicator (SMA, EMA, RSI, MACD, BBANDS) for a ticker using daily closing prices over a given historical period. **Requires optional `ta` installation.**
   - **Inputs:**
     - `ticker` (string): Stock ticker symbol (e.g., `"AAPL"`).
     - `indicator` (string): The indicator to calculate. Choose from `"SMA"`, `"EMA"`, `"RSI"`, `"MACD"`, `"BBANDS"`.
     - `period` (string, optional): Historical data period (e.g., `"1y"`, default: `"1y"`). Choose from `"1mo"`, `"3mo"`, `"6mo"`, `"1y"`, `"2y"`, `"5y"`.
     - `timeperiod` (int, optional): Lookback period for SMA, EMA, RSI, BBANDS (default: 14).
     - `fastperiod` (int, optional): Fast EMA period for MACD (default: 12).
     - `slowperiod` (int, optional): Slow EMA period for MACD (default: 26).
     - `signalperiod` (int, optional): Signal line EMA period for MACD (default: 9).
     - `nbdevup` (int, optional): Upper standard deviation multiplier for BBANDS (default: 2).
     - `nbdevdn` (int, optional): Lower standard deviation multiplier for BBANDS (default: 2).
     - `matype` (int, optional): Moving average type for BBANDS (default: 0 for SMA). See TA-Lib docs.
     - `num_results` (int, optional): Number of recent results to display (default: 10).
   - **Return:** A formatted table showing the most recent calculated indicator values alongside dates and closing prices.

### Informational Prompts

1. **`investment_principles`**
   - **Description:** Provides a set of core investment principles and guidelines.
   - **Inputs:** None
   - **Return:** A string outlining several investment principles.

2. **`portfolio_construction_prompt`**
   - **Description:** Outlines a portfolio construction strategy incorporating tail-hedging.
   - **Inputs:** None
   - **Return:** A detailed prompt guiding the construction of a hedged portfolio.

## Usage with MCP Clients

To integrate **investor-agent** with an MCP client (for example, Claude Desktop), add the following configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "investor": {
        "command": "path/to/uvx/command/uvx",
        "args": ["investor-agent"],
    }
  }
}
```

## Debugging

You can leverage the MCP inspector to debug the server:

```bash
npx @modelcontextprotocol/inspector uvx investor-agent
```

For log monitoring, check the following directories:

- macOS: `~/Library/Logs/Claude/mcp*.log`
- Windows: `%APPDATA%\Claude\logs\mcp*.log`

## License

This MCP server is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
