let db;
let map;
let markers = [];
let markerElements = [];
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

function getPinSize() {
  const level = map.getLevel();
  return Math.min(28, Math.max(14, 26 - (level - 3) * 2));
}

function updateMarkerVisibility() {
  const level = map.getLevel();
  const visible = level <= 9;
  const size = getPinSize();
  markers.forEach((m, i) => {
    m.setMap(visible ? map : null);
    if (markerElements[i]) markerElements[i].style.fontSize = size + 'px';
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

  const typeEmojis = {
    '자판기': '🎰',
    '편의점': '🏪',
    '문방구': '✏️',
    '카드샵': '🃏'
  };

  const level = map.getLevel();
  const visible = level <= 9;
  const size = getPinSize();

  stores.forEach(store => {
    const el = document.createElement('div');
    el.style.cssText = `font-size:${size}px;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));line-height:1`;
    el.textContent = typeEmojis[store.type] || '📍';
    markerElements.push(el);

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(store.lat, store.lng),
      content: el
    });
    overlay.setMap(visible ? map : null);
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

function openSearch() {
  document.getElementById('search-bar').classList.remove('hidden');
  document.getElementById('search-btn').classList.add('hidden');
  document.getElementById('menu-btn').classList.add('hidden');
  document.getElementById('filter-bar').classList.add('hidden');
  document.getElementById('search-input').focus();
}

function closeSearch() {
  document.getElementById('search-bar').classList.add('hidden');
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('search-btn').classList.remove('hidden');
  document.getElementById('menu-btn').classList.remove('hidden');
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

  // 검색
  document.getElementById('search-btn').addEventListener('click', openSearch);
  document.getElementById('search-close').addEventListener('click', closeSearch);
  document.getElementById('search-input').addEventListener('input', (e) => {
    updateDropdown(e.target.value.trim());
  });

  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchLocation();
  });

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

  document.getElementById('location-btn').addEventListener('click', () => {
    if (getLocationPref() !== 'true') {
      showLocationPopup();
    } else {
      getCurrentLocation();
    }
  });
});
