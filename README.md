# J-Quants Local-first PWA v7e-alpha16

## 目的
Legacy DataLakeに欠けている2020〜2025の日足を、旧巨大DBを作り直さず
J-Quants V2 APIから年別Shardへ直接補完します。

## 重要な修正
alpha15の `from/to` 一括取得はV2日足API仕様に合わなかったため廃止。
実機PASS済みの `date=YYYYMMDD` 方式に統一しました。

## 実機テスト
1. APIキーを入力
2. 開始年=2020 / 終了年=2025のまま
3. ⑦「1日だけAPI取得テスト」
4. PASSしたら⑧「2020〜2025を全期間補完」
5. 途中でSafariが閉じたり通信エラーになった場合は、APIキーを再入力して⑨「前回の続きから再開」

## 安全性
- 土日はAPIアクセスせず自動スキップ
- 祝日・休場日は0件としてスキップ
- 1営業日ずつAPI取得 → 対象年ShardへUPSERT → 日次検証
- 各年完了時に行数、営業日、MIN/MAX、quick_checkを検証しCatalogへready登録
- 途中状態はlocalStorageのCheckpointへ保存
- 同期間を再実行してもPRIMARY KEY(code,date) UPSERTなので重複しない
- Legacy DataLakeは補完処理で開かず、未変更
- APIキーは永続保存しない

## 今回の範囲
2020〜2025の欠損補完。2016〜2019 / 2026は既存Shardを維持します。
