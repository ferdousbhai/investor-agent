"""Tests for get_options tool."""

import pytest
import pandas as pd
from unittest.mock import patch

from investor_agent.server import get_options


class TestGetOptions:
    """Test the get_options tool."""
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_successful_options_retrieval(self, mock_filtered_options, sample_options_df):
        """Test successful retrieval of options data."""
        mock_filtered_options.return_value = (sample_options_df, None)
        
        result = get_options("AAPL", num_options=3)
        
        # Verify the result structure
        assert "data" in result
        assert "columns" in result
        assert "index" in result
        
        # Verify data content
        assert len(result["data"]) == 3  # Limited to num_options
        mock_filtered_options.assert_called_once_with(
            "AAPL", None, None, None, None, None
        )
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_options_with_filters(self, mock_filtered_options, sample_options_df):
        """Test options retrieval with all filters applied."""
        mock_filtered_options.return_value = (sample_options_df, None)
        
        result = get_options(
            ticker_symbol="AAPL",
            num_options=5,
            start_date="2024-01-01",
            end_date="2024-12-31", 
            strike_lower=140.0,
            strike_upper=160.0,
            option_type="C"
        )
        
        assert "data" in result
        mock_filtered_options.assert_called_once_with(
            "AAPL", "2024-01-01", "2024-12-31", 140.0, 160.0, "C"
        )
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_empty_options_dataframe(self, mock_filtered_options):
        """Test handling of empty options DataFrame."""
        empty_df = pd.DataFrame()
        mock_filtered_options.return_value = (empty_df, None)
        
        result = get_options("AAPL")
        
        # Should still return proper structure, just with empty data
        assert "data" in result
        assert "columns" in result
        assert "index" in result
        assert len(result["data"]) == 0
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_options_error_handling(self, mock_filtered_options):
        """Test error handling when options retrieval fails."""
        mock_filtered_options.return_value = (None, "No options available")
        
        with pytest.raises(ValueError, match="No options available"):
            get_options("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_options_limit_respected(self, mock_filtered_options, sample_options_df):
        """Test that num_options limit is respected."""
        # Create a larger sample dataset
        large_df = pd.concat([sample_options_df] * 5, ignore_index=True)  # 15 rows
        mock_filtered_options.return_value = (large_df, None)
        
        result = get_options("AAPL", num_options=7)
        
        # Should be limited to 7 rows
        assert len(result["data"]) == 7
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_puts_option_type(self, mock_filtered_options, sample_options_df):
        """Test requesting puts specifically."""
        mock_filtered_options.return_value = (sample_options_df, None)
        
        result = get_options("AAPL", option_type="P")
        
        mock_filtered_options.assert_called_once_with(
            "AAPL", None, None, None, None, "P"
        )
        assert "data" in result
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_date_range_filtering(self, mock_filtered_options, sample_options_df):
        """Test date range filtering."""
        mock_filtered_options.return_value = (sample_options_df, None)
        
        result = get_options(
            "AAPL", 
            start_date="2024-03-01", 
            end_date="2024-06-30"
        )
        
        mock_filtered_options.assert_called_once_with(
            "AAPL", "2024-03-01", "2024-06-30", None, None, None
        )
        assert "data" in result
    
    @patch('investor_agent.yfinance_utils.get_filtered_options')
    def test_strike_range_filtering(self, mock_filtered_options, sample_options_df):
        """Test strike price range filtering."""
        mock_filtered_options.return_value = (sample_options_df, None)
        
        result = get_options(
            "AAPL",
            strike_lower=145.0,
            strike_upper=155.0
        )
        
        mock_filtered_options.assert_called_once_with(
            "AAPL", None, None, 145.0, 155.0, None
        )
        assert "data" in result