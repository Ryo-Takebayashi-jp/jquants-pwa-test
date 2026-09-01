# CHANGELOG

## v7e-alpha55 — 2026-09-01
- PC版Screeningの母集団フィルタを移植: プライム/スタンダード/グロース、普通株011、20日平均売買代金5000万円以上、株価100円以上、履歴60日以上。
- PC `_rank_scores` のpercentile式を完全再現。欠損rankは中立50ではなくNone。
- PositionVs60DHighPct / AverageTradingValue20D / VolumeRatio5To20 / MACDHistogramChange5D をWebテクニカルへ追加。
- PC `_financial_features` に寄せ、前年同期330-400日、FY forecast matching、ActualEPS/BPS/ROE/EquityRatio/CFO/FCF/配当/EffectiveSharesを強化。
- PriceRecognitionScoreにHighPositionScoreを追加。
- QVRのSector33相対ForecastPER/PBR/配当利回り、Quality、ReRatingを実装。
- PEDは偽proxyを廃止。真の決算イベント窓を次工程で実装するまでNone。
- Screening専用「不足している財務履歴だけ取得」を追加。2025-01-01以降の未取得平日のみ照会。
