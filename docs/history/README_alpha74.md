# J-Quants Local-first PWA v7e-alpha74

## 追加機能
Web版 DataLakeの最上段に「次の取引日を全データ更新」を追加しました。

- 日足DataLakeの最新日を読み取り、その次にJ-Quantsで配信済みの日足が存在する取引日を自動検出します。
- 週末・休場日は自動でスキップします。
- 検出した同一日について、日足、銘柄マスター、財務サマリー、決算予定、TOPIX、営業日カレンダー、Standard需給5種を順次取得・保存します。
- 需給5種の取得後、需給分析用正規化も自動実行します。
- 各カードの日付入力欄を対象日に自動同期します。翌日は同じボタンを押すだけで次の配信済み取引日へ進めます。
- 日足がまだ配信されていない場合は他データへ進まず、安全に「更新不要」で終了します。
- Plan依存の需給データが取得不能でも、主要DataLake更新は止めず、結果欄で該当項目だけNG表示します。

## 変更していないもの
Screening 5戦略、Discovery Episode、Discovery Dailyの計算・Parityロジックには変更を入れていません。

## 現在の基準点
- Screening: 2026-09-02 PC/Web 87/87 完全一致 PASS
- Discovery Episode Performance: 23/23 PASS
- Discovery Daily: 256/256行を比較中
