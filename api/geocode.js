module.exports = async function handler(req, res) {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } }
  );
  const data = await response.json();
  res.json(data);
};
