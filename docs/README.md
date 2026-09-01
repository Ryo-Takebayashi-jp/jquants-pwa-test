# v7e-alpha29 — Low definition diagnostics

alpha28でHigh20D/60Dは92/92一致した一方、Low20D/60Dは0/92だった。
ここで推測だけでLow定義を変更せず、PC版Lowと以下を同時比較する診断版。

- Web日中Low（adjusted intraday low）
- Web終値Low（adjusted close minimum）

不一致欄に両方を表示し、PC版がどちらの定義に一致するか実機データで特定する。
RSI14 91/92、VolumeRatio 91/92の残り1銘柄も同じ差分一覧で継続確認する。

マイ銘柄14/14完全一致はalpha28でPASS済み。
