# J-Quants Local-first PWA v7e-alpha7

## 今回は⓪Pだけテスト
「⓪P SQLite未使用・Worker PINGを2回」を押してください。

- 2回ともPASS → Worker通信は正常。SQLite/SAH Pool初期化後のWorker状態が原因候補。
- 2回目で停止 → SQLiteと無関係にWorkerの複数メッセージ処理側が原因。
- 1回目から停止 → Worker通信/workerCall実装を最優先で修正。

このテストはSQLiteもSAH Poolも初期化せず、既存DataLakeにも触れません。
