# J-Quants Local-first PWA v7e-alpha11

## 今回
少量移行が実機PASSしたため、次段階として年別Shard移行を追加しました。

前面の「④ 1年分を年別Shardへ移行」で、
既定2026年の日足を `/jq_bars_2026_v1.sqlite` へ移します。

安全条件:
- Legacy DataLakeはread-only
- 元DBを変更しない
- Source/Destination行数一致
- 営業日数一致
- MIN/MAX日付一致
- PRAGMA quick_check=ok
- 全PASS後だけCatalogに `bars_2026` を登録

まず2026のまま実機テストしてください。
