# J-Quants Local-first PWA v7e-alpha15

## 目的
Legacy DataLakeに欠けている2020〜2025を、旧巨大DBを作り直さず年別Shardへ直接補完します。

## 最初の実機テスト
1. APIキーを入力
2. 補完年は2025のまま
3. ⑦「1年分をAPI取得だけ確認」
4. PASSしたら⑧「1年分を年別Shardへ直接補完」

⑦はDBを書き換えません。
⑧もLegacy DataLakeは使用・変更せず、`jq_bars_2025_v1.sqlite` へ直接保存します。

2025年PASS後に2020〜2024の連続自動補完を追加します。
