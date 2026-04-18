let db;
let map;
let markers = [];
let allStores = [];
let activeType = 'all';

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

function getCurrentLocation() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
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

function createMap(lat, lng) {
  const container = document.getElementById('map');
  const options = {
    center: new kakao.maps.LatLng(lat, lng),
    level: 3
  };
  map = new kakao.maps.Map(container, options);
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

  stores.forEach(store => {
    const color = typeColors[store.type] || '#999';
    const el = document.createElement('div');
    el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer`;

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(store.lat, store.lng),
      content: el
    });
    overlay.setMap(map);
    markers.push(overlay);

    el.addEventListener('click', () => showPanel(store));
  });
}

function showPanel(store) {
  document.getElementById('store-name').textContent = store.name;
  document.getElementById('store-type').textContent = store.type;
  document.getElementById('store-address').textContent = store.address;
  document.getElementById('store-phone').textContent = store.phone || '전화번호 없음';
  document.getElementById('store-items').textContent = store.items || '';
  document.getElementById('store-panel').classList.remove('hidden');
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeType = btn.dataset.type;
    const filtered = activeType === 'all' ? allStores : allStores.filter(s => s.type === activeType);
    renderMarkers(filtered);
  });
});

window.addEventListener('load', () => {
  db = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
  initMap();

  // 햄버거 메뉴
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('menu-overlay').classList.remove('hidden');
    document.getElementById('side-menu').classList.remove('hidden');
  });

  document.getElementById('menu-overlay').addEventListener('click', () => {
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('side-menu').classList.add('hidden');
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
});
