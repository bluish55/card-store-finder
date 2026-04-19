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
      body: JSON.stringify({ searchWord: '포켓몬카드' }),
    });

    // Step 2: 상품 검색 → 테라스탈카드 코드 고정 사용
    const itemCd = '8809945338399';
    const onItemNo = '2025020047140';

    // Step 3: 매장별 재고 조회 (강남역 기준)
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
        stockCdcYn: 'N',
        searchStock: false,
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

    result.storeStatus = storeRes.status;
    const storeText = await storeRes.text();
    try { result.storeData = JSON.parse(storeText); } catch { result.storeRaw = storeText.slice(0, 2000); }
    result.checkedItem = { itemCd, onItemNo, name: '포켓몬)테라스탈카드' };

  } catch (err) {
    result.error = err.message;
  }

  return res.status(200).json(result);
};
