# CHANGELOG

## v7e-alpha51 — 2026-09-01
- Screening統合母集団のMaster 0/4167を修正。
- 原因: equities_masterの実カラム名とScreening側SELECT名が不一致。
- market_name / sector17_name / sector33_name / margin_name をAS aliasで共通形式へ変換。
- 母集団CSV書き出し不反応を修正。downloadBlob(blob,fileName)の引数順を修正。
- UTF-8 BOM付きCSV + 書き出し完了表示。
- Screening統合母集団/Core1をページ上部「Screening 開発エリア」へ集約。
