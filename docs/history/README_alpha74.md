# v7e-alpha74 — next trading day all-data update

Adds a production-oriented one-click daily advance operation without changing Screening or Discovery parity calculations.

The button derives the current bars DataLake coverage end, searches forward (up to today) for the next date with delivered J-Quants daily bars, and uses that date as the transaction anchor. It then updates bars, equities master, financial summary, earnings calendar, TOPIX, market calendar, five Standard supply-demand datasets, and supply normalization.

The operation stops before secondary datasets if no new daily bars are available. Plan-dependent supply datasets are treated as optional and reported separately.
