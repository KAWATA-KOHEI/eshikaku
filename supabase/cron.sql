-- daily-reminder 関数を毎時0分に呼び出す。
-- 関数をデプロイし、シークレットを設定してから、SQL Editor で1回だけ実行する。
-- <CRON_SECRET> は `supabase secrets set` で設定した CRON_SECRET と同じ値に置き換えること。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'daily_reminder_cron_secret');

select cron.schedule(
  'daily-reminder',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://porgeuocbuwevjfqzimy.supabase.co/functions/v1/daily-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
