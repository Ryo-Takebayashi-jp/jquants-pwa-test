# v7e-alpha67

データ更新・API再取得は不要です。

今回まとめて対応:
- V2 ShEq/NCShEq対応
- PC相当の前年FY自己資本選択
- ROE再計算
- QVR Quality 5部品分解
- PC QualityからROE score逆算
- raw Eq/ShEq/ROE/EqAR監査

既存DataLakeで ③ → ④ → ⑤ を実行。
⑤の【残差フルトレース】だけ確認してください。

期待ポイント:
- 6176 / 3989 の Web QVRQualityScore がPC側へ近づくか
- `Quality差の主因候補: ROE部品 ...` が何を示すか
- 共通率97.8%が改善するか
