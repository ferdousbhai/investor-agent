"""Tests for financial data tools (price history, financial statements, institutional holders, etc.)."""

import pytest
import pandas as pd
from unittest.mock import patch

from investor_agent.server import (
    get_price_history, 
    get_financial_statements, 
    get_institutional_holders,
    get_earnings_history,
    get_insider_trades
)


class TestFinancialDataTools:
    """Test financial data retrieval tools."""
    
    @patch('investor_agent.yfinance_utils.get_price_history')
    def test_price_history_success(self, mock_price_history, sample_price_history):
        """Test successful price history retrieval."""
        mock_price_history.return_value = sample_price_history
        
        result = get_price_history("AAPL", period="1mo")
        
        assert "data" in result
        assert "columns" in result
        assert "index" in result
        assert len(result["data"]) == 5  # 5 days of data
        
        mock_price_history.assert_called_once_with("AAPL", "1mo", "1d")
    
    @patch('investor_agent.yfinance_utils.get_price_history')
    def test_price_history_long_period_uses_monthly_interval(self, mock_price_history, sample_price_history):
        """Test that long periods use monthly intervals."""
        mock_price_history.return_value = sample_price_history
        
        result = get_price_history("AAPL", period="5y")
        
        # Should use monthly interval for 5y period
        mock_price_history.assert_called_once_with("AAPL", "5y", "1mo")
    
    @patch('investor_agent.yfinance_utils.get_price_history')
    def test_price_history_short_period_uses_daily_interval(self, mock_price_history, sample_price_history):
        """Test that short periods use daily intervals.""" 
        mock_price_history.return_value = sample_price_history
        
        result = get_price_history("AAPL", period="1d")
        
        # Should use daily interval for 1d period
        mock_price_history.assert_called_once_with("AAPL", "1d", "1d")
    
    @patch('investor_agent.yfinance_utils.get_price_history')
    def test_price_history_no_data(self, mock_price_history):
        """Test error handling when no price history is available."""
        mock_price_history.return_value = None
        
        with pytest.raises(ValueError, match="No historical data found for INVALID"):
            get_price_history("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_price_history')
    def test_price_history_empty_dataframe(self, mock_price_history):
        """Test error handling when empty DataFrame is returned."""
        mock_price_history.return_value = pd.DataFrame()
        
        with pytest.raises(ValueError, match="No historical data found for INVALID"):
            get_price_history("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_financial_statements')
    def test_financial_statements_success(self, mock_statements):
        """Test successful financial statements retrieval."""
        statements_df = pd.DataFrame({
            '2024-Q1': [1000000, 500000, 300000],
            '2023-Q4': [900000, 450000, 250000],
            '2023-Q3': [850000, 400000, 200000]
        }, index=['Revenue', 'Gross Profit', 'Net Income'])
        
        mock_statements.return_value = statements_df
        
        result = get_financial_statements("AAPL", statement_type="income", frequency="quarterly")
        
        assert "data" in result
        assert "columns" in result
        assert "index" in result
        assert len(result["columns"]) == 3  # 3 quarters
        
        mock_statements.assert_called_once_with("AAPL", "income", "quarterly")
    
    @patch('investor_agent.yfinance_utils.get_financial_statements')
    def test_financial_statements_max_periods_limit(self, mock_statements):
        """Test that max_periods limits the columns returned."""
        # Create DataFrame with many columns
        many_periods = {f'2024-Q{i}': [1000000, 500000] for i in range(1, 15)}  # 14 quarters
        statements_df = pd.DataFrame(many_periods, index=['Revenue', 'Gross Profit'])
        
        mock_statements.return_value = statements_df
        
        result = get_financial_statements("AAPL", max_periods=5)
        
        # Should be limited to 5 periods
        assert len(result["columns"]) == 5
    
    @patch('investor_agent.yfinance_utils.get_financial_statements')
    def test_financial_statements_no_data(self, mock_statements):
        """Test error handling when no financial data is available."""
        mock_statements.return_value = None
        
        with pytest.raises(ValueError, match="No income statement data found for INVALID"):
            get_financial_statements("INVALID", statement_type="income")
    
    @patch('investor_agent.yfinance_utils.get_financial_statements')
    def test_financial_statements_empty_dataframe(self, mock_statements):
        """Test error handling when empty DataFrame is returned."""
        mock_statements.return_value = pd.DataFrame()
        
        with pytest.raises(ValueError, match="No balance statement data found for INVALID"):
            get_financial_statements("INVALID", statement_type="balance")
    
    @patch('investor_agent.yfinance_utils.get_institutional_holders')
    def test_institutional_holders_success(self, mock_holders):
        """Test successful institutional holders retrieval."""
        inst_df = pd.DataFrame({
            'Holder': ['Vanguard', 'BlackRock', 'State Street'],
            'Shares': [100000000, 90000000, 80000000],
            'Date Reported': ['2024-01-01', '2024-01-01', '2024-01-01']
        })
        
        fund_df = pd.DataFrame({
            'Holder': ['Fund A', 'Fund B'],
            'Shares': [5000000, 4000000],
            'Date Reported': ['2024-01-01', '2024-01-01']
        })
        
        mock_holders.return_value = (inst_df, fund_df)
        
        result = get_institutional_holders("AAPL", top_n=20)
        
        assert "institutional_holders" in result
        assert "mutual_fund_holders" in result
        assert "data" in result["institutional_holders"]
        assert "data" in result["mutual_fund_holders"]
        
        mock_holders.assert_called_once_with("AAPL", 20)
    
    @patch('investor_agent.yfinance_utils.get_institutional_holders')
    def test_institutional_holders_partial_data(self, mock_holders):
        """Test when only institutional holders data is available."""
        inst_df = pd.DataFrame({
            'Holder': ['Vanguard'], 
            'Shares': [100000000]
        })
        
        mock_holders.return_value = (inst_df, None)  # No mutual fund data
        
        result = get_institutional_holders("AAPL")
        
        assert "institutional_holders" in result
        assert "mutual_fund_holders" not in result
    
    @patch('investor_agent.yfinance_utils.get_institutional_holders')
    def test_institutional_holders_no_data(self, mock_holders):
        """Test error handling when no institutional holder data is available."""
        mock_holders.return_value = (None, None)
        
        with pytest.raises(ValueError, match="No institutional holder data found for INVALID"):
            get_institutional_holders("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_institutional_holders')
    def test_institutional_holders_empty_dataframes(self, mock_holders):
        """Test error handling when empty DataFrames are returned."""
        mock_holders.return_value = (pd.DataFrame(), pd.DataFrame())
        
        with pytest.raises(ValueError, match="No institutional holder data found for INVALID"):
            get_institutional_holders("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_earnings_history')
    def test_earnings_history_success(self, mock_earnings):
        """Test successful earnings history retrieval."""
        earnings_df = pd.DataFrame({
            'Date': ['2024-01-01', '2023-10-01', '2023-07-01'],
            'EPS Actual': [1.50, 1.40, 1.35],
            'EPS Estimate': [1.45, 1.38, 1.32]
        })
        
        mock_earnings.return_value = earnings_df
        
        result = get_earnings_history("AAPL", max_entries=8)
        
        assert "data" in result
        assert len(result["data"]) == 3
        
        mock_earnings.assert_called_once_with("AAPL", limit=8)
    
    @patch('investor_agent.yfinance_utils.get_earnings_history')
    def test_earnings_history_no_data(self, mock_earnings):
        """Test error handling when no earnings history is available."""
        mock_earnings.return_value = None
        
        with pytest.raises(ValueError, match="No earnings history data found for INVALID"):
            get_earnings_history("INVALID")
    
    @patch('investor_agent.yfinance_utils.get_insider_trades')
    def test_insider_trades_success(self, mock_trades):
        """Test successful insider trades retrieval."""
        trades_df = pd.DataFrame({
            'Date': ['2024-01-01', '2024-01-02'],
            'Insider': ['John Smith', 'Jane Doe'],
            'Transaction': ['Buy', 'Sell'],
            'Shares': [1000, 500]
        })
        
        mock_trades.return_value = trades_df
        
        result = get_insider_trades("AAPL", max_trades=20)
        
        assert "data" in result
        assert len(result["data"]) == 2
        
        mock_trades.assert_called_once_with("AAPL", limit=20)
    
    @patch('investor_agent.yfinance_utils.get_insider_trades')
    def test_insider_trades_no_data(self, mock_trades):
        """Test error handling when no insider trading data is available."""
        mock_trades.return_value = None
        
        with pytest.raises(ValueError, match="No insider trading data found for INVALID"):
            get_insider_trades("INVALID")