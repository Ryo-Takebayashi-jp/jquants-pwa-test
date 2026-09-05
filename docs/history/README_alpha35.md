# v7e-alpha35 Supply/Demand API Strategy Fix

alpha34実機テストでJ-Quants API自身から返った400エラーを基に取得方式を修正。

- margin-interest: code/date必須 → 全市場では金曜日をdate指定して走査
- margin-alert: from/to利用時code必須 → 全市場では各平日をdate指定して走査
- short-ratio: range
- short-sale-report: disc_date_from / disc_date_to
- investor-types: range

実機確認:
⑦「需給5種をまとめて取得」を2026-08-01～2026-09-01で実行。
date走査は複数APIコールになるため、画面に進捗を表示します。
0件の日は異常ではありません。

なお、市場基礎の開始日は実機で確認した契約境界2016-09-01へ修正済み。
