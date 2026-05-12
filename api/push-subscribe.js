const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { endpoint, p256dh, auth, conditions, lastLat, lastLng } = req.body;
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'missing fields' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { error } = await db.from('push_subscriptions').upsert({
    endpoint,
    p256dh,
    auth,
    conditions: conditions || {},
    last_lat: lastLat || null,
    last_lng: lastLng || null
  }, { onConflict: 'endpoint' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};
