# CHANGELOG

## v7e-alpha31 — 2026-09-01
- PC/Web日足テクニカルParityの最終残差を修正。
- Web Screeningの出来高系列を `COALESCE(adj_volume, volume)` からPC版と同じ raw `volume` に変更。
- PC版 `technical._adjusted_entries()` はOHLCだけをAdjFactorで最新基準へ補正し、Screeningの出来高は元rowの `Vo/Volume` をそのまま使用するため、この挙動へ統一。
- alpha30のWilder RSI長期履歴化・欠損Volume除外平均は維持。
- 画面/Workerのバージョン表記とcache-bustを v7e-alpha31 に更新。
- Low20D/60Dは修正済PC版と同じ「調整後安値の期間最小値」を維持。
