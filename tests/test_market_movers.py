"""Tests for get_market_movers tool."""

import pytest
from unittest.mock import patch

from investor_agent.server import get_market_movers


class TestGetMarketMovers:
    """Test the get_market_movers tool."""
    
    @pytest.fixture
    def sample_movers_data(self):
        """Sample market movers data."""
        return {
            'stocks': [
                {
                    'symbol': 'AAPL',
                    'name': 'Apple Inc.',
                    'price': 150.0,
                    'change': 5.0,
                    'percentChange': 3.45,
                    'volume': 50000000
                },
                {
                    'symbol': 'GOOGL',
                    'name': 'Alphabet Inc.',
                    'price': 2800.0,
                    'change': -25.0,
                    'percentChange': -0.88,
                    'volume': 25000000
                }
            ]
        }
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_get_gainers(self, mock_movers, sample_movers_data):
        """Test getting market gainers."""
        mock_movers.return_value = sample_movers_data
        
        result = await get_market_movers(category="gainers", count=25)
        
        assert result == sample_movers_data
        mock_movers.assert_called_once_with("gainers", 25, "regular")
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_get_losers(self, mock_movers, sample_movers_data):
        """Test getting market losers."""
        mock_movers.return_value = sample_movers_data
        
        result = await get_market_movers(category="losers", count=50)
        
        assert result == sample_movers_data
        mock_movers.assert_called_once_with("losers", 50, "regular")
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_get_most_active(self, mock_movers, sample_movers_data):
        """Test getting most active stocks."""
        mock_movers.return_value = sample_movers_data
        
        result = await get_market_movers(category="most-active", count=30)
        
        assert result == sample_movers_data
        mock_movers.assert_called_once_with("most-active", 30, "regular")
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_premarket_session(self, mock_movers, sample_movers_data):
        """Test getting most active stocks in pre-market session."""
        mock_movers.return_value = sample_movers_data
        
        result = await get_market_movers(
            category="most-active", 
            count=15, 
            market_session="pre-market"
        )
        
        assert result == sample_movers_data
        mock_movers.assert_called_once_with("most-active", 15, "pre-market")
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_after_hours_session(self, mock_movers, sample_movers_data):
        """Test getting most active stocks in after-hours session."""
        mock_movers.return_value = sample_movers_data
        
        result = await get_market_movers(
            category="most-active", 
            count=20, 
            market_session="after-hours"
        )
        
        assert result == sample_movers_data
        mock_movers.assert_called_once_with("most-active", 20, "after-hours")
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_default_parameters(self, mock_movers, sample_movers_data):
        """Test default parameters."""
        mock_movers.return_value = sample_movers_data
        
        result = await get_market_movers()
        
        assert result == sample_movers_data
        mock_movers.assert_called_once_with("most-active", 25, "regular")
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_empty_response(self, mock_movers):
        """Test handling of empty response."""
        mock_movers.return_value = {'stocks': []}
        
        result = await get_market_movers(category="gainers")
        
        assert result == {'stocks': []}
        assert len(result['stocks']) == 0
    
    @patch('investor_agent.yahoo_finance_utils.get_market_movers_data')
    async def test_error_handling(self, mock_movers):
        """Test error handling when underlying function fails."""
        mock_movers.side_effect = Exception("API Error")
        
        with pytest.raises(Exception, match="API Error"):
            await get_market_movers(category="gainers")