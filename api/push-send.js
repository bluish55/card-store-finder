const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_MAILTO,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isInTimeRange(timeRange) {
  if (!timeRange?.start || !timeRange?.end) return true;
  const now = new Date();
  const [sh, sm] = timeRange.start.split(':').map(Number);
  const [eh, em] = timeRange.end.split(':').map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return cur >= start && cur < end;
}

function matchesPreset(preset, store, reportType, favorites, sub) {
  if (!preset.enabled) return false;

  // 위치 기준
  let baseLat, baseLng;
  if (preset.location?.type === 'gps') {
    baseLat = sub.last_lat;
    baseLng = sub.last_lng;
  } else {
    baseLat = preset.location?.lat;
    baseLng = preset.location?.lng;
  }
  if (!baseLat || !baseLng) return false;

  // 반경
  const radius = preset.radius || 1000;
  if (calcDistance(baseLat, baseLng, store.lat, store.lng) > radius) return false;

  // 가게 종류
  if (preset.types?.length && !preset.types.includes(store.type)) return false;

  // 재고 상태
  if (preset.reportTypes?.length && !preset.reportTypes.includes(reportType)) return false;

  // 찜한 가게만
  if (preset.favOnly && !favorites.includes(store.id)) return false;

  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { store, reportType, favorites = [] } = req.body;
  if (!store || !reportType) return res.status(400).json({ error: 'missing fields' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: subs } = await db.from('push_subscriptions').select('*');
  if (!subs?.length) return res.json({ sent: 0 });

  const reportTypeNames = { available: '있어요', low_stock: '마지막 몇 개', out_of_stock: '없어요' };
  let sent = 0;
  const pendingInserts = [];

  for (const sub of subs) {
    const presets = sub.conditions?.presets || [];
    const subFavorites = sub.conditions?.favorites || favorites;
    let matched = false;

    for (const preset of presets) {
      if (!matchesPreset(preset, store, reportType, subFavorites, sub)) continue;
      matched = true;

      const inTime = isInTimeRange(preset.timeRange);
      if (inTime) {
        // 즉시 전송
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: `📍 ${store.name}`,
              body: `${reportTypeNames[reportType] || reportType} · ${store.address}`,
              storeId: store.id
            })
          );
          sent++;
        } catch (e) {
          if (e.statusCode === 410) {
            await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        }
        break; // 같은 구독자 여러 프리셋 매칭돼도 1개만
      } else {
        // pending 저장
        pendingInserts.push({
          subscription_id: sub.id,
          store_id: store.id,
          store_name: store.name,
          store_address: store.address,
          report_type: reportType
        });
        break;
      }
    }

    // 단일 가게 알림 체크 (프리셋 미매칭 시)
    if (!matched && ['available', 'low_stock'].includes(reportType)) {
      const storeNotiList = sub.conditions?.storeNotiList || [];
      const storeNoti = storeNotiList.find(n => n.storeId == store.id && n.enabled !== false);
      if (storeNoti) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: `📍 ${store.name}`,
              body: `${reportTypeNames[reportType] || reportType} · ${store.address}`,
              storeId: store.id
            })
          );
          sent++;
        } catch (e) {
          if (e.statusCode === 410) {
            await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        }
      }
    }
  }

  if (pendingInserts.length) {
    await db.from('pending_notifications').insert(pendingInserts);
  }

  res.json({ sent });
};
