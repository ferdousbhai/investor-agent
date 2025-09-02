"""Test configuration and shared fixtures."""

import pytest
import pandas as pd
from datetime import datetime
from unittest.mock import Mock


@pytest.fixture
def mock_ticker_info():
    """Mock ticker info data for AAPL."""
    return {
        'symbol': 'AAPL',
        'longName': 'Apple Inc.',
        'currentPrice': 150.0,
        'marketCap': 2500000000000,
        'volume': 50000000,
        'trailingPE': 25.5,
        'forwardPE': 22.3,
        'dividendYield': 0.005,
        'beta': 1.2,
        'eps': 6.0,
        'totalRevenue': 400000000000,
        'totalDebt': 120000000000,
        'profitMargins': 0.25,
        'operatingMargins': 0.30,
        'returnOnEquity': 0.85,
        'returnOnAssets': 0.20,
        'revenueGrowth': 0.08,
        'earningsGrowth': 0.12,
        'bookValue': 4.5,
        'priceToBook': 33.3,
        'enterpriseValue': 2600000000000,
        'pegRatio': 2.1,
        'trailingEps': 6.0,
        'forwardEps': 6.7
    }


@pytest.fixture
def sample_recommendations_df():
    """Sample analyst recommendations DataFrame."""
    return pd.DataFrame({
        'period': ['2024-01-01', '2024-01-02'],
        'strongBuy': [5, 6],
        'buy': [10, 9],
        'hold': [15, 14],
        'sell': [2, 3],
        'strongSell': [1, 1]
    })


@pytest.fixture
def empty_dataframe():
    """Empty DataFrame for testing edge cases."""
    return pd.DataFrame()


@pytest.fixture
def sample_price_history():
    """Sample price history DataFrame."""
    dates = pd.date_range('2024-01-01', periods=5, freq='D')
    return pd.DataFrame({
        'Open': [150.0, 151.0, 152.0, 153.0, 154.0],
        'High': [155.0, 156.0, 157.0, 158.0, 159.0],
        'Low': [148.0, 149.0, 150.0, 151.0, 152.0],
        'Close': [152.0, 153.0, 154.0, 155.0, 156.0],
        'Volume': [1000000, 1100000, 1200000, 1300000, 1400000]
    }, index=dates)


@pytest.fixture
def sample_options_df():
    """Sample options DataFrame."""
    return pd.DataFrame({
        'strike': [145.0, 150.0, 155.0],
        'lastPrice': [7.5, 5.0, 3.0],
        'bid': [7.0, 4.5, 2.5],
        'ask': [8.0, 5.5, 3.5],
        'volume': [1000, 2000, 500],
        'openInterest': [5000, 10000, 2500],
        'impliedVolatility': [0.25, 0.23, 0.28],
        'expiryDate': ['2024-03-15', '2024-03-15', '2024-03-15']
    })


@pytest.fixture
def sample_news():
    """Sample news data."""
    return [
        {
            'date': '2024-01-01',
            'title': 'Apple Reports Strong Q4 Earnings',
            'source': 'Reuters',
            'url': 'https://example.com/news1'
        },
        {
            'date': '2024-01-02', 
            'title': 'Apple Announces New Product Line',
            'source': 'Bloomberg',
            'url': 'https://example.com/news2'
        }
    ]


@pytest.fixture
def sample_calendar():
    """Sample calendar data."""
    return {
        'earnings': [
            {'date': '2024-01-25', 'estimate': 6.5}
        ],
        'dividends': [
            {'date': '2024-02-15', 'amount': 0.25}
        ]
    }


@pytest.fixture
def mock_fear_greed_data():
    """Mock CNN Fear & Greed Index data."""
    return {
        'fear_and_greed': {
            'score': 45,
            'rating': 'neutral',
            'timestamp': '2024-01-01T12:00:00+00:00',
            'previous_close': 44.5,
            'previous_1_week': 42.3,
            'previous_1_month': 48.7,
            'previous_1_year': 39.2
        },
        'put_call_options': {
            'score': 95,
            'rating': 'neutral'
        },
        'market_volatility_vix': {
            'score': 18.5,
            'rating': 'low'
        },
        'fear_and_greed_historical': {
            'data': [
                {'date': '2024-01-01', 'value': 45},
                {'date': '2024-01-02', 'value': 46}
            ]
        }
    }


@pytest.fixture
def mock_crypto_fng_data():
    """Mock Crypto Fear & Greed Index data."""
    return [
        {
            'value': '52',
            'value_classification': 'Neutral',
            'timestamp': '1704067200',
            'time_until_update': '0'
        }
    ]