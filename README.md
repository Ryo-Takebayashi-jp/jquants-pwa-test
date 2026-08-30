# J-Quants Local-first PWA PoC v4

目的:
10年分など時間のかかるDataLakeを、ホスティング先・ドメイン・端末変更時にも再取得せず持ち運べることを検証する。

## 追加機能
- 既存v3b DataLakeを継続利用
- schema_version を meta テーブルへ保存
- SQLite DataLakeのExport
- Export済みSQLiteのImport
- Import前 PRAGMA quick_check
- 必須テーブル検証
- legacy/poc3 → poc4-1 の簡易schema migration marker
- sync_log保持と次回差分開始日の確認
- Import後のLocal Screening
- DataLake削除の二段階確認

## 推奨テスト手順
1. GitHub Pagesへ5ファイルを上書き → Commit
2. iPhoneで v4 表示確認
3. 「DataLakeを開く / schema確認」
4. 「市場DataLakeをExport」してファイルへ保存
5. 「市場DataLakeを削除」→確認ボタンで削除
6. ExportしたSQLiteをファイル選択
7. 「検証してImport」
8. 「同期履歴・継続日を確認」
9. 「復元DBでScreening」
10. 総合判定

これが全部PASSすれば、GitHub Pagesから別ホスティングへ移っても、
SQLiteファイルをExport/Importして同期履歴ごと継続できることを実機確認できる。

## 今後
本番ではDBを分割:
- jq_market_datalake.sqlite: J-Quants再取得可能な市場データ
- jq_private.sqlite: Portfolio / Trades / Discovery / Watchlist 等

privateは市場DataLakeより強い削除確認・暗号化・バックアップを行う。
