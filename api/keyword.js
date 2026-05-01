module.exports = async function handler(req, res) {
  const { query, category_group_code } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  let url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
  if (category_group_code) url += `&category_group_code=${category_group_code}`;
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` }
  });
  const data = await response.json();
  res.json(data);
};
