let db;
let map;
let markers = [];
let markerElements = [];
let renderedStores = [];
let allStores = [];
let activeType = 'all';
let currentStore = null;
let userLat = null;
let userLng = null;

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

const typeColors = {
  '자판기': '#e53935',
  '편의점': '#1e88e5',
  '문방구': '#43a047'
};

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
    level: 3
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

async function loadStores() {
  const { data, error } = await db.from('stores').select('*');
  if (error) return console.error(error);
  allStores = data;
  renderMarkers(data);
}

function renderMarkers(stores) {
  markers.forEach(m => m.setMap(null));
  markers = [];
  markerElements = [];
  renderedStores = [];

  const typeIcons = {
    '자판기': 'icons/vending.png',
    '편의점': 'icons/convenience.png',
    '문방구': 'icons/stationery.png',
    '카드샵': 'icons/stationery.png'
  };

  const level = map.getLevel();
  const visible = level <= 9;
  const size = getPinSize();

  stores.forEach(store => {
    const el = document.createElement('img');
    el.src = typeIcons[store.type] || 'icons/vending.png';
    el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));object-fit:contain`;
    markerElements.push(el);
    renderedStores.push(store);

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(store.lat, store.lng),
      content: el
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
  document.getElementById('stock-report-list').innerHTML = '';
  loadStockReports(store.id);
  document.getElementById('store-panel').classList.remove('hidden');
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.type;
    let filtered;
    if (activeType === 'all') filtered = allStores;
    else if (activeType === '찜') filtered = allStores.filter(s => isFavorite(s.id));
    else filtered = allStores.filter(s => s.type === activeType);
    renderMarkers(filtered);
  });
});

function openSearch() {
  document.getElementById('search-bar').classList.remove('hidden');
  document.getElementById('search-btn').classList.add('hidden');
  document.getElementById('filter-bar').classList.add('hidden');
  document.getElementById('search-input').focus();
}

function closeSearch() {
  document.getElementById('search-bar').classList.add('hidden');
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('search-btn').classList.remove('hidden');
  document.getElementById('filter-bar').classList.remove('hidden');
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
  ['#top-row', '#store-panel', '#location-btn', '#location-popup', '#location-denied-banner', '#bottom-nav', '#list-view', '#settings-view'].forEach(sel => {
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

  // 위치 토글
  document.getElementById('location-toggle').addEventListener('change', (e) => {
    setLocationPref(e.target.checked);
    if (e.target.checked) {
      document.getElementById('location-denied-banner').classList.add('hidden');
      getCurrentLocation();
    }
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
        return;
      }
      switchTab(btn.dataset.tab);
    });
  });

  // 리스트 정렬
  document.getElementById('list-sort-btn').addEventListener('click', () => {
    listSortMode = listSortMode === 'distance' ? 'alpha' : 'distance';
    document.getElementById('list-sort-btn').textContent = listSortMode === 'distance' ? '📍' : '가나다';
    renderListView();
  });
  document.getElementById('store-report-close').addEventListener('click', () => {
    document.getElementById('store-report-modal').classList.add('hidden');
  });

  // 지도 picker
  document.getElementById('map-picker-confirm').addEventListener('click', confirmMapPicker);
  document.getElementById('map-picker-cancel').addEventListener('click', cancelMapPicker);

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

let listSortMode = 'distance';

function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const isMap = tabName === 'map';
  document.getElementById('top-row').classList.toggle('hidden', !isMap);
  document.getElementById('location-btn').classList.toggle('hidden', !isMap);
  document.getElementById('list-view').classList.toggle('hidden', tabName !== 'list');
  document.getElementById('settings-view').classList.toggle('hidden', tabName !== 'settings');

  if (tabName === 'list') renderListView();
  if (isMap && map) map.relayout();
}

function renderListView() {
  const contentEl = document.getElementById('list-content');
  const titleEl = document.getElementById('list-title');

  if (!userLat || !userLng) {
    titleEl.textContent = '주변 판매점';
    contentEl.innerHTML = '<p class="list-empty">위치 정보가 없어요.<br>설정 탭에서 내 위치를 켜주세요.</p>';
    return;
  }

  const nearby = allStores
    .map(s => ({ ...s, distNum: calcDistanceNum(userLat, userLng, s.lat, s.lng) }))
    .filter(s => s.distNum <= 1)
    .sort((a, b) => listSortMode === 'distance'
      ? a.distNum - b.distNum
      : a.name.localeCompare(b.name, 'ko'));

  titleEl.textContent = `주변 판매점 (${nearby.length})`;

  if (!nearby.length) {
    contentEl.innerHTML = '<p class="list-empty">1km 이내 판매점이 없어요.</p>';
    return;
  }

  contentEl.innerHTML = nearby.map(s =>
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
    const d = new Date(r.created_at);
    const timeStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    const typeStr = r.report_type === 'available' ? '✅ 있어요' : r.report_type === 'low_stock' ? '⚠️ 마지막 몇 개' : '❌ 없어요';
    return `<div class="stock-report-item">
      <span class="report-type">${typeStr}</span>
      <span class="report-time">${timeStr}</span>
      <span class="report-trust trust-${r.trust_level}">${r.trust_level}</span>
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

  // 3개 초과 시 오래된 것 삭제
  const { data: all } = await db.from('stock_reports')
    .select('id')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  if (all && all.length > 3) {
    const toDelete = all.slice(3).map(r => r.id);
    await db.from('stock_reports').delete().in('id', toDelete);
  }

  document.getElementById('stock-photo-modal').classList.add('hidden');
  pendingReportType = null;
  loadStockReports(storeId);
  showToast();
}

// ── 판매처 제보 ───────────────────────────────────────────

let reportLat = null;
let reportLng = null;
let reportAddress = null;
let mapPickerMap = null;
let pickerLat = null;
let pickerLng = null;

function openStoreReportModal() {
  document.getElementById('store-report-modal').classList.remove('hidden');
  document.getElementById('report-name').value = '';
  document.getElementById('report-phone').value = '';
  document.getElementById('report-items').value = '';
  document.getElementById('report-photo').value = '';
  reportLat = null;
  reportLng = null;
  reportAddress = null;
  document.getElementById('report-step1-next').classList.add('btn-inactive');
  goReportStep(1);

  const tryGPS = (lat, lng) => {
    reportLat = lat;
    reportLng = lng;
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (status === kakao.maps.services.Status.OK) {
        reportAddress = result[0].road_address?.address_name || result[0].address.address_name;
        document.getElementById('report-location-text').textContent = `📍 ${reportAddress}`;
      }
    });
  };

  if (userLat !== null && userLng !== null) {
    tryGPS(userLat, userLng);
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => tryGPS(pos.coords.latitude, pos.coords.longitude),
      () => { document.getElementById('report-location-text').textContent = '지도에서 위치를 선택해주세요.'; }
    );
  } else {
    document.getElementById('report-location-text').textContent = '지도에서 위치를 선택해주세요.';
  }
}

function openMapPicker() {
  document.getElementById('store-report-modal').classList.add('hidden');
  document.getElementById('map-picker').classList.remove('hidden');

  const initLat = reportLat || DEFAULT_LAT;
  const initLng = reportLng || DEFAULT_LNG;

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
  document.getElementById('report-location-text').textContent = `📍 ${reportAddress}`;
  document.getElementById('report-step1-next').classList.remove('btn-inactive');
  document.getElementById('map-picker').classList.add('hidden');
  document.getElementById('store-report-modal').classList.remove('hidden');
}

function cancelMapPicker() {
  document.getElementById('map-picker').classList.add('hidden');
  document.getElementById('store-report-modal').classList.remove('hidden');
}

function handleReportNext() {
  if (document.getElementById('report-step1-next').classList.contains('btn-inactive')) {
    openMapPicker();
  } else {
    goReportStep(2);
  }
}

function goReportStep(step) {
  [1, 2, 3].forEach(s => {
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
