# J-Quants Local-first PWA v7e-alpha19

## 今回の主目的
Catalog + Shardsを「移行済みデータ」から「本番運用DataLake」へ昇格。

### 1. Shard-native日次更新
- J-Quants V2 `date=YYYYMMDD` で1日分の日足を取得
- `jq_bars_recent_v1.sqlite` と `jq_bars_YYYY_v1.sqlite` へ同時UPSERT
- bars_recentは直近30取引日に自動トリム
- 両DBの日次行数とquick_checkを検証後、Catalogのrangeを更新
- Legacy巨大DataLakeは未使用

### 2. UI整理
- 「本番 日次更新」を開発者診断の外へ配置
- 「正式バックアップ / 復元」を開発者診断の外へ配置
- Safari未対応だったJQB単一ファイル作成UIは正式導線から撤去
- 複数SQLite外部バックアップ方式を正式仕様として維持

### 実機テスト
1. ページ上部〜本番導線で「本番 日次更新」「正式バックアップ / 復元」が見えること
2. 直近の既知取引日で① API取得だけ確認
3. PASS後に② Shardへ本番日次更新
4. bars_recent / bars_YYYY / CatalogがPASSすること
