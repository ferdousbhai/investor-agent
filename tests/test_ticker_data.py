"""Tests for get_ticker_data tool - focuses on the DataFrame boolean evaluation issue we fixed."""

import pytest
import pandas as pd
from unittest.mock import patch, Mock

from investor_agent.server import get_ticker_data


class TestGetTickerData:
    """Test the get_ticker_data tool with focus on DataFrame edge cases."""
    
    @patch('investor_agent.yfinance_utils.get_analyst_data')
    @patch('investor_agent.yfinance_utils.get_news')
    @patch('investor_agent.yfinance_utils.get_calendar') 
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_successful_data_retrieval(
        self, 
        mock_info, 
        mock_calendar, 
        mock_news, 
        mock_analyst,
        mock_ticker_info,
        sample_recommendations_df,
        sample_news,
        sample_calendar
    ):
        """Test successful retrieval of all ticker data."""
        # Setup mocks
        mock_info.return_value = mock_ticker_info
        mock_calendar.return_value = sample_calendar
        mock_news.return_value = sample_news
        mock_analyst.side_effect = [sample_recommendations_df, sample_recommendations_df]  # recommendations, then upgrades
        
        result = get_ticker_data("AAPL", max_news=2, max_recommendations=2, max_upgrades=2)
        
        # Verify structure
        assert "info" in result
        assert "calendar" in result
        assert "news" in result
        assert "recommendations" in result
        assert "upgrades_downgrades" in result
        
        # Verify content
        assert result["info"]["symbol"] == "AAPL"
        assert len(result["news"]) == 2
        assert "data" in result["recommendations"]
        assert "data" in result["upgrades_downgrades"]
    
    @patch('investor_agent.yfinance_utils.get_analyst_data')
    @patch('investor_agent.yfinance_utils.get_news')
    @patch('investor_agent.yfinance_utils.get_calendar')
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_empty_dataframe_handling(
        self, 
        mock_info, 
        mock_calendar, 
        mock_news, 
        mock_analyst,
        mock_ticker_info,
        empty_dataframe
    ):
        """Test handling of empty DataFrames - this was the bug we fixed!"""
        mock_info.return_value = mock_ticker_info
        mock_calendar.return_value = None
        mock_news.return_value = None
        mock_analyst.return_value = empty_dataframe  # Both calls return empty DataFrame
        
        result = get_ticker_data("AAPL")
        
        # Should have info but NOT recommendations or upgrades_downgrades
        assert "info" in result
        assert result["info"]["symbol"] == "AAPL"
        assert "recommendations" not in result
        assert "upgrades_downgrades" not in result
        assert "calendar" not in result
        assert "news" not in result
        
        # Verify the function didn't crash on DataFrame boolean evaluation
        assert isinstance(result, dict)
    
    @patch('investor_agent.yfinance_utils.get_analyst_data')
    @patch('investor_agent.yfinance_utils.get_news')
    @patch('investor_agent.yfinance_utils.get_calendar')
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_none_dataframe_handling(
        self, 
        mock_info, 
        mock_calendar, 
        mock_news, 
        mock_analyst,
        mock_ticker_info
    ):
        """Test handling of None returns from analyst data functions."""
        mock_info.return_value = mock_ticker_info
        mock_calendar.return_value = None
        mock_news.return_value = None
        mock_analyst.return_value = None  # Both calls return None
        
        result = get_ticker_data("AAPL")
        
        # Should have info but NOT recommendations or upgrades_downgrades
        assert "info" in result
        assert result["info"]["symbol"] == "AAPL"
        assert "recommendations" not in result
        assert "upgrades_downgrades" not in result
    
    @patch('investor_agent.yfinance_utils.get_analyst_data')
    @patch('investor_agent.yfinance_utils.get_news')
    @patch('investor_agent.yfinance_utils.get_calendar')
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_mixed_dataframe_states(
        self, 
        mock_info, 
        mock_calendar, 
        mock_news, 
        mock_analyst,
        mock_ticker_info,
        sample_recommendations_df,
        empty_dataframe
    ):
        """Test mixed states: some data available, some empty, some None."""
        mock_info.return_value = mock_ticker_info
        mock_calendar.return_value = None
        mock_news.return_value = None
        # First call (recommendations) returns data, second call (upgrades) returns empty
        mock_analyst.side_effect = [sample_recommendations_df, empty_dataframe]
        
        result = get_ticker_data("AAPL")
        
        # Should have info and recommendations, but NOT upgrades_downgrades
        assert "info" in result
        assert "recommendations" in result
        assert "upgrades_downgrades" not in result
        assert "data" in result["recommendations"]
    
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_no_ticker_info_raises_error(self, mock_info):
        """Test that missing ticker info raises ValueError."""
        mock_info.return_value = None
        
        with pytest.raises(ValueError, match="No information available for INVALID"):
            get_ticker_data("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_empty_ticker_info_raises_error(self, mock_info):
        """Test that empty ticker info raises ValueError."""
        mock_info.return_value = {}
        
        with pytest.raises(ValueError, match="No information available for INVALID"):
            get_ticker_data("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_analyst_data')
    @patch('investor_agent.yfinance_utils.get_news')
    @patch('investor_agent.yfinance_utils.get_calendar')
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_essential_fields_filtering(
        self, 
        mock_info, 
        mock_calendar, 
        mock_news, 
        mock_analyst,
        mock_ticker_info
    ):
        """Test that only essential fields are included in the response."""
        # Add some non-essential fields to the mock data
        extended_info = {**mock_ticker_info, 'nonEssentialField': 'should be filtered out'}
        mock_info.return_value = extended_info
        mock_calendar.return_value = None
        mock_news.return_value = None
        mock_analyst.return_value = None
        
        result = get_ticker_data("AAPL")
        
        # Verify essential fields are present
        essential_fields = {'symbol', 'longName', 'currentPrice', 'marketCap', 'trailingPE'}
        for field in essential_fields:
            if field in mock_ticker_info:  # Only check if it was in our mock data
                assert field in result["info"], f"Essential field {field} missing"
        
        # Verify non-essential fields are filtered out
        assert 'nonEssentialField' not in result["info"]
    
    @patch('investor_agent.yfinance_utils.get_analyst_data')
    @patch('investor_agent.yfinance_utils.get_news')
    @patch('investor_agent.yfinance_utils.get_calendar')
    @patch('investor_agent.yfinance_utils.get_ticker_info')
    def test_limits_respected(
        self, 
        mock_info, 
        mock_calendar, 
        mock_news, 
        mock_analyst,
        mock_ticker_info,
        sample_recommendations_df
    ):
        """Test that max limits are passed to underlying functions."""
        mock_info.return_value = mock_ticker_info
        mock_calendar.return_value = None
        mock_news.return_value = []
        mock_analyst.return_value = sample_recommendations_df
        
        get_ticker_data("AAPL", max_news=10, max_recommendations=15, max_upgrades=20)
        
        # Verify the limits were passed to the functions
        mock_news.assert_called_with("AAPL", limit=10)
        assert mock_analyst.call_count == 2
        mock_analyst.assert_any_call("AAPL", "recommendations", 15)
        mock_analyst.assert_any_call("AAPL", "upgrades", 20)