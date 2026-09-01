# CHANGELOG

## v7e-alpha61 — QVR exactness / supply penalty diagnostics
- PC版 `QualityValueReRating` の `QVRCrowdingPenalty` 計算をWebへ移植。
- Webの信用週末残高Shardから `MarginLongChangePct1W` をScreening母集団へ自動結合。
- QVR共通銘柄について Score / Quality / Value / ReRating / penalty / valuation / CF / supply の差をParity結果へ表示。
- 需給データが無い場合は従来どおり欠損扱いとし、選抜処理自体は停止しない。
- alpha60の戦略別Top20境界診断を維持。
