# v7e-alpha34 Market + Supply/Demand Bundle

実機テスト推奨:
1. ⑥「市場基礎2種をまとめて構築」
   - TOPIX 2016-08-30 ～ 2026-09-01
   - 営業日カレンダー 同期間
2. ⑦「需給5種をまとめて取得」
   - 初回テスト範囲 2026-06-01 ～ 2026-09-01
3. 各項目の PASS/FAIL と rows、quick_check を確認。

Plan-Adaptive:
取得不可のAPIが1つあっても一括処理全体を停止せず、成功したShardは保存・Catalog登録します。

raw_jsonを保持し、PC版とのParity時に必要列を正規化します。
