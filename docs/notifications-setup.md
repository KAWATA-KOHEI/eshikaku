# 毎日の通知（PWA + Web Push）のセットアップ

毎時0分に Supabase の cron が `daily-reminder` 関数を呼び、次の条件をすべて満たす端末に Push 通知を送ります。

- 通知時刻（日本時間）がその時刻になっている
- 今日まだ通知していない
- 今日のノルマ（`DAILY_GOAL` = 5問）が終わっていない
- 未回答の問題が残っている

通知をタップすると `drill.html?daily=1` が開き、未回答の問題から始まります。

```
スマホ ──購読──▶ push_subscriptions テーブル
                         ▲
pg_cron（毎時）──▶ daily-reminder 関数 ──progress で今日の回答数を確認──▶ Web Push ──▶ スマホに通知
```

## 1. アプリを公開する

GitHub Pages は `master` を配信しています。このブランチを `master` にマージすると
`https://kawata-kohei.github.io/eshikaku/drill.html` に反映されます（PWA と Push は HTTPS が必須です）。

## 2. テーブルを作る

Supabase ダッシュボードの **SQL Editor** で
`supabase/migrations/20260926000000_push_subscriptions.sql` の中身を実行します。

## 3. 関数をデプロイする

VAPID 鍵と `CRON_SECRET` をシークレットに登録してからデプロイします。
公開鍵は `push.js` の `VAPID_PUBLIC_KEY` と同じ値にしてください。

```sh
npx supabase login
npx supabase secrets set --project-ref porgeuocbuwevjfqzimy \
  VAPID_PUBLIC_KEY=<公開鍵> \
  VAPID_PRIVATE_KEY=<秘密鍵> \
  VAPID_SUBJECT=mailto:<連絡先メールアドレス> \
  CRON_SECRET=<ランダムな文字列>
npx supabase functions deploy daily-reminder --project-ref porgeuocbuwevjfqzimy --no-verify-jwt
```

`--no-verify-jwt` を付けるのは、cron からは JWT ではなく `x-cron-secret` ヘッダーで認証するためです。

鍵を作り直す場合は `npx web-push generate-vapid-keys` を使い、`push.js` の公開鍵も差し替えてください
（鍵を変えると、既存の購読は無効になり、各端末で通知をONにし直す必要があります）。

## 4. cron を登録する

`supabase/cron.sql` の `<CRON_SECRET>` を手順3と同じ値に置き換え、SQL Editor で1回だけ実行します。

## 5. スマホで通知をONにする

**iPhone**（iOS 16.4 以上）
1. Safari で `drill.html` を開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面の「E資格」アイコンから開いてログイン
4. 「🔔 毎日の通知」で時刻を選び「ONにする」→ 通知を許可

iPhone ではホーム画面から開いたときだけ通知を使えます（Safari のタブ上では使えません）。

**Android**
Chrome で開き、メニュー →「アプリをインストール」（またはそのまま）でログインし、「ONにする」。

## 動作確認

時刻やノルマに関係なく、今すぐ全員に送るには `force` を付けて関数を呼びます。

```sh
curl -X POST https://porgeuocbuwevjfqzimy.supabase.co/functions/v1/daily-reminder \
  -H 'x-cron-secret: <CRON_SECRET>' -H 'Content-Type: application/json' \
  -d '{"force": true}'
```

## 変更するとき

- ノルマの問題数: `drill.html` と `supabase/functions/daily-reminder/index.ts` の `DAILY_GOAL`
- 通知の文面: `daily-reminder/index.ts` の `buildMessage`
- 選べる時刻の範囲: `drill.html` の `initNotif`（現在は 5:00〜23:00）
