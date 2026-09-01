# v7e-alpha27 — Parity Split + RSI Definition Fix

- 「マイ銘柄PC/Web突合」と「新規発掘候補の計算値突合」を分離。
- My StocksはPC JQP `technical_snapshot.csv` と比較。
- Discovery ScreeningはPC `screening_candidates.csv` の候補銘柄についてWeb計算値を比較。
- Screening候補92銘柄の選定一致テストとは明確に区別。
- RSI14を単純14日平均方式からWilder smoothing方式へ変更し、PC定義への一致を再検証。
- Close/MA/Return等alpha26で92/92一致した項目は回帰確認対象として維持。
