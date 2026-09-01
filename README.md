# J-Quants Local-first PWA v7e-alpha4

## 今回の切り分け
alpha3ではCatalog + bars_recent作成が0.45秒でPASSしました。
一方、②再Openは `01-catalog-open` で停止。

今回は再Open時だけ `OpfsSAHPoolDb(..., "r")` を `"c"` に変更し、
iPhone/Safari + SAH Poolでread-onlyモードが停止要因かを確認します。

## テスト
Cloudflare Pagesへ配置後、
1. ① Catalog + bars_recent を作成（再作成でもOK）
2. ② Catalog経由で bars_recent を再Open
3. ②の結果とShard Open時間を確認

既存1.12GB DataLakeは新Catalog機能から触りません。
