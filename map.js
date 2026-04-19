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
  document.getElementById('menu-btn').classList.add('hidden');
  document.getElementById('search-input').focus();
}

function closeSearch() {
  document.getElementById('search-bar').classList.add('hidden');
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('search-btn').classList.remove('hidden');
  document.getElementById('filter-bar').classList.remove('hidden');
  document.getElementById('menu-btn').classList.remove('hidden');
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

  document.getElementById('list-btn').addEventListener('click', () => {
    const bounds = map.getBounds();
    const visible = renderedStores.filter((s, i) =>
      markers[i] && markers[i].getMap() !== null &&
      bounds.contain(new kakao.maps.LatLng(s.lat, s.lng))
    );
    localStorage.setItem('listStores', JSON.stringify(visible));
    window.location.href = 'list.html';
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
});
