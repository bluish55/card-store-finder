module.exports = async function handler(req, res) {
  const result = {};

  try {
    // Step 1: 워밍업
    await fetch('https://www.pocketcu.co.kr/api/search/display/stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ searchWord: '컵라면' }),
    });

    // Step 2: 컵라면 상품 검색
    const searchRes = await fetch('https://www.pocketcu.co.kr/api/search/rest/stock/main', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        searchWord: '컵라면',
        prevSearchWord: '',
        spellModifyUseYn: 'Y',
        offset: 0,
        limit: 5,
        searchSort: 'recom',
      }),
    });

    const searchData = await searchRes.json().catch(() => null);
    const products = searchData?.goodsList || [];
    result.products = products.map(p => ({
      name: p.goodsNm,
      itemCd: p.barCd,
      onItemNo: p.onItemNo,
    }));

    if (!products.length) {
      return res.status(200).json(result);
    }

    // Step 3: 첫 번째 상품으로 강남역 기준 재고 조회
    const first = products[0];
    const itemCd = first.barCd;
    const onItemNo = first.onItemNo;

    const storeRes = await fetch('https://www.pocketcu.co.kr/api/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        latVal: '37.4979',
        longVal: '127.0276',
        baseLatVal: '37.4979',
        baseLongVal: '127.0276',
        tabId: '2',
        filterSvcList: [],
        filterAdtList: [],
        stockCdcYn: 'Y',
        searchStock: true,
        pickupType: 'change',
        getRoute: 'IOS',
        areaTplNo: '0',
        childMealPickUpYn: 'N',
        isCurrentSearch: 'N',
        pageType: 'search_improve stock_sch_improve',
        searchWord: '',
        isRecommend: 'Y',
        recommendId: 'stock',
        jipCd: itemCd,
        itemCd: itemCd,
        item_cd: itemCd,
        onItemNo: onItemNo,
      }),
    });

    const storeData = await storeRes.json().catch(() => null);
    result.storeStatus = storeRes.status;
    result.checkedItem = { itemCd, onItemNo, name: first.goodsNm };

    // stock 값만 요약해서 반환 (전체 데이터 너무 큼)
    result.storeSummary = (storeData?.storeList || []).map(s => ({
      name: s.storeNm,
      stock: s.stock,
      distance: s.distance,
    }));
    result.totalStores = storeData?.totalCnt;

  } catch (err) {
    result.error = err.message;
  }

  return res.status(200).json(result);
};
