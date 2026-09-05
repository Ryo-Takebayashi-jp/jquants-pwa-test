# v7e-alpha31 Technical Parity Final Fix

## 原因
PC版 `screening.py` は `_adjusted_entries()` で株価OHLCをAdjFactor補正しますが、
出来高は補正済み配列からではなく、保持された元のrowから `Vo / Volume` を読みます。

そのためPC版:
- 株価: 最新基準へ調整
- 出来高: raw Volume

Web版alpha30:
- 株価: 調整後
- 出来高: `COALESCE(adj_volume, volume)`

6834 精工技研のようにAdjustment Volumeがraw Volumeと異なる銘柄で、
`LatestVolumeRatioTo20D` が大きく乖離していました。

## alpha31
Web Screeningの出来高をraw `volume`へ統一。
alpha30のRSI修正と欠損出来高除外はそのまま維持。

## 実機確認
修正版PCの2026-09-01 `screening_candidates.csv` を使って再突合。
目標:
- 92銘柄比較
- 全比較項目一致 92
- 不一致 0
- RSI14 92/92
- LatestVolumeRatioTo20D 92/92
- High/Low 20D/60D 92/92
