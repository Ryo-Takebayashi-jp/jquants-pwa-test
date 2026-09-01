# J-Quants Local-first PWA v7e-alpha9

alpha8でCatalog + Shards基本ライフサイクルがiPhone実機PASS。

今回は既存1.12GB DataLakeから最新5営業日だけをbars_recentへコピーします。
元DBはread-onlyで、削除・更新・ALTERしません。

実機では「③ Legacy DataLake → bars_recent 少量移行」を既定5日のまま実行してください。
PASS条件はsource/destination件数一致、営業日数一致、PRAGMA quick_check=okです。
