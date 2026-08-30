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


## Formal release-history management (added 2026-08-30)

From v7c-r1, release history is managed in three layers:

1. `CHANGELOG.md` — human-readable history
2. `release_history.json` — machine-readable history
3. Web/PWA UI — recent releases + build metadata

UI build metadata:
- Version: v7c-r1
- Build date: 2026-08-30
- Schema version: market-poc7c
- Migration version: history-1

Desktop/J-Quants Converter historical baseline entries are also included in the unified logical history.
Future desktop packages should ship the same two history files and append desktop releases rather than overwrite them.


## v7c-r2

v7c-r1 の `Worker error` 切り分け版。

Cloudflare Pages Functions の `/sqlite/*` を使い、公式 `@sqlite.org/sqlite-wasm@3.53.0-build1`
の `index.mjs` / `sqlite3.wasm` / `sqlite3-opfs-async-proxy.js` をブラウザからは
`jquants-pwa-test.pages.dev` の同一オリジン資産として読み込みます。

テスト順:
1. 前提確認
2. 既にv7c-r1で1.12GB Import済みなら再Import不要
3. 「SQLite assetsを確認」
4. 3資産すべてPASSなら Direct Open
5. エラー時は Stage と詳細をスクショ


## v7c-r5

r2は同一オリジン配信を確定できたものの、DB Open前のSQLite初期化でFAIL。
r3ではSQLite 3.53で追加された `opfs-wl` に絞って初期化します。

- classic `opfs` は事前にdisable
- `opfs-wl` のみenable
- `Atomics.waitAsync` / Web Locksを確認
- `locateFile` で `/sqlite/sqlite3.wasm` を明示
- 先に「Initだけ実行」
- Init PASS後に Direct Open
- 1.12GB DBの再Importは不要

推奨順:
1. SQLite assetsを確認
2. SQLite-WASM Initだけ実行
3. PASSなら Direct Open
4. quick_checkはDirect Open PASS後のみ


## v7c-r6
巨大DBの前にSAH Pool自体の読み書き・Worker跨ぎ永続化を小型DBで検証します。r5のDirect Open FAILは、SAH Pool側に1.12GB DBがまだImportされていない場合にも発生します。r6では手順を明確化しました。
