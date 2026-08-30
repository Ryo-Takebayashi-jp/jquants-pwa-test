# J-Quants Local-first PWA v7c

目的:
PoC v6で1.12GB付近で落ちた旧sql.js方式を捨て、
レスキューSQLiteをCloudflare側OPFSへストリーミングImportし、
公式 @sqlite.org/sqlite-wasm のOPFS VFSで直接開く。

## テスト
1. Cloudflare Pagesへ7ファイルをCommit/Deploy
2. iPhoneでv7cを開く
3. 前提確認
4. Filesから1.12GBレスキューSQLiteを選択
5. OPFSへStreaming Import
6. SQLite-WASM Direct Open
7. 任意で quick_check
8. 総合判定

## 重要
- ImportはFile.stream() -> OPFS WritableStream
- DB全体をArrayBuffer化しない
- SQLiteはWorker + OPFS VFSでread-only open
- 元のFilesバックアップは変更しない
- v7cはAPI追記をしない。Direct Open成立確認のみ。

SQLite-WASM:
@sqlite.org/sqlite-wasm 3.53.0-build1
CDNからES Moduleとして読み込む。
