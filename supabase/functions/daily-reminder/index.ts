// 毎時 pg_cron（supabase/cron.sql）から呼ばれる。
// 通知時刻を迎えた購読者のうち、今日のノルマが終わっていない人にだけリマインドを送る。
// 動作確認用に body で {"force": true} を渡すと、時刻・ノルマ・送信済みを無視して全員に送る。
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// drill.html の DAILY_GOAL / 問題数と揃えること
const DAILY_GOAL = 5;
const TOTAL = 118;
const APP_URL = 'drill.html?daily=1';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// 日本時間（DSTなし）
const JST = 9 * 3600 * 1000;
const jstDay = (t: string | number) => new Date(new Date(t).getTime() + JST).toISOString().slice(0, 10);
const jstHour = (t: number) => new Date(t + JST).getUTCHours();

function buildMessage(answeredAt: string[], now: number) {
  const today = jstDay(now);
  const days = new Set(answeredAt.map(jstDay));
  const n = answeredAt.filter((t) => jstDay(t) === today).length;
  const left = TOTAL - answeredAt.length;

  // 今日まだ解いていなければ昨日から遡って数える
  let d = days.has(today) ? now : now - 86400000;
  let streak = 0;
  while (days.has(jstDay(d))) { streak++; d -= 86400000; }

  let title = 'E資格 今日の勉強';
  if (n > 0) title = 'E資格 あと少し！';
  else if (streak > 0) title = `🔥 ${streak}日連続が途切れそう！`;

  const body = n > 0
    ? `今日はあと${DAILY_GOAL - n}問でノルマ達成。タップして続きから`
    : `今日の${DAILY_GOAL}問をやろう（未回答 ${left}問）。タップですぐ始められます`;

  return { n, left, payload: JSON.stringify({ title, body, url: APP_URL }) };
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { force = false } = await req.json().catch(() => ({}));
  const now = Date.now();
  const today = jstDay(now);

  let q = sb.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth');
  if (!force) q = q.eq('notify_hour', jstHour(now)).or(`last_sent_on.is.null,last_sent_on.lt.${today}`);
  const { data: subs, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const results: Record<string, string> = {};
  for (const [userId, userSubs] of byUser) {
    const { data: rows, error: pErr } = await sb.from('progress').select('answered_at').eq('user_id', userId);
    if (pErr) { results[userId] = 'error: ' + pErr.message; continue; }
    const msg = buildMessage(rows.map((r) => r.answered_at).filter(Boolean), now);

    // ノルマ達成済み、または全問回答済み（もう解ける問題がない）なら送らない
    if (!force && (msg.n >= DAILY_GOAL || msg.left === 0)) { results[userId] = 'skipped'; continue; }

    for (const s of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          msg.payload,
          { TTL: 3 * 3600, urgency: 'high' },
        );
        await sb.from('push_subscriptions').update({ last_sent_on: today }).eq('id', s.id);
        results[s.id] = 'sent';
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 購読が失効している（アプリ削除・通知OFFなど）
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('id', s.id);
          results[s.id] = 'expired';
        } else {
          results[s.id] = `error: ${status ?? ''} ${(e as Error).message}`;
        }
      }
    }
  }
  return Response.json({ today, hour: jstHour(now), results });
});
