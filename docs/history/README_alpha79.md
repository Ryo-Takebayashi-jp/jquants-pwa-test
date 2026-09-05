# v7e-alpha79 — JST/UTC date scan fix

## 原因
`isoDays()` が `new Date("YYYY-MM-DDT00:00:00")`（端末ローカル時刻）を作った後に `toISOString()` へ変換していたため、日本時間では日付が1日前へずれていました。

例: 2026-08-31 ～ 2026-09-03 を指定しても、JST端末では API 照会日が 2026-08-30 ～ 2026-09-02 になっていました。
そのため9/3の大口空売り開示をWebだけ取り込めず、Discovery Dailyの基準日Supply 16セル差が残る原因になりました。

## 修正
- ISO日付をUTCの年月日演算だけで進める純粋な日付helperへ変更。
- `isoDays` / `isoWeekdays` / 信用残の金曜判定 / 最上段一括更新 / 旧5日同期を同じ日付意味論へ統一。
- Screeningの既定基準日も端末ローカル日付を使用。
- Screening / Discoveryのスコア・計算式そのものには変更なし。

## 実機確認
1. alpha79をデプロイ。
2. 最上段「次の取引日を全データ更新」を1回押す（新規日足なしでも9/3の任意データを再確認）。
3. Discovery Daily計算エンジンを再計算・Parity。
4. Supplyが残る場合のみ差分診断CSVと大口空売り診断CSVを再出力。
