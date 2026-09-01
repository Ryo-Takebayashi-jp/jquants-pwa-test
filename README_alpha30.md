# v7e-alpha30 RSI / Volume Parity Fix

目的: alpha29で残った RSI14 1銘柄、LatestVolumeRatioTo20D 1銘柄の差をPC実装に合わせて解消する。

- RSI14: Web parity計算の履歴を100日から320営業日へ拡張。
- Volume: 欠損を0へ変換せずnullとして保持し、PC版と同じく直近20セッションの欠損を除外して平均。
- Low20D/Low60Dはalpha29/PC alpha26a4修正後の正しい調整後安値定義を維持。

実機では修正版PCの `screening_candidates.csv` を使って再度「PC版とWeb版を突合」を実行する。
