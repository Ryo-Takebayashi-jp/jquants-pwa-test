# J-Quants Local-first PWA v7e-alpha8

## 原因
Worker側で `self.postMessage` をメッセージごとにラップしていました。

1回目:
native postMessage → requestId #1 wrapper

2回目:
requestId #1 wrapper → requestId #2 wrapper

となり、2回目のレスポンスでも最後に requestId #1 が上書きされ、
画面側は「2回目の返事が来ていない」と判断して待ち続けていました。

## 修正
Worker起動時にnative `postMessage`を1回だけ保存。
各メッセージのresponse wrapperは必ずnative関数を直接使います。

## 実機テスト
まず「⓪P SQLite未使用・Worker PINGを2回」を実行してください。

期待値:
- PING #1 PASS
- PING #2 PASS

通ったら続けて、
- ⓪A Worker常駐Runtimeを2回確認
- ① Catalog + bars_recent作成
- ② Catalog経由で再Open

まで試せます。
