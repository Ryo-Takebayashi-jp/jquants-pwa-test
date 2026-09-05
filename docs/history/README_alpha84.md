# v7e-alpha84 — Factor FY baseline resolver / Parity graduation candidate

## Purpose
After refreshing the PC `screening_all.csv`, Factor residuals were reduced to three independent membership sources: Size data coverage, HighROE data coverage, and 11 PC-only `ForecastPrimaryProfitGrowthPct` observations.

## Changes
- Fix Web Factor forecast-growth baseline resolution for J-Quants V2 FY rows.  For a reported FY actual, `CurPerEn` is used before `CurFYEn` when locating the prior fiscal year against the forecast target year.
- Keep existing Screening/financial output semantics otherwise unchanged; the change is limited to the prior-FY comparator used by the Web financial normalizer.
- Add `FactorPreviousFYDisclosureDate`, `FactorPreviousFYEnd`, and `FactorPreviousFYPrimaryProfit` to the Factor financial diagnostic CSV.
- Bump Factor engine state to `FactorWebV4-alpha84`, forcing one safe Strength reseed after the membership correction.

## Expected interpretation
The 11 missing Web forecast-growth observations should recover.  If the remaining residuals are only the six Web-only market-cap/ROE observations (plus the resulting Size/HighROE rank effects), treat them as explained data-coverage differences rather than forcing Web to discard valid J-Quants observations.  That is the planned Factor/Seasonality Parity graduation point before Web-first development.
