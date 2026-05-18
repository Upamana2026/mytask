# セットアップ手順

## 1. Firebase プロジェクトの作成

1. https://console.firebase.google.com/ にアクセスして「プロジェクトを追加」
2. プロジェクト名を入力(例: `my-task-app`)
3. Google アナリティクスは任意(無効でOK)
4. 作成完了

## 2. Google ログインを有効化

1. Firebase Console の左メニューから「Authentication」を開く
2. 「始める」→ Sign-in method タブ
3. 「Google」を選択 → 有効化 → サポートメールを設定 → 保存

## 3. Firestore データベースを作成

1. 左メニューから「Firestore Database」を開く
2. 「データベースの作成」→ ロケーションは `asia-northeast1`(東京)推奨
3. **本番モード**で開始(セキュリティルールは後で設定)
4. 作成後、「ルール」タブを開いて `firestore.rules` の内容を貼り付けて「公開」

## 4. Webアプリを登録して設定を取得

1. プロジェクト概要(歯車アイコン)→ プロジェクトを設定
2. 「マイアプリ」セクションで `</>`(ウェブ)アイコンをクリック
3. アプリのニックネーム入力(例: `task-app-web`)→ 「アプリを登録」
4. 表示される `firebaseConfig` オブジェクトをコピー
5. `script.js` の冒頭にある `firebaseConfig` を、コピーした値で上書き

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "my-task-app.firebaseapp.com",
  projectId: "my-task-app",
  storageBucket: "my-task-app.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```

## 5. ローカルで動作確認

Firebase Auth は `file://` では動作しないので、ローカルサーバー経由で開く必要があります。

### 方法A: Node.js が入っている場合
```powershell
cd C:\Users\90303\task-app
npx serve
```
表示されたURL(例: `http://localhost:3000`)をブラウザで開く

### 方法B: Python が入っている場合
```powershell
cd C:\Users\90303\task-app
python -m http.server 8000
```
ブラウザで `http://localhost:8000` を開く

### 方法C: VS Code の Live Server 拡張機能を使う

## 6. スマホからもアクセスできるようにする(Firebase Hostingにデプロイ)

```powershell
npm install -g firebase-tools
cd C:\Users\90303\task-app
firebase login
firebase init hosting
# Public directory: . (カレントディレクトリ)
# Single-page app: No
# 既存ファイルを上書きしない
firebase deploy
```

デプロイ後の `https://<プロジェクトID>.web.app` をPCとスマホの両方で開き、同じGoogleアカウントでログインすればリアルタイム同期されます。

## データ移行について

- 旧バージョン(localStorage版)で作成したタスクは、**初回ログイン時に自動的にFirestoreへ移行**されます
- 移行後、localStorage のタスクデータはクリアされます
- 移行は端末ごとに1回限り(`migrated-<uid>` フラグで管理)

## トラブルシューティング

- **「auth/unauthorized-domain」エラー**: Firebase Console > Authentication > Settings > 承認済みドメイン に、アクセス元ドメイン(localhost, *.web.app など)を追加
- **「permission-denied」エラー**: Firestoreのセキュリティルールが正しく公開されているか確認
- **ポップアップがブロックされる**: ブラウザのポップアップ許可を確認
