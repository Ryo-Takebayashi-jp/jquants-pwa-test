# v7e-alpha26 — My Stocks Analysis + PC/Web Screening Parity

## マイ銘柄分析
private DB `user_stocks` と Screening Core 1 を接続。
登録銘柄だけを基準日で分析し、Close / 損益率 / MA25 / MA25乖離 / Return20D / RSI14 / 出来高20日比を表示。

## PC / Web Parity
PC版 `screening_candidates.csv` を読み込み、NormalizedCodeでWeb Core 1とJOIN。
同一基準日で以下を比較:
- Close
- MA5 / MA25 / MA75
- MA25 / MA75 Deviation
- Return5D / Return20D
- RSI14
- LatestVolumeRatioTo20D
- High / Low 20D
- High / Low 60D

Web Coreはadjusted close / adjusted volumeを優先し、PC版のadjusted-basis technicalsに寄せた。
不一致銘柄・不一致項目だけを表示するため、今後の回帰テストにも使える。
