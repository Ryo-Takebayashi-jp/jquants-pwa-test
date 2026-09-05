# J-Quants Local-first Web/PWA

Local-first PWA for maintaining a user-owned J-Quants DataLake and running investment-analysis layers on iPhone/desktop browsers. Market data remains local to the user; Web daily operation is designed around the top-level **「次の取引日を全データ更新」** action.

## Current architecture
- SQLite WASM / OPFS SAH Pool
- Catalog + sharded databases + lazy open
- Private state in `/jq_private_v1.sqlite`
- Daily DataLake update with resumable / repairable supply-demand refresh
- Diagnostic CSV exports for parity and root-cause investigation

## Verified migration layers
- Screening: PC/Web exact candidate + PrimaryStrategy parity baseline reached
- Discovery Episode performance: exact migration parity reached
- Discovery Daily current-as-of engine: 42-column exact parity baseline reached
- Watchlist master/state: exact migration parity reached
- Factor / Seasonality: final compatibility hardening; Web-only valid data enrichment is preserved rather than discarded solely for exact PC equality

## Development direction
PC is a reference implementation during migration, not a permanent product ceiling. After the remaining core semantics are validated, development moves to Web-first operation, with parity retained only where it is useful for regression and migration checks.

## Documentation
- `CURRENT.md` — current release
- `INDEX.md` — documentation/history index
- `history/alphaXX-alphaYY.md` — consolidated milestone-range development history
- root `CHANGELOG.md` — chronological human-readable changes
- root `release_history.json` — machine-readable release history


## Watchlist alerts
Web-first Watchlist Re-Evaluation Alert is available from alpha88; alpha89 canonicalizes the financial fingerprint used for Fundamental change detection. Preview is non-destructive; explicit commit persists trigger state and alert history. Alerts request re-evaluation and are not buy signals.


From alpha90, `investment_tracking_input.csv` is no longer audit-only: it uses Preview → Commit, resolves objective reference prices from the Web DataLake, and atomically updates the separate Discovery and Watchlist lifecycles. REMOVE/CLOSE never delete Discovery history.
