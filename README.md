# v7e-alpha22 — Production Auto Gap Operations

本番UIを「日次更新 / 抜けチェック / 抜け自動補完」に整理。

- 抜けチェック: 全年別Shardの内部日付を走査し、存在しない平日を候補化
- 自動補完: 候補日だけJ-Quants V2へ照会
- 祝日・休場日: API 0件として除外
- 実取引日の欠損: canonical year shardへUPSERTし検証
- 途中停止後も①→②再実行可能
- 旧移行・Catalog詳細・個別Gap操作は開発者診断へ収納
