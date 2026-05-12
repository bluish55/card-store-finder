const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_MAILTO,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { data: subs } = await db.from('push_subscriptions').select('*');
  if (!subs?.length) return res.json({ sent: 0 });

  const nowHour = new Date().getHours();
  const nowMin = new Date().getMinutes();
  let sent = 0;

  for (const sub of subs) {
    const presets = sub.conditions?.presets || [];

    // 이 구독자의 어떤 프리셋이든 지금 시각이 시작 정각인지 확인
    const startsNow = presets.some(p => {
      if (!p.enabled || !p.timeRange?.start) return false;
      const [sh, sm] = p.timeRange.start.split(':').map(Number);
      return sh === nowHour && sm === nowMin;
    });
    if (!startsNow) continue;

    // pending 알림 조회
    const { data: pendings } = await db.from('pending_notifications')
      .select('*')
      .eq('subscription_id', sub.id);
    if (!pendings?.length) continue;

    const count = pendings.length;
    const first = pendings[0];

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: `🔔 쌓인 제보 ${count}개`,
          body: count === 1
            ? `${first.store_name} · ${first.store_address}`
            : `${first.store_name} 외 ${count - 1}곳에 새 제보가 있어요`,
          type: 'batch'
        })
      );
      sent++;
      await db.from('pending_notifications').delete().eq('subscription_id', sub.id);
    } catch (e) {
      if (e.statusCode === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }

  res.json({ sent });
};
