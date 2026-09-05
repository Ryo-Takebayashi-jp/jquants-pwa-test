# v7e-alpha85 — Factor FY baseline parity fix / docs normalization

## Factor / Seasonality
- Fix Web `ForecastPrimaryProfitGrowthPct` prior-FY resolver to match the PC `_previous_fy()` meaning exactly.
- Previous FY matching now uses `CurFYEn` first and `CurPerEn` only as fallback.
- `FactorPreviousFYEnd` diagnostics use the same field order.
- Bump the Factor engine state to `FactorWebV5-alpha85` so Strength history is safely reseeded after the membership correction.
- Web-only valid market-cap / reported-ROE observations are intentionally retained; they are treated as explainable Web enrichment rather than discarded only to force PC equality.

## Documentation / release history
- Move all `README_alpha*.md` files out of the ZIP root into `docs/history/`.
- Refresh `docs/README.md`, `docs/CURRENT.md`, and `docs/INDEX.md`.
- Normalize `release_history.json` to one chronological `history` array and remove the duplicate `releases` branch.
- Keep the ZIP root focused on runtime files plus `CHANGELOG.md` and `release_history.json`.

## Migration
No destructive schema migration. Existing OPFS/DataLake/private state is preserved. Factor state is engine-versioned and will reseed once.
