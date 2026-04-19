module.exports = async function handler(req, res) {
  const result = {};

  try {
    // Step 1: 워밍업 요청
    const warmupRes = await fetch('https://www.pocketcu.co.kr/api/search/display/stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ searchWord: '포켓몬카드' }),
    });
    result.warmupStatus = warmupRes.status;
    result.warmupUrl = warmupRes.url;
    const warmupText = await warmupRes.text();
    try { result.warmupData = JSON.parse(warmupText); } catch { result.warmupRaw = warmupText.slice(0, 500); }

    // Step 2: 재고 검색 (강남역 기준)
    const stockRes = await fetch('https://www.pocketcu.co.kr/api/search/rest/stock/main', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        searchWord: '포켓몬카드',
        xLoc: 127.0276,
        yLoc: 37.4979,
        pageNum: 1,
        pageSize: 10,
      }),
    });
    result.stockStatus = stockRes.status;
    result.stockUrl = stockRes.url;
    const stockText = await stockRes.text();
    try { result.stockData = JSON.parse(stockText); } catch { result.stockRaw = stockText.slice(0, 1000); }

  } catch (err) {
    result.error = err.message;
  }

  return res.status(200).json(result);
};
