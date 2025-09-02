# Testing Guide

This project uses pytest for testing with comprehensive coverage of all MCP tools.

## Installation

Install test dependencies:

```bash
uv add --group test pytest pytest-mock pytest-asyncio pytest-cov
```

Or install with the test optional dependencies:

```bash
uv install -e ".[test]"
```

## Running Tests

### Run all tests
```bash
uv run pytest
```

### Run with coverage
```bash
uv run pytest --cov=investor_agent --cov-report=html
```

### Run specific test files
```bash
uv run pytest tests/test_ticker_data.py
uv run pytest tests/test_options.py
```

### Run tests with specific markers
```bash
uv run pytest -m unit          # Run only unit tests
uv run pytest -m "not slow"    # Skip slow tests
```

### Verbose output
```bash
uv run pytest -v
```

## Test Structure

- `tests/conftest.py` - Shared fixtures and test configuration
- `tests/test_ticker_data.py` - Tests for get_ticker_data tool (focuses on DataFrame boolean bug)
- `tests/test_options.py` - Tests for get_options tool
- `tests/test_market_movers.py` - Tests for get_market_movers tool
- `tests/test_sentiment.py` - Tests for sentiment analysis tools (Fear & Greed indices)
- `tests/test_financial_data.py` - Tests for financial data tools

## Key Test Categories

### DataFrame Boolean Evaluation Tests
The most critical tests are in `test_ticker_data.py` which specifically test the DataFrame boolean evaluation issue we fixed:

- `test_empty_dataframe_handling()` - Tests empty DataFrames don't cause crashes
- `test_none_dataframe_handling()` - Tests None returns are handled properly  
- `test_mixed_dataframe_states()` - Tests mixed scenarios

These tests would have caught the original bug where walrus operators tried to evaluate DataFrames in boolean context.

### Edge Case Testing
All test files include comprehensive edge case testing:

- Empty responses
- Error conditions  
- Rate limiting scenarios
- Invalid inputs
- Missing data

### Async Testing
Tests for async functions use `pytest-asyncio` with proper mocking of HTTP clients and external APIs.

## Mocking Strategy

Tests use `unittest.mock.patch` to mock:

- `yfinance_utils` functions to avoid real API calls
- HTTP clients for external APIs
- DataFrame responses to test edge cases

## Coverage Goals

Aim for >90% code coverage on:
- All MCP tool functions in `server.py`  
- Error handling paths
- DataFrame boolean evaluation logic
- Input validation

Run coverage report:
```bash
uv run pytest --cov=investor_agent --cov-report=html
open htmlcov/index.html
```

## Continuous Integration

Add to your CI pipeline:
```yaml
- name: Run tests
  run: uv run pytest --cov=investor_agent --cov-fail-under=90
```

This ensures the DataFrame boolean evaluation bug and similar issues are caught before release.