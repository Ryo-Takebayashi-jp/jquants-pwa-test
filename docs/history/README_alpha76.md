# J-Quants Local-first PWA v7e-alpha76

2026-09-02 / Discovery Daily diagnostic parity

## 目的
alpha75で基準日差が Technical=12 / Supply=18 まで縮小した後、更新版を増やさず残差を掘れるよう診断出力を強化する。

## 変更
- 固定Daily CSVとWeb計算エンジンCSVを分離。
- Discovery Daily差分診断CSVを追加。
- Technical差コードだけのbars/raw採用値診断CSVを追加。
- 大口空売りはPCと同じく各as-of日ごとの470日窓でsubject stateを復元。
- 空売りrawのdata_date/coverageを修正。旧DBの空欄data_dateもraw_jsonからcoverage復元。

## 実機確認
1. 既存のPC `discovery_episode_daily.csv` を選択。固定履歴はalpha75で移行済みなら再移行不要。
2. 「Discovery Daily計算エンジンを再計算・Parity」。
3. 基準日差分の Technical / Supply を確認。
4. 残差があれば「Discovery Daily差分診断CSV」を出力。Technicalが残れば「Webテクニカル入力診断CSV」も出力。

