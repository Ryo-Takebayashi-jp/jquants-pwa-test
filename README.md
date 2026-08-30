# J-Quants Local-first PWA v7a

目的:
PoC v6で1.12GB付近に達した際のSafari/WASMクラッシュを受け、
旧sql.js方式（DB全体をRAMへ読み込み、db.export()で全体保存）を廃止するための前提PoC。

今回の検証:
- Secure Context
- crossOriginIsolated
- SharedArrayBuffer
- OPFS
- Web Worker
- Worker内 createSyncAccessHandle
- 64MBファイルの先頭/中央/末尾へのランダム書込/読出
- 既存 jq_poc3_datalake.sqlite の軽量生存確認

重要:
既存market DB/private DBは変更しない。
Direct OPFSテストファイルは終了時に削除する。

GitHub PagesではCOOP/COEPレスポンスヘッダーを自由に設定できないため、
公式SQLite-WASM OPFS VFSの前提が未達になる可能性がある。
その場合でもDirect OPFS試験の成否を分けて確認する。
