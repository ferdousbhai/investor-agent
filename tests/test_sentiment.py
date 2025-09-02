"""Tests for sentiment analysis tools (Fear & Greed indices)."""

import pytest
from unittest.mock import patch, AsyncMock, Mock

from investor_agent.server import get_cnn_fear_greed_index, get_crypto_fear_greed_index, get_google_trends


class TestSentimentTools:
    """Test sentiment analysis tools."""
    
    @patch('investor_agent.server.fetch_fng_data')
    async def test_cnn_fear_greed_current(self, mock_fetch, mock_fear_greed_data):
        """Test getting current CNN Fear & Greed Index.""" 
        mock_fetch.return_value = mock_fear_greed_data
        
        result = await get_cnn_fear_greed_index(days=0)
        
        # Should exclude historical data when days=0
        assert 'fear_and_greed' in result
        assert 'put_call_options' in result  
        assert 'market_volatility_vix' in result
        assert 'fear_and_greed_historical' not in result
        
        # Verify mock was called
        mock_fetch.assert_called_once()
    
    @patch('investor_agent.server.fetch_fng_data')
    async def test_cnn_fear_greed_historical(self, mock_fetch):
        """Test getting historical CNN Fear & Greed Index."""
        historical_data = {
            'fear_and_greed': {'value': 45, 'description': 'Neutral'},
            'fear_and_greed_historical': {
                'data': [
                    {'date': '2024-01-01', 'value': 50},
                    {'date': '2024-01-02', 'value': 48},
                    {'date': '2024-01-03', 'value': 45}
                ]
            }
        }
        mock_fetch.return_value = historical_data
        
        result = await get_cnn_fear_greed_index(days=3)
        
        assert 'fear_and_greed_historical' in result
        assert len(result['fear_and_greed_historical']['data']) == 3
    
    @patch('investor_agent.server.fetch_fng_data')
    async def test_cnn_fear_greed_specific_indicators(self, mock_fetch, mock_fear_greed_data):
        """Test getting specific indicators only."""
        mock_fetch.return_value = mock_fear_greed_data
        
        result = await get_cnn_fear_greed_index(
            days=0, 
            indicators=['fear_and_greed', 'market_volatility_vix']
        )
        
        # Should only include requested indicators
        assert 'fear_and_greed' in result
        assert 'market_volatility_vix' in result
        assert 'put_call_options' not in result
    
    @patch('investor_agent.server.fetch_fng_data')
    async def test_cnn_fear_greed_invalid_indicators(self, mock_fetch, mock_fear_greed_data):
        """Test error handling for invalid indicators."""
        mock_fetch.return_value = mock_fear_greed_data
        
        with pytest.raises(ValueError, match="Invalid indicators"):
            await get_cnn_fear_greed_index(indicators=['invalid_indicator'])
    
    @patch('investor_agent.server.fetch_fng_data')
    async def test_cnn_fear_greed_no_data(self, mock_fetch):
        """Test error handling when no data is available."""
        mock_fetch.return_value = {}  # Empty dict should be falsy for the if not data check
        
        with pytest.raises(RuntimeError, match="Unable to fetch CNN Fear & Greed Index data"):
            await get_cnn_fear_greed_index()
    
    @patch('investor_agent.yahoo_finance_utils.create_cached_async_client')
    async def test_crypto_fear_greed_success(self, mock_client, mock_crypto_fng_data):
        """Test successful crypto fear & greed index retrieval.""" 
        # Mock the async context manager and HTTP response
        mock_response = Mock()
        mock_response.json.return_value = {"data": mock_crypto_fng_data}  # Sync method
        mock_response.raise_for_status = Mock()
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        
        mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_http_client)
        
        result = await get_crypto_fear_greed_index(days=1)
        
        assert result == mock_crypto_fng_data
        mock_http_client.get.assert_called_once_with(
            "https://api.alternative.me/fng/", 
            params={"limit": 1}
        )
    
    @patch('investor_agent.yahoo_finance_utils.create_cached_async_client')
    async def test_crypto_fear_greed_default_days(self, mock_client, mock_crypto_fng_data):
        """Test crypto fear & greed index with default days parameter."""
        mock_response = Mock()
        mock_response.json.return_value = {"data": mock_crypto_fng_data}  # Sync method
        mock_response.raise_for_status = Mock()
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        
        mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_http_client)
        
        result = await get_crypto_fear_greed_index()
        
        # Should use default of 7 days
        mock_http_client.get.assert_called_once_with(
            "https://api.alternative.me/fng/", 
            params={"limit": 7}
        )
    
    @patch('pytrends.request.TrendReq')
    def test_google_trends_success(self, mock_pytrends):
        """Test successful Google Trends data retrieval."""
        import pandas as pd
        
        # Mock the trends data
        trends_data = pd.DataFrame({
            'AAPL': [75, 80, 85],
            'GOOGL': [60, 65, 70]
        })
        
        mock_instance = mock_pytrends.return_value
        mock_instance.interest_over_time.return_value = trends_data
        
        result = get_google_trends(['AAPL', 'GOOGL'], period_days=7)
        
        # Should return mean values
        expected = {'AAPL': 80.0, 'GOOGL': 65.0}
        assert result == expected
        
        mock_instance.build_payload.assert_called_once_with(
            ['AAPL', 'GOOGL'], 
            timeframe='now 7-d'
        )
    
    @patch('pytrends.request.TrendReq')
    def test_google_trends_no_data(self, mock_pytrends):
        """Test Google Trends with no data returned."""
        import pandas as pd
        
        mock_instance = mock_pytrends.return_value
        mock_instance.interest_over_time.return_value = pd.DataFrame()  # Empty DataFrame
        
        with pytest.raises(ValueError, match="No data returned from Google Trends"):
            get_google_trends(['INVALID'], period_days=7)
    
    @patch('pytrends.request.TrendReq')
    def test_google_trends_single_keyword(self, mock_pytrends):
        """Test Google Trends with single keyword."""
        import pandas as pd
        
        trends_data = pd.DataFrame({
            'Bitcoin': [45, 50, 55, 60]
        })
        
        mock_instance = mock_pytrends.return_value
        mock_instance.interest_over_time.return_value = trends_data
        
        result = get_google_trends(['Bitcoin'], period_days=14)
        
        assert result == {'Bitcoin': 52.5}  # Mean of [45, 50, 55, 60]
        mock_instance.build_payload.assert_called_once_with(
            ['Bitcoin'], 
            timeframe='now 14-d'
        )