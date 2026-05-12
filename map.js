let db;
let map;
let markers = [];
let markerElements = [];
let renderedStores = [];
let allStores = [];
let stockReportMap = {};
let activeType = 'all';
let currentStore = null;
let userLat = null;
let userLng = null;
let storesLoaded = false;

function getFavorites() {
  return JSON.parse(localStorage.getItem('favorites') || '[]');
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx === -1) favs.push(id);
  else favs.splice(idx, 1);
  localStorage.setItem('favorites', JSON.stringify(favs));
}

const DEFAULT_LAT = 37.5447;
const DEFAULT_LNG = 127.0558;

function getActivePinRules() {
  try {
    const data = JSON.parse(localStorage.getItem('pinPresets'));
    if (!data) return null;
    const preset = data.presets.find(p => p.id === data.activeId);
    return preset?.rules || null;
  } catch { return null; }
}

function matchesCondition(condition, latestReport, isFav) {
  if (condition.favoriteOnly && !isFav) return false;
  const reportType = latestReport ? latestReport.report_type : 'no_report';
  if (condition.reportType !== 'any' && condition.reportType !== reportType) return false;
  if (condition.timeType === 'none' || !latestReport) return condition.timeType === 'none';
  const hoursSince = (Date.now() - new Date(latestReport.created_at).getTime()) / 3600000;
  if (condition.timeType === 'max') return hoursSince <= condition.maxHours;
  if (condition.timeType === 'min') return hoursSince > condition.minHours;
  if (condition.timeType === 'range') return hoursSince >= condition.minHours && hoursSince <= condition.maxHours;
  return true;
}

function getPinColor(latestReport, storeId) {
  const fav = isFavorite(storeId);
  const rules = getActivePinRules();
  if (rules) {
    for (const rule of rules) {
      if (matchesCondition(rule.condition, latestReport, fav)) return rule.pin;
    }
  }
  // fallback defaults
  if (!latestReport) return { type: 'color', value: '#1e88e5' };
  const hoursSince = (Date.now() - new Date(latestReport.created_at).getTime()) / 3600000;
  if (latestReport.report_type === 'out_of_stock') return { type: 'color', value: '#e53935' };
  if (latestReport.report_type === 'low_stock') return { type: 'color', value: hoursSince <= 24 ? '#fb8c00' : '#e53935' };
  if (latestReport.report_type === 'available') {
    if (hoursSince <= 24) return { type: 'color', value: '#43a047' };
    if (hoursSince <= 72) return { type: 'color', value: '#fb8c00' };
    return { type: 'color', value: '#e53935' };
  }
  return { type: 'color', value: '#1e88e5' };
}

function getLocationPref() {
  return localStorage.getItem('locationEnabled'); // null(첫방문) | 'true' | 'false'
}

function setLocationPref(val) {
  localStorage.setItem('locationEnabled', String(val));
}

function initMap() {
  createMap(DEFAULT_LAT, DEFAULT_LNG);

  const pref = getLocationPref();
  if (pref === null) {
    showLocationPopup();
  } else if (pref === 'true') {
    getCurrentLocation();
  }

  updateToggleUI();
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
}

function getCurrentLocation() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      map.setCenter(new kakao.maps.LatLng(userLat, userLng));
      if (!document.getElementById('list-view').classList.contains('hidden')) renderListView();
      updateNotiGpsLocation(userLat, userLng);
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setLocationPref('false');
        updateToggleUI();
        showDeniedBanner();
      }
    },
    { timeout: 10000 }
  );
}

function getPinSize() {
  const level = map.getLevel();
  return Math.min(28, Math.max(14, 26 - (level - 3) * 2));
}

function updateMarkerVisibility() {
  const level = map.getLevel();
  const visible = level <= 9;
  const size = getPinSize();
  markers.forEach((m, i) => {
    const isVending = renderedStores[i]?.type === '자판기';
    m.setMap((visible || isVending) ? map : null);
    if (markerElements[i]) { markerElements[i].style.width = size + 'px'; markerElements[i].style.height = size + 'px'; }
  });
}

function createMap(lat, lng) {
  const container = document.getElementById('map');
  const options = {
    center: new kakao.maps.LatLng(lat, lng),
    level: 4
  };
  map = new kakao.maps.Map(container, options);
  kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerVisibility);
  loadStores();
}

function showLocationPopup() {
  document.getElementById('location-popup').classList.remove('hidden');
}

function hideLocationPopup() {
  document.getElementById('location-popup').classList.add('hidden');
}

function showDeniedBanner() {
  document.getElementById('location-denied-banner').classList.remove('hidden');
}

function updateToggleUI() {
  const toggle = document.getElementById('location-toggle');
  if (toggle) toggle.checked = getLocationPref() === 'true';
}

async function loadStockReportMap() {
  const { data } = await db.from('stock_reports')
    .select('store_id, report_type, created_at, photo_url, gps_verified')
    .order('created_at', { ascending: false });
  const result = {};
  if (data) data.forEach(r => { if (!result[r.store_id]) result[r.store_id] = r; });
  return result;
}

function loadStoresCache() {
  try {
    const c = localStorage.getItem('storesCache');
    return c ? JSON.parse(c) : null;
  } catch { return null; }
}

function saveStoresCache(stores, reportMap) {
  try {
    localStorage.setItem('storesCache', JSON.stringify({ stores, reportMap }));
  } catch {}
}

function applyStoresData(stores, reportMap) {
  allStores = stores;
  stockReportMap = reportMap;
  storesLoaded = true;
  renderMarkers(allStores);
  if (!document.getElementById('list-view').classList.contains('hidden')) renderListView();
}

async function loadStores() {
  const cache = loadStoresCache();

  if (cache) {
    applyStoresData(cache.stores, cache.reportMap);
  } else {
    const listContent = document.getElementById('list-content');
    if (listContent) listContent.innerHTML = '<div class="list-loading"><div class="list-spinner"></div><p>판매점 정보를 불러오는 중이에요</p></div>';
  }

  const [storesRes, reportMap] = await Promise.all([
    db.from('stores').select('*'),
    loadStockReportMap()
  ]);
  if (storesRes.error) return console.error(storesRes.error);

  saveStoresCache(storesRes.data, reportMap);
  applyStoresData(storesRes.data, reportMap);
}

function createPinElement(pin, size) {
  const el = document.createElement('div');
  if (pin.type === 'image') {
    el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;`;
    const img = document.createElement('img');
    img.src = pin.value;
    img.style.cssText = `width:100%;height:100%;object-fit:contain;`;
    el.appendChild(img);
  } else {
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${pin.value};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;`;
  }
  return el;
}

function renderMarkers(stores) {
  markers.forEach(m => m.setMap(null));
  markers = [];
  markerElements = [];
  renderedStores = [];

  const level = map.getLevel();
  const visible = level <= 9;
  const size = getPinSize();

  stores.forEach(store => {
    const pin = getPinColor(stockReportMap[store.id], store.id);
    const el = createPinElement(pin, size);
    markerElements.push(el);
    renderedStores.push(store);

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(store.lat, store.lng),
      content: el,
      xAnchor: 0.5,
      yAnchor: 0.5
    });
    overlay.setMap((visible || store.type === '자판기') ? map : null);
    markers.push(overlay);

    el.addEventListener('click', () => showPanel(store));
  });
}

function heartSVG(filled) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="#333" stroke-width="1.5" fill="${filled ? '#e53935' : 'white'}"/>
  </svg>`;
}

function updateFavBtn(id) {
  const btn = document.getElementById('fav-btn');
  btn.innerHTML = heartSVG(isFavorite(id));
}

function showPanel(store) {
  currentStore = store;
  document.getElementById('store-name').textContent = store.name;
  document.getElementById('store-type').textContent = store.type;
  document.getElementById('store-address-text').textContent = store.address;
  document.getElementById('store-phone-text').textContent = store.phone || '미등록';
  document.getElementById('store-items').textContent = store.items || '';
  document.getElementById('navi-btn').href =
    `https://map.kakao.com/link/to/${encodeURIComponent(store.name)},${store.lat},${store.lng}`;
  updateFavBtn(store.id);
  const distEl = document.getElementById('store-distance');
  if (userLat !== null && userLng !== null) {
    distEl.textContent = calcDistance(userLat, userLng, store.lat, store.lng);
  } else {
    distEl.textContent = '';
  }
  document.querySelectorAll('.stock-btn').forEach(btn => btn.disabled = false);
  document.getElementById('stock-report-btns').classList.add('hidden');
  document.getElementById('simple-report-btn').classList.remove('active');
  document.getElementById('stock-report-list').innerHTML = '';
  loadStockReports(store.id);
  document.getElementById('store-panel').classList.remove('hidden');
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.type;

    if (activeType === 'notifications') {
      renderNotiLogView();
      return;
    }

    // 알림 모음에서 다른 필터로 전환 시 리스트 다시 표시
    renderListView();

    let filtered;
    if (activeType === 'all') filtered = allStores;
    else if (activeType === '찜') filtered = allStores.filter(s => isFavorite(s.id));
    else filtered = allStores.filter(s => s.type === activeType);
    renderMarkers(filtered);
  });
});

function openSearch() {
  document.getElementById('search-bar').classList.remove('hidden');
  document.getElementById('filter-bar').classList.add('hidden');
  document.getElementById('search-row').classList.add('hidden');
  document.getElementById('search-input').focus();
}

function closeSearch() {
  document.getElementById('search-bar').classList.add('hidden');
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('filter-bar').classList.remove('hidden');
  document.getElementById('search-row').classList.remove('hidden');
  document.getElementById('search-input').value = '';
}

function updateDropdown(query) {
  const dropdown = document.getElementById('search-dropdown');
  if (query.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  const q = query.toLowerCase();
  const matched = allStores
    .filter(s => s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 5);

  if (!matched.length) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.innerHTML = matched.map((s, i) =>
    `<div class="search-item" data-index="${i}">
      <div class="search-item-name">${s.name}</div>
      <div class="search-item-sub">${s.address}</div>
    </div>`
  ).join('');

  dropdown.querySelectorAll('.search-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      map.setCenter(new kakao.maps.LatLng(matched[i].lat, matched[i].lng));
      map.setLevel(3);
      showPanel(matched[i]);
      closeSearch();
    });
  });

  dropdown.classList.remove('hidden');
}

function searchLocation() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  document.getElementById('search-dropdown').classList.add('hidden');

  const geocoder = new kakao.maps.services.Geocoder();
  geocoder.addressSearch(query, (result, status) => {
    if (status === kakao.maps.services.Status.OK) {
      map.setCenter(new kakao.maps.LatLng(result[0].y, result[0].x));
      map.setLevel(4);
      closeSearch();
    } else {
      const places = new kakao.maps.services.Places();
      places.keywordSearch(query, (result, status) => {
        if (status === kakao.maps.services.Status.OK) {
          map.setCenter(new kakao.maps.LatLng(result[0].y, result[0].x));
          map.setLevel(4);
          closeSearch();
        } else {
          alert('검색 결과가 없습니다.');
        }
      });
    }
  });
}

window.addEventListener('load', () => {
  db = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
  initMap();

  // 지도 위 UI 요소 터치 시 지도 이동 방지
  ['#top-row', '#store-panel', '#location-btn', '#location-popup', '#location-denied-banner', '#bottom-nav', '#list-view'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener('touchstart', e => e.stopPropagation());
    el.addEventListener('touchmove', e => e.stopPropagation());
  });

  // 검색
  document.getElementById('search-btn').addEventListener('click', openSearch);
  document.getElementById('search-close').addEventListener('click', closeSearch);
  document.getElementById('search-input').addEventListener('input', (e) => {
    updateDropdown(e.target.value.trim());
  });

  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchLocation();
  });

  // 위치 팝업 버튼
  document.getElementById('popup-allow-btn').addEventListener('click', () => {
    hideLocationPopup();
    setLocationPref('true');
    getCurrentLocation();
  });

  document.getElementById('popup-skip-btn').addEventListener('click', () => {
    hideLocationPopup();
    setLocationPref('false');
    updateToggleUI();
  });

document.getElementById('fav-btn').addEventListener('click', () => {
    if (!currentStore) return;
    toggleFavorite(currentStore.id);
    updateFavBtn(currentStore.id);
    if (activeType === '찜') {
      const filtered = allStores.filter(s => isFavorite(s.id));
      renderMarkers(filtered);
    }
  });

  document.getElementById('location-btn').addEventListener('click', () => {
    if (getLocationPref() !== 'true') {
      showLocationPopup();
    } else {
      getCurrentLocation();
    }
  });

  // 하단 네비게이션
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'report') {
        openStoreReportModal();
        openMapPicker();
        return;
      }
      switchTab(btn.dataset.tab);
    });
  });

  // 리스트 정렬
  document.getElementById('list-sort-btn').textContent = listSortMode === 'distance' ? '📍 거리' : '🕐 최신';
  document.getElementById('list-sort-btn').addEventListener('click', () => {
    listSortMode = listSortMode === 'distance' ? 'recent' : 'distance';
    document.getElementById('list-sort-btn').textContent = listSortMode === 'distance' ? '📍 거리' : '🕐 최신';
    listFilter.sortMode = listSortMode;
    saveListFilter();
    renderListView();
  });
  initListFilter();
  switchTab('list');
  document.getElementById('store-report-close').addEventListener('click', () => {
    document.getElementById('store-report-modal').classList.add('hidden');
  });

  // 지도 picker
  document.getElementById('map-picker-confirm').addEventListener('click', confirmMapPicker);
  document.getElementById('map-picker-cancel').addEventListener('click', cancelMapPicker);

  // 설정에서 돌아올 때 핀 재렌더
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && allStores.length) {
      if (getLocationPref() !== 'true') {
        userLat = null;
        userLng = null;
      }
      const stores = renderedStores.length ? [...renderedStores] : allStores;
      renderMarkers(stores);
      if (!document.getElementById('list-view').classList.contains('hidden')) renderListView();
    }
  });

  // 재고 제보 사진 모달
  document.getElementById('stock-photo-close').addEventListener('click', () => {
    document.getElementById('stock-photo-modal').classList.add('hidden');
    pendingReportType = null;
  });
  document.getElementById('stock-photo-submit').addEventListener('click', () => {
    const file = document.getElementById('stock-photo-input').files[0] || null;
    doSubmitStockReport(file);
  });
  document.getElementById('stock-photo-skip').addEventListener('click', () => {
    doSubmitStockReport(null);
  });

  initServiceWorkerMessages();
  checkNotificationTabParam();
});

// ── 탭 네비게이션 ─────────────────────────────────────────

function calcDistanceNum(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(dist) {
  return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
}

// ── 리스트 필터 ─────────────────────────────────────────

const TIME_HOURS_MAP = [6, 24, 72, 168, null];
const TIME_LABELS = ['6시간 이내', '24시간 이내', '72시간 이내', '1주일 이내', '전체'];

function loadListFilter() {
  try {
    const saved = localStorage.getItem('listFilter');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { sortMode: 'distance', count: 10, countCustom: null, types: [], reportTypes: [], trustTypes: [], timeIndex: 4, favOnly: false };
}

function saveListFilter() {
  localStorage.setItem('listFilter', JSON.stringify(listFilter));
}

let listFilter = loadListFilter();
let listSortMode = listFilter.sortMode || 'distance';

function applyListFilter(stores) {
  let result = stores.map(s => ({
    ...s,
    distNum: calcDistanceNum(userLat, userLng, s.lat, s.lng),
    report: stockReportMap[s.id] || null
  }));

  if (listFilter.favOnly)
    result = result.filter(s => isFavorite(s.id));

  if (listFilter.types.length > 0)
    result = result.filter(s => listFilter.types.includes(s.type));

  if (listFilter.reportTypes.length > 0)
    result = result.filter(s => listFilter.reportTypes.includes(s.report ? s.report.report_type : 'no_report'));

  if (listFilter.trustTypes.length > 0) {
    result = result.filter(s => {
      if (!s.report) return false;
      const hasPhoto = !!s.report.photo_url;
      const hasGps = !!s.report.gps_verified;
      return listFilter.trustTypes.some(t =>
        (t === 'photo' && hasPhoto) ||
        (t === 'gps' && hasGps) ||
        (t === 'both' && hasPhoto && hasGps)
      );
    });
  }

  const maxHours = TIME_HOURS_MAP[listFilter.timeIndex];
  if (maxHours !== null) {
    result = result.filter(s => {
      if (!s.report) return false;
      return (Date.now() - new Date(s.report.created_at).getTime()) / 3600000 <= maxHours;
    });
  }

  result.sort((a, b) => {
    if (listSortMode === 'recent') {
      const at = a.report ? new Date(a.report.created_at).getTime() : 0;
      const bt = b.report ? new Date(b.report.created_at).getTime() : 0;
      return bt - at;
    }
    return a.distNum - b.distNum;
  });

  const count = listFilter.count === 'custom' ? (listFilter.countCustom || 10) : listFilter.count;
  return result.slice(0, count);
}

function updateFilterBtnState() {
  const active =
    listFilter.types.length > 0 ||
    listFilter.reportTypes.length > 0 ||
    listFilter.trustTypes.length > 0 ||
    listFilter.timeIndex < 4 ||
    listFilter.favOnly ||
    listFilter.count !== 10;
  document.getElementById('list-filter-btn').classList.toggle('active', active);
}

function initMultiChips(containerId, attr, currentValues, onChange) {
  const isAll = currentValues.length === 0;
  document.querySelectorAll('#' + containerId + ' .chip').forEach(btn => {
    const val = btn.dataset[attr];
    btn.classList.toggle('active', val === 'all' ? isAll : currentValues.includes(val));
    btn.addEventListener('click', () => {
      const chips = document.querySelectorAll('#' + containerId + ' .chip');
      if (val === 'all') {
        chips.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange([]);
      } else {
        document.querySelector('#' + containerId + ' .chip[data-' + attr + '="all"]').classList.remove('active');
        btn.classList.toggle('active');
        const selected = [...chips]
          .filter(b => b.dataset[attr] !== 'all' && b.classList.contains('active'))
          .map(b => b.dataset[attr]);
        if (selected.length === 0)
          document.querySelector('#' + containerId + ' .chip[data-' + attr + '="all"]').classList.add('active');
        onChange(selected);
      }
    });
  });
}

function initListFilter() {
  document.querySelectorAll('#count-chips .chip').forEach(btn => {
    const val = btn.dataset.count;
    btn.classList.toggle('active',
      val === 'custom' ? listFilter.count === 'custom' : parseInt(val) === listFilter.count
    );
    btn.addEventListener('click', () => {
      document.querySelectorAll('#count-chips .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (val === 'custom') {
        listFilter.count = 'custom';
        document.getElementById('count-custom-input').classList.remove('hidden');
        document.getElementById('count-custom-input').focus();
      } else {
        listFilter.count = parseInt(val);
        listFilter.countCustom = null;
        document.getElementById('count-custom-input').classList.add('hidden');
      }
      saveListFilter();
      updateFilterBtnState();
      renderListView();
    });
  });

  const customInput = document.getElementById('count-custom-input');
  if (listFilter.count === 'custom') {
    customInput.classList.remove('hidden');
    customInput.value = listFilter.countCustom || '';
  }
  customInput.addEventListener('input', () => {
    const val = parseInt(customInput.value);
    if (val > 0) {
      listFilter.countCustom = val;
      saveListFilter();
      renderListView();
    }
  });

  initMultiChips('type-chips', 'type', listFilter.types, v => { listFilter.types = v; saveListFilter(); updateFilterBtnState(); renderListView(); });
  initMultiChips('report-chips', 'report', listFilter.reportTypes, v => { listFilter.reportTypes = v; saveListFilter(); updateFilterBtnState(); renderListView(); });
  initMultiChips('trust-chips', 'trust', listFilter.trustTypes, v => { listFilter.trustTypes = v; saveListFilter(); updateFilterBtnState(); renderListView(); });

  const slider = document.getElementById('time-slider');
  slider.value = listFilter.timeIndex;
  document.getElementById('time-slider-value').textContent = TIME_LABELS[listFilter.timeIndex];
  slider.addEventListener('input', () => {
    listFilter.timeIndex = parseInt(slider.value);
    document.getElementById('time-slider-value').textContent = TIME_LABELS[listFilter.timeIndex];
    saveListFilter();
    updateFilterBtnState();
    renderListView();
  });

  const favToggle = document.getElementById('fav-only-toggle');
  favToggle.checked = listFilter.favOnly;
  favToggle.addEventListener('change', () => {
    listFilter.favOnly = favToggle.checked;
    saveListFilter();
    updateFilterBtnState();
    renderListView();
  });

  document.getElementById('list-filter-btn').addEventListener('click', () => {
    document.getElementById('list-filter-panel').classList.toggle('hidden');
  });

  updateFilterBtnState();
}

function switchTab(tabName) {
  if (tabName === 'settings') {
    window.location.href = 'settings.html';
    return;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.getElementById('store-panel').classList.add('hidden');
  closeSearch();

  const isMap = tabName === 'map';
  document.getElementById('top-row').classList.toggle('hidden', !isMap);
  document.getElementById('location-btn').classList.toggle('hidden', !isMap);
  document.getElementById('list-view').classList.toggle('hidden', tabName !== 'list');

  if (tabName === 'list') renderListView();
  if (isMap && map) map.relayout();
}

function renderListView() {
  const contentEl = document.getElementById('list-content');
  const titleEl = document.getElementById('list-title');

  if (!storesLoaded) {
    contentEl.innerHTML = '<div class="list-loading"><div class="list-spinner"></div><p>판매점 정보를 불러오는 중이에요</p></div>';
    return;
  }

  if (!userLat || !userLng) {
    const favStores = allStores.filter(s => isFavorite(s.id));
    if (!favStores.length) {
      titleEl.textContent = '찜한 판매점';
      contentEl.innerHTML = '<p class="list-empty">위치 정보가 없어요.<br>설정 탭에서 내 위치를 켜주세요.</p>';
      return;
    }
    titleEl.textContent = `찜한 판매점 (${favStores.length})`;
    contentEl.innerHTML = favStores.map(s =>
      `<div class="list-store-card" onclick="onListCardClick(${s.id})">
        <div class="list-store-name-row">
          <span class="list-store-name">${s.name}</span>
        </div>
        <span class="list-store-type">${s.type}</span>
        <p class="list-store-address">📍 ${s.address}</p>
      </div>`
    ).join('');
    return;
  }

  const filtered = applyListFilter(allStores);
  titleEl.textContent = listSortMode === 'distance' ? `주변 판매점 (${filtered.length})` : `최신 제보 판매점 (${filtered.length})`;

  if (!filtered.length) {
    contentEl.innerHTML = '<p class="list-empty">조건에 맞는 판매점이 없어요.</p>';
    return;
  }

  contentEl.innerHTML = filtered.map(s =>
    `<div class="list-store-card" onclick="onListCardClick(${s.id})">
      <div class="list-store-name-row">
        <span class="list-store-name">${s.name}</span>
        <span class="list-store-dist">${formatDistance(s.distNum)}</span>
      </div>
      <span class="list-store-type">${s.type}</span>
      <p class="list-store-address">📍 ${s.address}</p>
    </div>`
  ).join('');
}

function onListCardClick(storeId) {
  const store = allStores.find(s => s.id === storeId);
  if (!store) return;
  switchTab('map');
  map.setCenter(new kakao.maps.LatLng(store.lat, store.lng));
  map.setLevel(3);
  showPanel(store);
}

function toggleSimpleReport() {
  const btns = document.getElementById('stock-report-btns');
  const btn = document.getElementById('simple-report-btn');
  const isHidden = btns.classList.contains('hidden');
  btns.classList.toggle('hidden', !isHidden);
  btn.classList.toggle('active', isHidden);
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

function trustIcons(r) {
  const icons = [];
  if (r.gps_verified) icons.push('<span>📍</span>');
  if (r.photo_url) icons.push(`<button class="photo-icon-btn" onclick="openPhotoModal('${r.photo_url}')">📷</button>`);
  return icons.join('');
}

function openPhotoModal(url) {
  document.getElementById('photo-modal-img').src = url;
  document.getElementById('photo-modal').classList.remove('hidden');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.add('hidden');
  document.getElementById('photo-modal-img').src = '';
}

// ── 재고 제보 ────────────────────────────────────────────

function showToast(msg = '제보 완료!') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function calcDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcTrustLevel(gpsVerified, hasPhoto) {
  if (gpsVerified && hasPhoto) return '높음';
  if (gpsVerified || hasPhoto) return '보통';
  return '낮음';
}

const REPORT_WINDOW_MS = 16 * 60 * 60 * 1000;

function getMyReport(storeId) {
  const data = localStorage.getItem(`stock_report_${storeId}`);
  if (!data) return null;
  try { return JSON.parse(data); } catch { return null; }
}

function setMyReport(storeId, id) {
  localStorage.setItem(`stock_report_${storeId}`, JSON.stringify({ id, time: Date.now() }));
}

async function loadStockReports(storeId) {
  const { data } = await db.from('stock_reports')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(3);
  const el = document.getElementById('stock-report-list');
  if (!data || !data.length) {
    el.innerHTML = '<p class="no-report">아직 제보가 없어요</p>';
    return;
  }
  el.innerHTML = data.map(r => {
    const typeStr = r.report_type === 'available' ? '✅ 있어요' : r.report_type === 'low_stock' ? '⚠️ 마지막 몇 개' : '❌ 없어요';
    const icons = trustIcons(r);
    return `<div class="stock-report-item">
      <span class="report-type">${typeStr}</span>
      <span class="report-time">${relativeTime(r.created_at)}</span>
      ${icons ? `<span class="report-icons">${icons}</span>` : ''}
    </div>`;
  }).join('');
}

let pendingReportType = null;

function submitStockReport(reportType) {
  if (!currentStore) return;
  pendingReportType = reportType;
  document.getElementById('stock-photo-input').value = '';
  document.getElementById('stock-photo-modal').classList.remove('hidden');
}

async function doSubmitStockReport(photoFile) {
  if (!currentStore || !pendingReportType) return;
  const storeId = currentStore.id;

  let gpsVerified = false;
  if (userLat !== null && userLng !== null) {
    gpsVerified = calcDistanceMeters(userLat, userLng, currentStore.lat, currentStore.lng) <= 300;
  }

  let photoUrl = null;
  if (photoFile) {
    const ext = photoFile.name.split('.').pop();
    const fileName = `stock_${storeId}_${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage.from('reports').upload(fileName, photoFile);
    if (!uploadError) {
      const { data: urlData } = db.storage.from('reports').getPublicUrl(fileName);
      photoUrl = urlData.publicUrl;
    }
  }

  const trustLevel = calcTrustLevel(gpsVerified, !!photoUrl);

  // 16시간 이내 재제보면 내 이전 제보 삭제
  const myPrev = getMyReport(storeId);
  if (myPrev && Date.now() - myPrev.time < REPORT_WINDOW_MS) {
    await db.from('stock_reports').delete().eq('id', myPrev.id);
  }

  const { data: inserted, error } = await db.from('stock_reports').insert({
    store_id: storeId,
    report_type: pendingReportType,
    gps_verified: gpsVerified,
    photo_url: photoUrl,
    trust_level: trustLevel
  }).select('id').single();

  if (error) { alert('제보 실패: ' + error.message); return; }

  setMyReport(storeId, inserted.id);

  // 핀 색 즉시 업데이트
  stockReportMap[storeId] = { store_id: storeId, report_type: pendingReportType, created_at: new Date().toISOString() };
  const pinIdx = renderedStores.findIndex(s => s.id === storeId);
  if (pinIdx !== -1 && markerElements[pinIdx]) {
    const pin = getPinColor(stockReportMap[storeId], storeId);
    if (pin.type === 'image') {
      const img = markerElements[pinIdx].querySelector('img');
      if (img) img.src = pin.value;
    } else {
      markerElements[pinIdx].style.background = pin.value;
    }
  }

  // 3개 초과 시 오래된 것 삭제
  const { data: all } = await db.from('stock_reports')
    .select('id')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (all && all.length > 3) {
    const toDelete = all.slice(3).map(r => r.id);
    await db.from('stock_reports').delete().in('id', toDelete);
  }

  // 알림 전송
  const sentReportType = pendingReportType;
  const sentStore = { ...currentStore };

  document.getElementById('stock-photo-modal').classList.add('hidden');
  pendingReportType = null;
  loadStockReports(storeId);
  showToast();

  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  fetch('/api/push-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: sentStore, reportType: sentReportType, favorites })
  }).catch(() => {});
}

// ── 판매처 제보 ───────────────────────────────────────────

let reportLat = null;
let reportLng = null;
let reportAddress = null;
let mapPickerMap = null;
let pickerLat = null;
let pickerLng = null;

function openStoreReportModal() {
  document.getElementById('report-name').value = '';
  document.getElementById('report-phone').value = '';
  document.getElementById('report-items').value = '';
  document.getElementById('report-photo').value = '';
  document.getElementById('report-step2-address').textContent = '';
  reportLat = null;
  reportLng = null;
  reportAddress = null;
}

function openMapPicker() {
  document.getElementById('store-report-modal').classList.add('hidden');
  document.getElementById('map-picker').classList.remove('hidden');

  const initLat = reportLat || userLat || DEFAULT_LAT;
  const initLng = reportLng || userLng || DEFAULT_LNG;

  if (!mapPickerMap) {
    mapPickerMap = new kakao.maps.Map(document.getElementById('map-picker-map'), {
      center: new kakao.maps.LatLng(initLat, initLng),
      level: 1
    });
    kakao.maps.event.addListener(mapPickerMap, 'dragend', updatePickerAddress);
    kakao.maps.event.addListener(mapPickerMap, 'zoom_changed', updatePickerAddress);
  } else {
    mapPickerMap.setCenter(new kakao.maps.LatLng(initLat, initLng));
    mapPickerMap.setLevel(1);
    mapPickerMap.relayout();
  }

  updatePickerAddress();
}

function updatePickerAddress() {
  const center = mapPickerMap.getCenter();
  pickerLat = center.getLat();
  pickerLng = center.getLng();
  const geocoder = new kakao.maps.services.Geocoder();
  geocoder.coord2Address(pickerLng, pickerLat, (result, status) => {
    document.getElementById('map-picker-address').textContent =
      status === kakao.maps.services.Status.OK
        ? (result[0].road_address?.address_name || result[0].address.address_name)
        : '주소를 가져올 수 없습니다';
  });
}

function confirmMapPicker() {
  reportLat = pickerLat;
  reportLng = pickerLng;
  reportAddress = document.getElementById('map-picker-address').textContent;
  document.getElementById('report-step2-address').textContent = `📍 ${reportAddress}`;
  document.getElementById('map-picker').classList.add('hidden');
  document.getElementById('store-report-modal').classList.remove('hidden');
  goReportStep(2);
}

function cancelMapPicker() {
  document.getElementById('map-picker').classList.add('hidden');
  document.getElementById('store-report-modal').classList.add('hidden');
}

function goReportStep(step) {
  [2, 3].forEach(s => {
    document.getElementById(`report-step-${s}`).classList.toggle('hidden', s !== step);
  });
}

async function submitStoreReport() {
  const name = document.getElementById('report-name').value.trim();
  const type = document.getElementById('report-type').value;
  const phone = document.getElementById('report-phone').value.trim();
  const items = document.getElementById('report-items').value.trim();
  const photoFile = document.getElementById('report-photo').files[0];

  if (!name) return alert('상호명을 입력해주세요.');
  if (!reportLat || !reportLng) return alert('지도에서 위치를 선택해주세요.');

  const lat = reportLat, lng = reportLng, address = reportAddress || '';

  let photoUrl = null;
  if (photoFile) {
    const ext = photoFile.name.split('.').pop();
    const fileName = `store_${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage.from('reports').upload(fileName, photoFile);
    if (!uploadError) {
      const { data: urlData } = db.storage.from('reports').getPublicUrl(fileName);
      photoUrl = urlData.publicUrl;
    }
  }

  const { error } = await db.from('pending_stores').insert({ name, address, lat, lng, phone, items, type, photo_url: photoUrl });
  if (error) return alert('제보 실패: ' + error.message);

  document.getElementById('store-report-modal').classList.add('hidden');
  showToast('제보해주셔서 감사합니다!');
}

// ── 알림 ────────────────────────────────────────────────

const NOTI_LOG_KEY = 'notiLog';

function getNotiLog() {
  try { return JSON.parse(localStorage.getItem(NOTI_LOG_KEY) || '[]'); } catch { return []; }
}

function addNotiLog(entry) {
  const log = getNotiLog();
  log.unshift(entry);
  if (log.length > 50) log.splice(50);
  localStorage.setItem(NOTI_LOG_KEY, JSON.stringify(log));
}

function updateNotiGpsLocation(lat, lng) {
  navigator.serviceWorker?.ready.then(async reg => {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
        auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
        lastLat: lat,
        lastLng: lng
      })
    }).catch(() => {});
  });
}

function renderNotiLogView() {
  const contentEl = document.getElementById('list-content');
  const titleEl = document.getElementById('list-title');
  const log = getNotiLog();
  titleEl.textContent = '알림 모음';
  if (!log.length) {
    contentEl.innerHTML = '<p class="list-empty">받은 알림이 없어요.</p>';
    return;
  }
  contentEl.innerHTML = log.map(n => {
    const reportNames = { available: '있어요', low_stock: '마지막 몇 개', batch: '모아서 알림' };
    const timeStr = new Date(n.time).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'numeric', minute:'numeric' });
    return `<div class="list-store-card" onclick="onListCardClick(${n.storeId || 0})">
      <div class="list-store-name-row">
        <span class="list-store-name">${n.title}</span>
        <span class="list-store-dist" style="font-size:11px">${timeStr}</span>
      </div>
      <p class="list-store-address">${n.body}</p>
    </div>`;
  }).join('');
}

function initServiceWorkerMessages() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'push-received') {
      addNotiLog({ ...e.data.payload, time: Date.now() });
    }
    if (e.data?.type === 'notification-click') {
      switchTab('list');
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.filter-btn[data-type="notifications"]').classList.add('active');
      activeType = 'notifications';
      renderNotiLogView();
    }
  });
}

// URL 파라미터로 알림 탭 직접 열기
function checkNotificationTabParam() {
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'notifications') {
    history.replaceState(null, '', '/');
    switchTab('list');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-type="notifications"]').classList.add('active');
    activeType = 'notifications';
    renderNotiLogView();
  }
}
