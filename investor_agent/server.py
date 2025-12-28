import datetime
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
from typing import Literal, Any

import httpx
import pandas as pd
import yfinance as yf
from hishel.httpx import AsyncCacheClient
from mcp.server.fastmcp import FastMCP
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception, after_log
from yfinance.exceptions import YFRateLimitError

mcp = FastMCP("Investor-Agent", dependencies=["yfinance", "pandas", "pytrends"])

# Configure pandas
pd.set_option('future.no_silent_downcasting', True)

# Check TA-Lib availability
try:
    import talib  # type: ignore
    _ta_available = True
except ImportError:
    _ta_available = False

# Setup logging
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)

# =============================================================================
# Constants
# =============================================================================

# HTTP Headers for browser-like requests
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# Yahoo Finance URLs
YAHOO_MOST_ACTIVE_URL = "https://finance.yahoo.com/most-active"
YAHOO_PRE_MARKET_URL = "https://finance.yahoo.com/markets/stocks/pre-market"
YAHOO_AFTER_HOURS_URL = "https://finance.yahoo.com/markets/stocks/after-hours"
YAHOO_GAINERS_URL = "https://finance.yahoo.com/gainers"
YAHOO_LOSERS_URL = "https://finance.yahoo.com/losers"

# Sentiment/Market Data APIs
CNN_FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
CRYPTO_FEAR_GREED_URL = "https://api.alternative.me/fng/"
NASDAQ_EARNINGS_URL = "https://api.nasdaq.com/api/calendar/earnings"

# Nasdaq-specific headers
NASDAQ_HEADERS = {
    **BROWSER_HEADERS,
    'Referer': 'https://www.nasdaq.com/'
}

# Unified retry decorator for API calls (yfinance and HTTP)
def api_retry(func):
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2.0, min=2.0, max=30.0),
        retry=retry_if_exception(lambda e:
            isinstance(e, YFRateLimitError) or
            (hasattr(e, 'status_code') and getattr(e, 'status_code', 0) >= 500) or
            any(term in str(e).lower() for term in [
                "rate limit", "too many requests", "temporarily blocked",
                "timeout", "connection", "network", "temporary", "5", "429", "502", "503", "504"
            ])
        ),
        after=after_log(logger, logging.WARNING)
    )(func)

# HTTP client utility
def create_async_client(headers: dict | None = None) -> AsyncCacheClient:
    """Create a cached async HTTP client with longer timeout, automatic redirect and custom headers."""
    return AsyncCacheClient(
        timeout=30.0,
        follow_redirects=True,
        headers=headers,
    )

@api_retry
async def fetch_json(url: str, headers: dict | None = None) -> dict:
    """Generic JSON fetcher with retry logic."""
    async with create_async_client(headers=headers) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()

@api_retry
async def fetch_text(url: str, headers: dict | None = None) -> str:
    """Generic text fetcher with retry logic."""
    async with create_async_client(headers=headers) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text

# Utility functions
def validate_ticker(ticker: str) -> str:
    ticker = ticker.upper().strip()
    if not ticker:
        raise ValueError("Ticker symbol cannot be empty")
    return ticker

def validate_date(date_str: str) -> datetime.date:
    """Validate and parse a date string in YYYY-MM-DD format."""
    try:
        return datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD")

def validate_date_range(start_str: str | None, end_str: str | None) -> None:
    start_date = None
    end_date = None

    if start_str:
        start_date = validate_date(start_str)
    if end_str:
        end_date = validate_date(end_str)

    if start_date and end_date and start_date > end_date:
        raise ValueError("start_date must be before or equal to end_date")

@api_retry
def yf_call(ticker: str, method: str, *args, **kwargs):
    """Generic yfinance API call with retry logic."""
    t = yf.Ticker(ticker)
    return getattr(t, method)(*args, **kwargs)

def get_options_chain(ticker: str, expiry: str, option_type: Literal["C", "P"] | None = None) -> pd.DataFrame:
    """Get options chain with optional filtering by type."""
    chain = yf_call(ticker, "option_chain", expiry)

    if option_type == "C":
        return chain.calls
    elif option_type == "P":
        return chain.puts

    return pd.concat([chain.calls, chain.puts], ignore_index=True)



def to_clean_csv(df: pd.DataFrame) -> str:
    """Clean DataFrame by removing empty columns and convert to CSV string."""
    # Chain operations more efficiently
    mask = (df.notna().any() & (df != '').any() &
            ((df != 0).any() | (df.dtypes == 'object')))
    return df.loc[:, mask].fillna('').to_csv(index=False)

def format_date_string(date_str: str) -> str | None:
    """Parse and format date string to YYYY-MM-DD format."""
    try:
        return datetime.datetime.fromisoformat(date_str.replace("Z", "")).strftime("%Y-%m-%d")
    except Exception:
        return date_str[:10] if date_str else None

# Google Trends timeframe mapping
TREND_TIMEFRAMES = {
    1: 'now 1-d', 7: 'now 7-d', 30: 'today 1-m',
    90: 'today 3-m', 365: 'today 12-m'
}

def get_trends_timeframe(days: int) -> str:
    """Get appropriate Google Trends timeframe for given days."""
    for max_days, timeframe in TREND_TIMEFRAMES.items():
        if days <= max_days:
            return timeframe
    return 'today 5-y'


@mcp.tool()
async def get_market_movers(
    category: Literal["gainers", "losers", "most-active"] = "most-active",
    count: int = 25,
    market_session: Literal["regular", "pre-market", "after-hours"] = "regular"
) -> str:
    """market_session only applies to most-active category."""
    count = min(max(count, 1), 100)
    params = f"?count={count}&offset=0"

    # Map category and session to URL
    url_map = {
        ("most-active", "regular"): YAHOO_MOST_ACTIVE_URL,
        ("most-active", "pre-market"): YAHOO_PRE_MARKET_URL,
        ("most-active", "after-hours"): YAHOO_AFTER_HOURS_URL,
        ("gainers", "regular"): YAHOO_GAINERS_URL,
        ("losers", "regular"): YAHOO_LOSERS_URL,
    }

    # For gainers/losers, ignore market_session
    key = (category, market_session if category == "most-active" else "regular")
    base_url = url_map.get(key)

    if not base_url:
        raise ValueError(f"Invalid category '{category}' or market_session '{market_session}'")

    url = base_url + params

    logger.info(f"Fetching {category} ({market_session} session) from: {url}")
    response_text = await fetch_text(url, BROWSER_HEADERS)
    tables = pd.read_html(StringIO(response_text))
    if not tables or tables[0].empty:
        return f"No data found for {category}"

    df = tables[0].loc[:, ~tables[0].columns.str.contains('^Unnamed')]
    return to_clean_csv(df.head(count))


@mcp.tool()
async def get_cnn_fear_greed_index(
    indicators: list[
        Literal[
            "fear_and_greed",
            "fear_and_greed_historical",
            "put_call_options",
            "market_volatility_vix",
            "market_volatility_vix_50",
            "junk_bond_demand",
            "safe_haven_demand"
        ]
    ] | None = None
) -> dict:
    """Scale: 0-25 Extreme Fear, 25-45 Fear, 45-55 Neutral, 55-75 Greed, 75-100 Extreme Greed."""
    raw_data = await fetch_json(CNN_FEAR_GREED_URL, BROWSER_HEADERS)
    if not raw_data:
        raise ValueError("Empty response data")

    # Remove historical time series data arrays
    result = {
        k: {inner_k: inner_v for inner_k, inner_v in v.items() if inner_k != "data"}
        if isinstance(v, dict) else v
        for k, v in raw_data.items()
        if k != "fear_and_greed_historical"
    }

    # Filter by indicators if specified
    if indicators:
        if invalid := set(indicators) - set(result.keys()):
            raise ValueError(f"Invalid indicators: {list(invalid)}. Available: {list(result.keys())}")
        result = {k: v for k, v in result.items() if k in indicators}

    return result

@mcp.tool()
async def get_crypto_fear_greed_index() -> dict:
    """Scale: 0-25 Extreme Fear, 25-45 Fear, 45-55 Neutral, 55-75 Greed, 75-100 Extreme Greed."""
    data = await fetch_json(CRYPTO_FEAR_GREED_URL)
    if "data" not in data or not data["data"]:
        raise ValueError("Invalid response format from alternative.me API")

    current_data = data["data"][0]
    return {
        "value": current_data["value"],
        "classification": current_data["value_classification"],
        "timestamp": current_data["timestamp"]
    }

@mcp.tool()
def get_google_trends(
    keywords: list[str],
    period_days: int = 7
) -> str:
    """Values are relative 0-100 where 100 = peak popularity in the period."""
    from pytrends.request import TrendReq

    logger.info(f"Fetching Google Trends data for {period_days} days")

    timeframe = get_trends_timeframe(period_days)
    pytrends = TrendReq(hl='en-US', tz=360)
    pytrends.build_payload(keywords, timeframe=timeframe)

    df = pytrends.interest_over_time()
    if df.empty:
        raise ValueError("No data returned from Google Trends")

    # Clean and format data
    if 'isPartial' in df.columns:
        df = df[~df['isPartial']].drop('isPartial', axis=1)

    df_reset = df.reset_index()

    return to_clean_csv(df_reset)

@mcp.tool()
def get_ticker_data(
    ticker: str,
    max_news: int = 5,
    max_recommendations: int = 5,
    max_upgrades: int = 5
) -> dict[str, Any]:
    """Returns basic_info, calendar, news, recommendations, upgrades_downgrades."""
    ticker = validate_ticker(ticker)

    # Get all basic data in parallel
    with ThreadPoolExecutor() as executor:
        info_future = executor.submit(yf_call, ticker, "get_info")
        calendar_future = executor.submit(yf_call, ticker, "get_calendar")
        news_future = executor.submit(yf_call, ticker, "get_news")

        info = info_future.result()
        if not info:
            raise ValueError(f"No information available for {ticker}")

        essential_fields = {
            'symbol', 'longName', 'currentPrice', 'marketCap', 'volume', 'trailingPE',
            'forwardPE', 'dividendYield', 'beta', 'eps', 'totalRevenue', 'totalDebt',
            'profitMargins', 'operatingMargins', 'returnOnEquity', 'returnOnAssets',
            'revenueGrowth', 'earningsGrowth', 'bookValue', 'priceToBook',
            'enterpriseValue', 'pegRatio', 'trailingEps', 'forwardEps'
        }

        # Basic info section - convert to structured format
        basic_info = [
            {"metric": key, "value": value.isoformat() if hasattr(value, 'isoformat') else value}
            for key, value in info.items() if key in essential_fields
        ]

        result: dict[str, Any] = {"basic_info": basic_info}

        # Process calendar
        calendar = calendar_future.result()
        if calendar:
            result["calendar"] = [
                {"event": key, "value": value.isoformat() if hasattr(value, 'isoformat') else value}
                for key, value in calendar.items()
            ]

        # Process news
        news_items = news_future.result()
        if news_items:
            news_items = news_items[:max_news]  # Apply limit
            news_data = []
            for item in news_items:
                content = item.get("content", {})
                raw_date = content.get("pubDate") or content.get("displayTime") or ""

                news_data.append({
                    "date": format_date_string(raw_date),
                    "title": content.get("title") or "Untitled",
                    "source": content.get("provider", {}).get("displayName", "Unknown"),
                    "url": (content.get("canonicalUrl", {}).get("url") or
                            content.get("clickThroughUrl", {}).get("url") or "")
                })

            result["news"] = news_data

    # Get recommendations and upgrades in parallel
    with ThreadPoolExecutor() as executor:
        recommendations_future = executor.submit(yf_call, ticker, "get_recommendations")
        upgrades_future = executor.submit(yf_call, ticker, "get_upgrades_downgrades")

        recommendations = recommendations_future.result()
        if isinstance(recommendations, pd.DataFrame) and not recommendations.empty:
            result["recommendations"] = to_clean_csv(recommendations.head(max_recommendations))

        upgrades = upgrades_future.result()
        if isinstance(upgrades, pd.DataFrame) and not upgrades.empty:
            upgrades = upgrades.sort_index(ascending=False) if hasattr(upgrades, 'sort_index') else upgrades
            result["upgrades_downgrades"] = to_clean_csv(upgrades.head(max_upgrades))

    return result

@mcp.tool()
def get_options(
    ticker_symbol: str,
    num_options: int = 10,
    start_date: str | None = None,
    end_date: str | None = None,
    strike_lower: float | None = None,
    strike_upper: float | None = None,
    option_type: Literal["C", "P"] | None = None,
) -> str:
    """Dates filter expiration. Sorted by liquidity (open interest, volume)."""
    ticker_symbol = validate_ticker(ticker_symbol)

    try:
        # Validate dates
        validate_date_range(start_date, end_date)

        # Get options expirations - this is a property, not a method
        t = yf.Ticker(ticker_symbol)
        expirations = t.options
        if not expirations:
            raise ValueError(f"No options available for {ticker_symbol}")

        # Filter by date
        valid_expirations = [
            exp for exp in expirations
            if ((not start_date or exp >= start_date) and
                (not end_date or exp <= end_date))
        ]

        if not valid_expirations:
            raise ValueError(f"No options found for {ticker_symbol} within specified date range")

        # Parallel fetch with error handling
        with ThreadPoolExecutor() as executor:
            chains = [
                chain.assign(expiryDate=expiry)
                for chain, expiry in zip(
                    executor.map(lambda exp: get_options_chain(ticker_symbol, exp, option_type), valid_expirations),
                    valid_expirations
                ) if chain is not None
            ]

        if not chains:
            raise ValueError(f"No options found for {ticker_symbol} matching criteria")

        df = pd.concat(chains, ignore_index=True)

        # Apply strike filters
        if strike_lower is not None:
            df = df[df['strike'] >= strike_lower]
        if strike_upper is not None:
            df = df[df['strike'] <= strike_upper]

        df = df.sort_values(['openInterest', 'volume'], ascending=[False, False])
        df_subset = df.head(num_options)
        return to_clean_csv(df_subset)

    except Exception as e:
        raise ValueError(f"Failed to retrieve options data: {str(e)}")


@mcp.tool()
def get_price_history(
    ticker: str,
    period: Literal["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"] = "1mo"
) -> str:
    """Daily bars for <=1y, monthly bars for longer periods."""
    ticker = validate_ticker(ticker)

    interval = "1mo" if period in ["2y", "5y", "10y", "max"] else "1d"
    history = yf_call(ticker, "history", period=period, interval=interval)
    if history is None or history.empty:
        raise ValueError(f"No historical data found for {ticker}")

    # Reset index to include dates as a column
    history_with_dates = history.reset_index()
    history_with_dates['Date'] = pd.to_datetime(history_with_dates['Date']).dt.strftime('%Y-%m-%d')

    return to_clean_csv(history_with_dates)

@mcp.tool()
def get_financial_statements(
    ticker: str,
    statement_types: list[Literal["income", "balance", "cash"]] = ["income"],
    frequency: Literal["quarterly", "annual"] = "quarterly",
    max_periods: int = 8
) -> dict[str, str]:
    """Returns dict mapping statement type to CSV (line items as rows, periods as columns)."""
    ticker = validate_ticker(ticker)

    @api_retry
    def get_single_statement(stmt_type: str):
        t = yf.Ticker(ticker)
        if stmt_type == "income":
            return t.quarterly_income_stmt if frequency == "quarterly" else t.income_stmt
        elif stmt_type == "balance":
            return t.quarterly_balance_sheet if frequency == "quarterly" else t.balance_sheet
        else:  # cash
            return t.quarterly_cashflow if frequency == "quarterly" else t.cashflow

    # Fetch all requested statements in parallel
    with ThreadPoolExecutor() as executor:
        futures = {stmt_type: executor.submit(get_single_statement, stmt_type) for stmt_type in statement_types}

        results = {}
        for stmt_type, future in futures.items():
            df = future.result()
            if df is None or df.empty:
                raise ValueError(f"No {stmt_type} statement data found for {ticker}")

            if len(df.columns) > max_periods:
                df = df.iloc[:, :max_periods]

            df_reset = df.reset_index()
            results[stmt_type] = to_clean_csv(df_reset)

    return results

@mcp.tool()
def get_institutional_holders(ticker: str, top_n: int = 20) -> dict[str, Any]:
    """Returns institutional_holders and mutual_fund_holders CSVs."""
    ticker = validate_ticker(ticker)

    # Fetch both types in parallel
    with ThreadPoolExecutor() as executor:
        inst_future = executor.submit(yf_call, ticker, "get_institutional_holders")
        fund_future = executor.submit(yf_call, ticker, "get_mutualfund_holders")

        inst_holders = inst_future.result()
        fund_holders = fund_future.result()

    # Limit results
    inst_holders = inst_holders.head(top_n) if isinstance(inst_holders, pd.DataFrame) else None
    fund_holders = fund_holders.head(top_n) if isinstance(fund_holders, pd.DataFrame) else None

    if (inst_holders is None or inst_holders.empty) and (fund_holders is None or fund_holders.empty):
        raise ValueError(f"No institutional holder data found for {ticker}")

    result = {"ticker": ticker, "top_n": top_n}

    if inst_holders is not None and not inst_holders.empty:
        result["institutional_holders"] = to_clean_csv(inst_holders)

    if fund_holders is not None and not fund_holders.empty:
        result["mutual_fund_holders"] = to_clean_csv(fund_holders)

    return result

@mcp.tool()
def get_earnings_history(ticker: str, max_entries: int = 8) -> str:
    """EPS estimates vs actuals with surprise percentage."""
    ticker = validate_ticker(ticker)

    earnings_history = yf_call(ticker, "get_earnings_history")
    if earnings_history is None or (isinstance(earnings_history, pd.DataFrame) and earnings_history.empty):
        raise ValueError(f"No earnings history data found for {ticker}")

    if isinstance(earnings_history, pd.DataFrame):
        earnings_history = earnings_history.head(max_entries)

    return to_clean_csv(earnings_history)

@mcp.tool()
def get_insider_trades(ticker: str, max_trades: int = 20) -> str:
    """Buys/sells by executives and directors."""
    ticker = validate_ticker(ticker)

    trades = yf_call(ticker, "get_insider_transactions")
    if trades is None or (isinstance(trades, pd.DataFrame) and trades.empty):
        raise ValueError(f"No insider trading data found for {ticker}")

    if isinstance(trades, pd.DataFrame):
        trades = trades.head(max_trades)

    return to_clean_csv(trades)

@mcp.tool()
async def get_nasdaq_earnings_calendar(
    date: str | None = None,
    limit: int = 100
) -> str:
    """Single date only (defaults to today). Call multiple times for date ranges."""
    today = datetime.date.today()
    target_date = validate_date(date) if date else today

    date_str = target_date.strftime('%Y-%m-%d')
    url = f"{NASDAQ_EARNINGS_URL}?date={date_str}"

    try:
        logger.info(f"Fetching earnings for {date_str}")

        data = await fetch_json(url, NASDAQ_HEADERS)

        if 'data' in data and data['data']:
            earnings_data = data['data']

            if earnings_data.get('headers') and earnings_data.get('rows'):
                headers = earnings_data['headers']
                rows = earnings_data['rows']

                # Extract column names from headers dict
                if isinstance(headers, dict):
                    column_names = list(headers.values())
                    column_keys = list(headers.keys())
                else:
                    column_names = [h.get('label', h) if isinstance(h, dict) else str(h) for h in headers]
                    column_keys = column_names

                # Convert rows to DataFrame
                processed_rows = []
                for row in rows:
                    if isinstance(row, dict):
                        processed_row = [row.get(key, '') for key in column_keys]
                        processed_rows.append(processed_row)

                if processed_rows:
                    df = pd.DataFrame(processed_rows, columns=column_names)
                    # Add date column at the beginning
                    df.insert(0, 'Date', date_str)

                    # Apply limit
                    if len(df) > limit:
                        df = df.head(limit)

                    logger.info(f"Retrieved {len(df)} earnings entries for {date_str}")
                    return to_clean_csv(df)

        # No earnings data found
        return f"No earnings announcements found for {date_str}. This could be due to weekends, holidays, or no scheduled earnings on this date."

    except Exception as e:
        logger.error(f"Error fetching earnings for {date_str}: {e}")
        return f"Error retrieving earnings data for {date_str}: {str(e)}"


# =============================================================================
# Optional Tools (require additional dependencies)
# =============================================================================

# Technical Analysis (requires TA-Lib: uvx "investor-agent[ta]")
if _ta_available:
    @mcp.tool()
    def calculate_technical_indicator(
        ticker: str,
        indicator: Literal["SMA", "EMA", "RSI", "MACD", "BBANDS"],
        period: Literal["1mo", "3mo", "6mo", "1y", "2y", "5y"] = "1y",
        timeperiod: int = 14,
        fastperiod: int = 12,
        slowperiod: int = 26,
        signalperiod: int = 9,
        nbdev: int = 2,
        matype: int = 0,
        num_results: int = 100
    ) -> dict[str, Any]:
        """RSI: 70=overbought, 30=oversold. MACD params: fast/slow/signal periods. BBANDS: nbdev=std devs, matype 0=SMA 1=EMA."""
        import numpy as np
        from talib import MA_Type  # type: ignore

        ticker = validate_ticker(ticker)

        history = yf_call(ticker, "history", period=period, interval="1d")
        if history is None or history.empty or 'Close' not in history.columns:
            raise ValueError(f"No valid historical data found for {ticker}")

        close_prices = history['Close'].values
        min_required = {
            "SMA": timeperiod, "EMA": timeperiod * 2, "RSI": timeperiod + 1,
            "MACD": slowperiod + signalperiod, "BBANDS": timeperiod
        }.get(indicator, timeperiod)

        if len(close_prices) < min_required:
            raise ValueError(f"Insufficient data for {indicator} ({len(close_prices)} points, need {min_required})")

        # Calculate indicators using mapping
        indicator_funcs = {
            "SMA": lambda: {"sma": talib.SMA(close_prices, timeperiod=timeperiod)},
            "EMA": lambda: {"ema": talib.EMA(close_prices, timeperiod=timeperiod)},
            "RSI": lambda: {"rsi": talib.RSI(close_prices, timeperiod=timeperiod)},
            "MACD": lambda: dict(zip(["macd", "signal", "histogram"],
                talib.MACD(close_prices, fastperiod=fastperiod,
                          slowperiod=slowperiod, signalperiod=signalperiod))),
            "BBANDS": lambda: dict(zip(["upper_band", "middle_band", "lower_band"],
                talib.BBANDS(close_prices, timeperiod=timeperiod,
                           nbdevup=nbdev, nbdevdn=nbdev, matype=MA_Type(matype))))
        }
        indicator_values = indicator_funcs[indicator]()

        # Limit results to num_results
        if num_results > 0:
            history = history.tail(num_results)

        # Reset index to show dates as a column
        price_df = history.reset_index()
        price_df['Date'] = pd.to_datetime(price_df['Date']).dt.strftime('%Y-%m-%d')

        # Create indicator DataFrame with same date range
        indicator_rows = []
        for i, date in enumerate(price_df['Date']):
            row = {'Date': date}
            for name, values in indicator_values.items():
                # Get the corresponding value for this date
                slice_values = values[-num_results:] if num_results > 0 else values

                if i < len(slice_values):
                    val = slice_values[i]
                    row[name] = f"{val:.4f}" if not np.isnan(val) else "N/A"
                else:
                    row[name] = "N/A"
            indicator_rows.append(row)

        indicator_df = pd.DataFrame(indicator_rows)

        return {
            "price_data": to_clean_csv(price_df),
            "indicator_data": to_clean_csv(indicator_df)
        }

if __name__ == "__main__":
    mcp.run()