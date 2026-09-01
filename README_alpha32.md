# v7e-alpha32 Equities Master Shard

日足テクニカル移植完了後の第2データ層。

実機テスト:
1. 既存のJ-Quants APIキーを入力。
2. 「② 銘柄マスター Shard」で基準日 2026-09-01。
3. 「銘柄マスターを取得・保存」。
4. PASS / API rows / 保存 rows / quick_check=ok を確認。

保存先: `/jq_equities_master_v1.sqlite`
Catalog key: `equities_master`

次工程ではPC版SecurityMasterとの列・銘柄集合Parityを確認し、その後Financials Shardへ進む。
