# v7e-alpha80 — Watchlist / Investment Tracking migration baseline

## Purpose
Freeze the already-PASSed Screening / Discovery layers and start the independent Watchlist lifecycle without guessing or rebuilding state.

## Added
1. `⑧ Watchlist / Investment Tracking 移行・Parity`
2. Import PC `private/Watchlist/master/watchlist_master.csv` and `private/Watchlist/state/watchlist_state.csv`.
3. Store full rows in Web private DB and round-trip compare every PC field.
4. Export Web master/state snapshots for audit/backup.
5. Validate and route canonical `investment_tracking_input.csv` according to PC alpha25 semantics.

## Important boundary
This release does **not** generate Re-Evaluation Alerts yet. PC Watchlist alerts depend on Sector Factor / Seasonality state. Those values must first be reproduced natively on Web; otherwise an apparent alert parity could be a false match.

## Test
- Deploy alpha80.
- In ⑧ select PC `watchlist_master.csv` and `watchlist_state.csv`.
- Press `PC Watchlist master/stateをWebへ移行・照合`.
- Expected: exact PASS for master/state.

PC file locations:
- `private/Watchlist/master/watchlist_master.csv`
- `private/Watchlist/state/watchlist_state.csv`
