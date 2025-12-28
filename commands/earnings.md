---
description: Check earnings calendar for upcoming reports
arguments:
  - name: date
    description: Date to check (YYYY-MM-DD format, defaults to today)
    required: false
---

# Earnings Calendar

Check which companies are reporting earnings.

## Get Earnings Data

1. **Get Nasdaq earnings calendar** for the specified date (or today if not specified)
   - Date: $1

2. For any notable large-cap companies reporting, optionally get their **earnings history** to show beat/miss patterns

## Output

Present the earnings calendar in a clear format:
- Company name and ticker
- Time of report (Before Market Open / After Market Close)
- Expected EPS if available
- Notable companies to watch
