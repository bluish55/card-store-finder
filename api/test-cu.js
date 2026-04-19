module.exports = async function handler(req, res) {
  const result = {};

  try {
    // Step 1: 포켓몬카드 상품 검색
    const searchRes = await fetch('https://cu.bgfretail.com/product/productAjax.do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://cu.bgfretail.com',
        'Referer': 'https://cu.bgfretail.com/product/productList.do',
      },
      body: new URLSearchParams({
        searchWord: '포켓몬카드',
        pageIndex: '1',
        pageUnit: '10',
      }).toString(),
    });

    result.searchStatus = searchRes.status;
    result.searchContentType = searchRes.headers.get('content-type');
    const searchText = await searchRes.text();
    try { result.searchData = JSON.parse(searchText); } catch { result.searchRaw = searchText.slice(0, 2000); }

    // Step 2: 재고 조회 (bgfretail 웹 API)
    const stockRes = await fetch('https://cu.bgfretail.com/store/list_Ajax.do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'text/html, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Origin': 'https://cu.bgfretail.com',
        'Referer': 'https://cu.bgfretail.com/store/list.do?category=store',
      },
      body: new URLSearchParams({
        searchType: '1',
        searchWord: '포켓몬카드',
        xLoc: '127.0276',
        yLoc: '37.4979',
        pageIndex: '1',
      }).toString(),
    });

    result.stockStatus = stockRes.status;
    result.stockContentType = stockRes.headers.get('content-type');
    const stockText = await stockRes.text();
    try { result.stockData = JSON.parse(stockText); } catch { result.stockRaw = stockText.slice(0, 2000); }

  } catch (err) {
    result.error = err.message;
  }

  return res.status(200).json(result);
};
