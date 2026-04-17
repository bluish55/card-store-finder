let db;
let map;
let markers = [];
let allStores = [];
let activeType = 'all';

const typeColors = {
  '자판기': '#e53935',
  '편의점': '#1e88e5',
  '문방구': '#43a047'
};

async function initMap() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => createMap(pos.coords.latitude, pos.coords.longitude),
      () => createMap(37.5665, 126.9780)
    );
  } else {
    createMap(37.5665, 126.9780);
  }
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
});
