# CHANGELOG

## v7e-alpha33 — 2026-09-01
- 開発ピッチを上げ、3工程を同梱。
- 銘柄マスターPC/Web Parityを追加（CompanyName / Market / Sector17 / Sector33 / MarginCategory）。
- J-Quants V2 `/fins/summary` の財務サマリーShardを追加。
- J-Quants V2 `/equities/earnings-calendar` の決算予定Shardを追加。
- 財務・決算予定はraw_jsonを完全保持して先にDataLakeを構築。PC列Parity確認後に正規化列を追加する方針。
- 新ShardはCatalogへcoverage/stateを登録。
- APIキーはセッションのみ、alpha32bの入力同期・再試行安全化を維持。
- alpha31の日足テクニカル完全Parityを維持。
