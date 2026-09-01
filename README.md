# J-Quants Local-first PWA v7e-alpha12

## 今回の本命
2026年の年別Shard移行が実機PASSしたため、Legacy DataLakeに収録されている全年度を自動検出し、
新しい年から順番に年別Shardへ移行できるようにしました。

前面の「Web版 DataLake」で:
- ⑤ 収録年を確認
- ⑥ 過去年を順番に一括移行

を使います。

各年は必ず
- Source/Destination行数一致
- 営業日数一致
- MIN/MAX日付一致
- PRAGMA quick_check=ok
を確認し、PASS後だけCatalogへ bars_YYYY を ready 登録します。

Legacy DataLakeはread-onlyで変更しません。

## UI
Web版 DataLakeを前面へ移しました。
旧巨大DataLake操作・SAH診断・旧PoC等は「開発者診断（通常は開かなくてOK）」へ収納しています。
