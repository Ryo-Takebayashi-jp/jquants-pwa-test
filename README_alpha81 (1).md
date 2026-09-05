# v7e-alpha81 — Factor Monitor / Seasonality parity

## Purpose
Connect the Factor/Seasonality layer needed by Watchlist Re-Evaluation Alerts while keeping previously-passed Screening, Discovery and Watchlist state layers frozen.

## New test
Section **⑧-2 Factor Monitor / Seasonality Parity**.

Inputs:
- `factor_monitor_latest.csv` (required, from the PC `screening_YYYYMMDD.zip`)
- `factor_summary.csv` (optional, same ZIP)

Run **Factor / Seasonalityを再計算・Parity**. The Web side:
1. rebuilds the full Screening base if it is not already in memory,
2. independently recalculates FactorMonitorV1 core groups/metrics,
3. rebuilds SectorSeasonalityV1 from Web DataLake stock bars + TOPIX using years <= prior calendar year,
4. enriches current factor rows with SeasonState / alignment / seasonal alert,
5. compares PC/Web by field and optionally compares Factor Summary.

## Diagnostics
- Web Factor latest CSV
- Factor difference CSV (FactorKey / field / group / PC / Web)
- Full Web Sector Seasonality profile CSV

## StrengthChange1D bootstrap
On the very first Factor run, Web has no prior factor history. For this one field only, alpha81 infers the prior-day Strength baseline as `PC current Strength - PC StrengthChange1D`, then applies that baseline to the independently-computed Web current Strength. The current factor calculations are not copied from PC. After the run, Web stores the current factor state in `/jq_private_v1.sqlite`; subsequent dates use Web prior state.

## Expected first validation
PC 2026-09-03 currently contains 35 Factor Monitor rows. Candidate count is not hard-coded; compare the correctly recalculated set. If differences remain, export the factor diff CSV and seasonality profile before making another update.
