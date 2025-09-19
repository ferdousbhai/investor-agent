import logging
import datetime
import json
import re
import os
import tempfile
from typing import Literal

import httpx
import pandas as pd
import hishel

logger = logging.getLogger(__name__)

YAHOO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

def create_cached_async_client(headers: dict | None = None) -> httpx.AsyncClient:
    """Create an httpx.AsyncClient with environment-aware caching."""
    try:
        # Try to create cache in system temp directory
        cache_dir = os.path.join(tempfile.gettempdir(), 'investor_mcp_cache')
        os.makedirs(cache_dir, exist_ok=True)
        storage = hishel.AsyncFileStorage(base_path=cache_dir)
        logger.info(f"Using file-based cache at: {cache_dir}")
        return hishel.AsyncCacheClient(
            timeout=30.0,
            follow_redirects=True,
            headers=headers,
            storage=storage,
        )
    except (OSError, PermissionError) as e:
        logger.warning(f"Cannot create file cache ({e}), using memory cache")
        # Fallback to memory-only caching
        try:
            storage = hishel.AsyncInMemoryStorage()
            return hishel.AsyncCacheClient(
                timeout=30.0,
                follow_redirects=True,
                headers=headers,
                storage=storage,
            )
        except Exception as fallback_error:
            logger.warning(f"Memory cache also failed ({fallback_error}), disabling cache")
            # Final fallback: no caching

    return httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers=headers,
    )

def convert_to_numeric(value_str):
    """Convert string values like '1.2M', '3.45B', '123.4K' to numeric values."""
    if pd.isna(value_str) or value_str in ('', '-'):
        return None

    value_str = str(value_str).strip().replace(',', '')

    try:
        return float(value_str)
    except ValueError:
        pass

    # Handle suffixed values (K, M, B, T)
    multipliers = {'K': 1_000, 'M': 1_000_000, 'B': 1_000_000_000, 'T': 1_000_000_000_000}

    for suffix, multiplier in multipliers.items():
        if value_str.upper().endswith(suffix):
            try:
                return float(value_str[:-1]) * multiplier
            except ValueError:
                pass

    return value_str

async def _parse_earnings_json(url: str) -> dict:
    """Parse earnings JSON from Yahoo Finance URL using existing async infrastructure."""
    async with create_cached_async_client(headers=YAHOO_HEADERS) as client:
        response = await client.get(url)
        response.raise_for_status()

        content = response.text

        # Try the original patterns that worked in the past
        patterns = [
            r'root\.App\.main\s*=\s*({.*?});',
            r'window\.App\.main\s*=\s*({.*?});'
        ]

        for pattern_name, pattern in zip(['root.App.main', 'window.App.main'], patterns):
            match = re.search(pattern, content, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(1))
                    logger.info(f"Successfully parsed earnings data with {pattern_name} pattern")
                    return data
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse {pattern_name} JSON: {e}")

        raise ValueError("Could not find earnings data using original patterns")

async def get_earnings_for_date(date, offset=0, count=1):
    """Get earnings for a specific date with pagination - async version of original working code."""
    base_earnings_url = 'https://finance.yahoo.com/calendar/earnings'

    if offset >= count:
        return []

    temp = pd.Timestamp(date)
    date = temp.strftime("%Y-%m-%d")

    dated_url = '{0}?day={1}&offset={2}&size={3}'.format(
        base_earnings_url, date, offset, 100)

    result = await _parse_earnings_json(dated_url)

    stores = result['context']['dispatcher']['stores']

    earnings_count = stores['ScreenerCriteriaStore']['meta']['total']

    new_offset = offset + 100

    more_earnings = await get_earnings_for_date(date, new_offset, earnings_count)

    current_earnings = stores['ScreenerResultsStore']['results']['rows']

    total_earnings = current_earnings + more_earnings

    return total_earnings

async def get_earnings_in_date_range(start_date, end_date):
    """Get earnings for date range - async version of original working code."""
    import datetime

    earnings_data = []

    days_diff = pd.Timestamp(end_date) - pd.Timestamp(start_date)
    days_diff = days_diff.days

    current_date = pd.Timestamp(start_date)

    dates = [current_date + datetime.timedelta(diff) for diff in range(days_diff + 1)]
    dates = [d.strftime("%Y-%m-%d") for d in dates]

    i = 0
    while i < len(dates):
        try:
            earnings_data += await get_earnings_for_date(dates[i])
        except Exception:
            pass

        i += 1

    return earnings_data


async def get_earnings_calendar_data(
    start_date: str = None,
    end_date: str = None,
    limit: int = 100
) -> dict:
    """Get earnings calendar data using Playwright with pagination support."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise ImportError("Playwright not available. Install with: uvx investor-agent[playwright]")

    # Set default dates
    start_date = start_date or datetime.date.today().strftime('%Y-%m-%d')
    end_date = end_date or (pd.Timestamp(start_date) + pd.DateOffset(days=7)).strftime('%Y-%m-%d')

    all_earnings = []
    offset = 0

    async with async_playwright() as p:
        async with await p.chromium.launch(headless=True) as browser:
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()

            # Keep fetching pages until we have enough data or no more pages
            while len(all_earnings) < limit:
                url = f"https://finance.yahoo.com/calendar/earnings?from={start_date}&to={end_date}&offset={offset}&size=100"
                logger.info(f"Loading earnings page {offset//100 + 1} with Playwright")

                await page.goto(url, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(3000)

                # Extract earnings data from the current page
                earnings_data = await page.eval_on_selector_all('table tr', '''
                    (rows) => rows.slice(1).map(row => {
                        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
                        // Only require a valid symbol - let other fields gracefully default to empty
                        const symbol = cells[0] || '';
                        if (!symbol || symbol === 'Symbol' || cells.length === 0) return null;
                        return {
                            symbol, company: cells[1] || '', event_name: cells[2] || '',
                            time: cells[3] || '', eps_estimate: cells[4] || '', eps_actual: cells[5] || '',
                            surprise_percent: cells[6] || '', market_cap: cells[7] || ''
                        };
                    }).filter(Boolean)
                ''')

                if not earnings_data:
                    logger.info("No more earnings data found - reached end of results")
                    break

                all_earnings.extend(earnings_data)
                logger.info(f"Retrieved {len(earnings_data)} earnings from page {offset//100 + 1}")

                # If we got less than the page size, we've reached the end
                if len(earnings_data) < 100:
                    logger.info(f"Got {len(earnings_data)} < 100 earnings - reached final page")
                    break

                offset += 100
                await page.wait_for_timeout(1000)

    # Convert to structured earnings data (limit to requested count)
    earnings_list = [
        {
            'symbol': str(item.get('symbol', '')),
            'company': str(item.get('company', '')),
            'event_name': str(item.get('event_name', '')),
            'time': str(item.get('time', '')),
            'eps_estimate': convert_to_numeric(item.get('eps_estimate', '')),
            'eps_actual': convert_to_numeric(item.get('eps_actual', '')),
            'surprise_percent': convert_to_numeric(item.get('surprise_percent', '')),
            'market_cap': str(item.get('market_cap', ''))
        }
        for item in all_earnings[:limit]
        if item.get('symbol')
    ]

    return {
        'metadata': {
            'start_date': start_date,
            'end_date': end_date,
            'count': len(earnings_list),
            'total_found': len(all_earnings),
            'pages_fetched': (offset // 100) + 1,
            'timestamp': pd.Timestamp.now().isoformat(),
            'source': 'Yahoo Finance Playwright Scraping (Paginated)'
        },
        'earnings': earnings_list
    }


async def get_market_movers_data(
    category: Literal["gainers", "losers", "most-active"] = "most-active",
    count: int = 25,
    market_session: Literal["regular", "pre-market", "after-hours"] = "regular"
) -> dict:
    """Fetch and parse market movers data from Yahoo Finance."""
    from bs4 import BeautifulSoup

    count = min(max(count, 1), 100)

    # Build URLs based on category and market session
    if category == "most-active":
        if market_session == "regular":
            url = f"https://finance.yahoo.com/most-active?count={count}&offset=0"
        elif market_session == "pre-market":
            url = f"https://finance.yahoo.com/markets/stocks/pre-market?count={count}&offset=0"
        elif market_session == "after-hours":
            url = f"https://finance.yahoo.com/markets/stocks/after-hours?count={count}&offset=0"
        else:
            raise ValueError(f"Invalid market session: {market_session}")
    else:
        # Gainers and losers only available for regular session
        url_map = {
            "gainers": f"https://finance.yahoo.com/gainers?count={count}&offset=0",
            "losers": f"https://finance.yahoo.com/losers?count={count}&offset=0"
        }
        url = url_map.get(category)
        if not url:
            raise ValueError(f"Invalid category: {category}")

    async with create_cached_async_client(headers=YAHOO_HEADERS) as client:
        logger.info(f"Fetching {category} ({market_session} session) from: {url}")
        response = await client.get(url)
        response.raise_for_status()

        # Parse with pandas
        tables = pd.read_html(response.content)
        if not tables:
            raise ValueError(f"No data found for {category}")

        df = tables[0].copy()

        # Clean up the data
        df = df.drop('52 Week Range', axis=1, errors='ignore')

        # Clean percentage change column
        if '% Change' in df.columns:
            df['% Change'] = df['% Change'].astype(str).str.replace('[%+,]', '', regex=True)
            df['% Change'] = pd.to_numeric(df['% Change'], errors='coerce')

        # Clean numeric columns
        numeric_cols = [col for col in df.columns if any(x in col for x in ['Vol', 'Volume', 'Market Cap', 'Market'])]
        for col in numeric_cols:
            df[col] = df[col].astype(str).apply(convert_to_numeric)

        return {
            'metadata': {
                'category': category,
                'market_session': market_session if category == "most-active" else "regular",
                'count': len(df),
                'timestamp': pd.Timestamp.now().isoformat(),
                'source': 'Yahoo Finance'
            },
            'stocks': df.head(count).to_dict('records')
        }