# J-Quants Local-first PWA v7e-alpha14

## alpha13修正
SQLite公式仕様では `initialCapacity` はPoolが空の初回作成時だけ有効です。
既に6枠で作られた現在のPoolに `initialCapacity:32` を指定しても拡張されません。

alpha14ではWorker初期化時に

`await pool.reserveMinimumCapacity(32)`

を実行して、既存Poolを実際に32枠まで拡張します。
この変更は永続化され、既に32以上なら何もしません。

## 実機テスト
1. ⑤A Shard保存枠を確認
   - Actual capacity: 32 を確認
2. ⑥ 過去年を順番に一括移行

⑤Bは前回PASS済みなので省略可です。
Legacy DataLakeはread-onlyです。
