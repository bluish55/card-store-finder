let db;
let allStoreData = [];
let currentFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 5;

window.addEventListener('load', () => {
  db = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

  document.querySelectorAll('.list-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.list-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.type;
      currentPage = 1;
      renderList();
    });
  });
});

function openMenu() {
  document.getElementById('side-menu').classList.remove('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('side-menu').classList.add('hidden');
  document.getElementById('menu-overlay').classList.add('hidden');
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert('로그인 실패: ' + error.message);
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  document.getElementById('menu-btn').classList.remove('hidden');
  document.getElementById('menu-email').textContent = email;
  loadStoreList();
}

async function logout() {
  await db.auth.signOut();
  location.reload();
}

async function addStore() {
  const address = document.getElementById('address').value;

  const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, {
    headers: { 'Authorization': `KakaoAK ${CONFIG.kakao.restKey}` }
  });
  const json = await res.json();
  if (!json.documents.length) return alert('주소를 찾을 수 없어요.');

  const { x: lng, y: lat } = json.documents[0].address;

  const { error } = await db.from('stores').insert({
    name: document.getElementById('name').value,
    address: address,
    phone: document.getElementById('phone').value,
    items: document.getElementById('items').value,
    type: document.getElementById('type').value,
    lat: parseFloat(lat),
    lng: parseFloat(lng)
  });

  if (error) return alert('저장 실패: ' + error.message);
  alert('추가 완료!');
  loadStoreList();
}

async function loadStoreList() {
  const { data } = await db.from('stores').select('*');
  allStoreData = data || [];
  currentPage = 1;
  renderList();
}

function renderList() {
  const filtered = currentFilter === 'all' ? allStoreData : allStoreData.filter(s => s.type === currentFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  document.getElementById('store-list').innerHTML = pageData.map(s => `
    <div style="border:1px solid #ddd;padding:12px;border-radius:8px;margin-bottom:8px;">
      <strong>${s.name}</strong> (${s.type})<br>
      ${s.address}<br>
      <button onclick="deleteStore('${s.id}')">삭제</button>
    </div>
  `).join('');

  document.getElementById('page-info').textContent = `${currentPage} / ${totalPages} (${filtered.length}개)`;
  document.getElementById('prev-btn').disabled = currentPage <= 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;
}

function changePage(dir) {
  currentPage += dir;
  renderList();
}

async function deleteStore(id) {
  if (!confirm('삭제할까요?')) return;
  await db.from('stores').delete().eq('id', id);
  loadStoreList();
}

async function uploadCSV() {
  const file = document.getElementById('csv-file').files[0];
  if (!file) return alert('CSV 파일을 선택해주세요.');

  const text = await file.text();
  const lines = text.trim().split('\n');
  const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()));

  const status = document.getElementById('upload-status');
  status.textContent = `총 ${rows.length}개 처리 중...`;

  let success = 0, fail = 0;
  const failedItems = [];

  for (const row of rows) {
    const [name, address, phone, items, type] = row;
    if (!name || !address) { fail++; failedItems.push(`${name || '이름없음'} (주소없음)`); continue; }

    try {
      const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, {
        headers: { 'Authorization': `KakaoAK ${CONFIG.kakao.restKey}` }
      });
      const json = await res.json();
      if (!json.documents.length) { fail++; failedItems.push(`${name} - 주소 못찾음`); continue; }

      const { x: lng, y: lat } = json.documents[0].address;

      const { data: existing } = await db.from('stores').select('id').eq('address', address).single();

      if (existing) {
        await db.from('stores').update({ name, phone, items, type, lat: parseFloat(lat), lng: parseFloat(lng) }).eq('id', existing.id);
      } else {
        await db.from('stores').insert({ name, address, phone, items, type, lat: parseFloat(lat), lng: parseFloat(lng) });
      }
      success++;
    } catch (e) {
      fail++;
      failedItems.push(`${name} - 오류`);
    }
  }

  status.innerHTML = `완료: ${success}개 성공, ${fail}개 실패` +
    (failedItems.length ? `<br><br><b>실패 목록:</b><br>` + failedItems.join('<br>') : '');
  loadStoreList();
}
