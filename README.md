# v7e-alpha28 — RSI / High-Low parity fix

alpha27実機結果から判明したテクニカル定義差を修正。

- All-market Screening Coreに残っていた旧RSI14実装を修正。
- My Stocks / Screening CoreのRSI14をWilder smoothingへ統一。
- High20D / Low20D / High60D / Low60Dを終値max/minではなく調整後の日中高値・安値で計算。
- adjusted H/L欠損時はraw H/L、それも無い場合のみcloseへfallback。

確認ポイント:
1. screening_candidates.csv再突合
2. RSI14の一致率
3. High/Low 20D/60Dの一致率
4. LatestVolumeRatioTo20D 91/92の残り1銘柄
5. technical_snapshot.csv再突合（テストNTTのPC側欠損1件は正常）
