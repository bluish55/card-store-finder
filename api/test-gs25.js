export default async function handler(req, res) {
  const result = {};

  try {
    // Step 1: 포켓몬카드 상품코드 검색
    const searchRes = await fetch('https://b2c-apigw.woodongs.com/search/v3/totalSearch', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '포켓몬카드' }),
    });

    result.searchStatus = searchRes.status;
    const searchData = await searchRes.json().catch(() => null);
    result.searchRaw = searchData;

    if (!searchRes.ok || !searchData) {
      return res.status(200).json(result);
    }

    // 상품코드 추출
    const products = [];
    const collections = searchData?.SearchQueryResult?.Collection || [];
    for (const col of collections) {
      const docs = col?.Documentset?.Document || [];
      for (const doc of docs) {
        const f = doc?.field;
        if (f?.itemCode) {
          products.push({
            itemCode: f.itemCode,
            itemName: f.itemName || f.shortItemName,
            stockCheckEnabled: f.stockCheckYn === 'Y',
          });
        }
      }
    }
    result.products = products;

    if (!products.length) {
      return res.status(200).json(result);
    }

    // Step 2: 성수동 기준 재고 조회 (첫 번째 상품)
    const { itemCode, itemName } = products[0];
    const lat = 37.5447;
    const lng = 127.0558;

    const stockUrl = new URL('https://b2c-bff.woodongs.com/api/bff/v2/store/stock');
    stockUrl.searchParams.set('itemCode', itemCode);
    stockUrl.searchParams.set('myPositionXCoordination', String(lng));
    stockUrl.searchParams.set('myPositionYCoordination', String(lat));
    stockUrl.searchParams.set('centerPositionXCoordination', String(lng));
    stockUrl.searchParams.set('centerPositionYCoordination', String(lat));
    stockUrl.searchParams.set('radiusCondition', '3');
    stockUrl.searchParams.set('serviceCode', '01');
    stockUrl.searchParams.set('realTimeStockYn', 'Y');

    const stockRes = await fetch(stockUrl.toString(), {
      headers: { 'Accept': 'application/json, text/plain, */*' },
    });

    result.stockStatus = stockRes.status;
    result.checkedProduct = { itemCode, itemName };
    result.stockData = await stockRes.json().catch(() => null);

  } catch (err) {
    result.error = err.message;
  }

  return res.status(200).json(result);
}
