// PWA登録と、毎日のリマインド通知（Web Push）の購読管理
// 送信側は supabase/functions/daily-reminder。公開鍵を変えたらそちらの VAPID_PUBLIC_KEY も揃えること
const VAPID_PUBLIC_KEY = 'BOxtGDEsUMHtbT-3_WYRMmawSvhbiTO5LgceEcrUvfLp12CMikB2BqOJ112_uHk8HrAMhk6IkW7ezmoCPwrg9Cg';

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function b64urlToU8(s) {
  const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

// 現在この端末で購読中なら { hour } を返す
async function pushCurrent(sb) {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const { data } = await sb.from('push_subscriptions').select('notify_hour').eq('endpoint', sub.endpoint).maybeSingle();
  return data ? { hour: data.notify_hour } : null;
}

// ボタンのクリックハンドラから直接呼ぶこと（iOSはユーザー操作中でないと許可ダイアログが出ない）
async function pushSubscribe(sb, hour) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('通知が許可されていません。端末の設定でこのアプリの通知を許可してください。');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToU8(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    notify_hour: hour
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  await reg.showNotification('通知をONにしました', {
    body: '毎日 ' + hour + '時 に、今日のノルマが終わっていなければお知らせします',
    icon: 'icons/icon-192.png',
    tag: 'daily-reminder'
  });
}

async function pushUnsubscribe(sb) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
