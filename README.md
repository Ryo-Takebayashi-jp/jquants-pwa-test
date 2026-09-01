# J-Quants Local-first PWA v7e-alpha6

## テスト順
1. ⓪A Worker常駐Runtimeを2回確認
2. PASSなら ① Catalog + bars_recent を作成
3. PASSなら ② Catalog経由で bars_recent を再Open

⓪Bはalpha5でPASS済みなので省略可。

今回、既存コードが既にsqlite3/poolを変数キャッシュしていたことも再確認し、
初期化競合を防ぐsingleton Promiseへ強化しています。
既存1.12GB DataLakeには新Catalog診断から触りません。
