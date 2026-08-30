# J-Quants DataLake Rescue v1

PoC v6の10年バックフィルでSafari/PWAがクラッシュした後に、
SQLite/WASMを起動せずOPFS内のmarket DBを確認・退避する軽量版です。

手順:
1. GitHub Pagesの同じrepoへ5ファイルを上書きしてCommit
2. Rescue v1表示を確認
3. DataLakeを軽量チェック
4. FOUND + SQLite header PASSを確認
5. SQLiteをFilesへ退避
6. Filesに.sqliteが保存されたことを確認
7. レスキュー判定

この版は削除・修復・更新を行いません。
