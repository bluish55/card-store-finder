let db;
let allStoreData = [];
let currentFilter = 'all';
let currentSort = 'created';
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

  document.getElementById('sort-select').addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    renderList();
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
  const manualLat = parseFloat(document.getElementById('lat').value);
  const manualLng = parseFloat(document.getElementById('lng').value);

  let lat, lng;

  const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, {
    headers: { 'Authorization': `KakaoAK ${CONFIG.kakao.restKey}` }
  });
  const json = await res.json();

  if (json.documents.length) {
    lat = parseFloat(json.documents[0].address.y);
    lng = parseFloat(json.documents[0].address.x);
  } else if (!isNaN(manualLat) && !isNaN(manualLng)) {
    lat = manualLat;
    lng = manualLng;
  } else {
    return alert('주소를 찾을 수 없어요.\n구글맵에서 좌표를 찾아 위도/경도를 직접 입력해주세요.');
  }

  const { error } = await db.from('stores').insert({
    name: document.getElementById('name').value,
    address: address,
    phone: document.getElementById('phone').value,
    items: document.getElementById('items').value,
    type: document.getElementById('type').value,
    lat, lng
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

function renderDuplicates() {
  const groups = {};
  allStoreData.forEach(s => {
    if (!groups[s.address]) groups[s.address] = [];
    groups[s.address].push(s);
  });
  const dupGroups = Object.values(groups).filter(g => g.length > 1);

  const totalPages = Math.max(1, dupGroups.length);
  if (currentPage > totalPages) currentPage = totalPages;

  if (!dupGroups.length) {
    document.getElementById('store-list').innerHTML = '<p style="color:#666;font-size:14px;">중복 주소 없음</p>';
    document.getElementById('page-info').textContent = '0개 그룹';
    document.getElementById('prev-btn').disabled = true;
    document.getElementById('next-btn').disabled = true;
    return;
  }

  const group = dupGroups[currentPage - 1];
  document.getElementById('store-list').innerHTML =
    `<div style="font-size:12px;color:#666;margin-bottom:8px;">📍 ${group[0].address}</div>` +
    group.map(s => `
      <div id="store-card-${s.id}" style="border:1px solid #ddd;padding:12px;border-radius:8px;margin-bottom:8px;">
        <strong>${s.name}</strong> (${s.type})<br>
        ${s.address}<br>
        ${s.phone ? s.phone + '<br>' : ''}
        ${s.items ? s.items + '<br>' : ''}
        <button onclick="editStore('${s.id}')">수정</button>
        <button onclick="deleteStore('${s.id}')">삭제</button>
      </div>
    `).join('');

  document.getElementById('page-info').textContent = `${currentPage} / ${totalPages} (${dupGroups.length}개 그룹)`;
  document.getElementById('prev-btn').disabled = currentPage <= 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;
}

function renderList() {
  if (currentFilter === '중복') {
    renderDuplicates();
    return;
  }

  let filtered = currentFilter === 'all' ? allStoreData : allStoreData.filter(s => s.type === currentFilter);

  if (currentSort === 'name') {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } else if (currentSort === 'type') {
    filtered = [...filtered].sort((a, b) => a.type.localeCompare(b.type, 'ko') || a.name.localeCompare(b.name, 'ko'));
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  document.getElementById('store-list').innerHTML = pageData.map(s => `
    <div id="store-card-${s.id}" style="border:1px solid #ddd;padding:12px;border-radius:8px;margin-bottom:8px;">
      <strong>${s.name}</strong> (${s.type})<br>
      ${s.address}<br>
      ${s.phone ? s.phone + '<br>' : ''}
      ${s.items ? s.items + '<br>' : ''}
      <button onclick="editStore('${s.id}')">수정</button>
      <button onclick="deleteStore('${s.id}')">삭제</button>
    </div>
  `).join('');

  document.getElementById('page-info').textContent = `${currentPage} / ${totalPages} (${filtered.length}개)`;
  document.getElementById('prev-btn').disabled = currentPage <= 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;
}

function editStore(id) {
  const s = allStoreData.find(s => s.id == id);
  const card = document.getElementById(`store-card-${s.id}`);
  card.innerHTML = `
    <input type="text" id="edit-name-${s.id}" value="${s.name}" placeholder="상호명"><br>
    <input type="text" id="edit-address-${s.id}" value="${s.address}" placeholder="주소"><br>
    <input type="number" id="edit-lat-${s.id}" value="${s.lat}" placeholder="위도" step="any">
    <input type="number" id="edit-lng-${s.id}" value="${s.lng}" placeholder="경도" step="any"><br>
    <input type="text" id="edit-phone-${s.id}" value="${s.phone || ''}" placeholder="전화번호"><br>
    <input type="text" id="edit-items-${s.id}" value="${s.items || ''}" placeholder="취급품목"><br>
    <select id="edit-type-${s.id}">
      <option value="자판기" ${s.type === '자판기' ? 'selected' : ''}>자판기</option>
      <option value="편의점" ${s.type === '편의점' ? 'selected' : ''}>편의점</option>
      <option value="문방구" ${s.type === '문방구' ? 'selected' : ''}>문방구</option>
      <option value="카드샵" ${s.type === '카드샵' ? 'selected' : ''}>카드샵</option>
    </select><br>
    <button onclick="saveStore('${s.id}')">저장</button>
    <button onclick="renderList()">취소</button>
  `;
}

async function saveStore(id) {
  const s = allStoreData.find(s => s.id == id);
  const name = document.getElementById(`edit-name-${id}`).value;
  const address = document.getElementById(`edit-address-${id}`).value;
  const phone = document.getElementById(`edit-phone-${id}`).value;
  const items = document.getElementById(`edit-items-${id}`).value;
  const type = document.getElementById(`edit-type-${id}`).value;
  const manualLat = parseFloat(document.getElementById(`edit-lat-${id}`).value);
  const manualLng = parseFloat(document.getElementById(`edit-lng-${id}`).value);

  let lat = manualLat, lng = manualLng;

  if (address !== s.address) {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, {
      headers: { 'Authorization': `KakaoAK ${CONFIG.kakao.restKey}` }
    });
    const json = await res.json();
    if (json.documents.length) {
      lat = parseFloat(json.documents[0].address.y);
      lng = parseFloat(json.documents[0].address.x);
    } else if (isNaN(manualLat) || isNaN(manualLng)) {
      return alert('주소를 찾을 수 없어요.\n구글맵에서 좌표를 찾아 위도/경도를 직접 입력해주세요.');
    }
  }

  const { error } = await db.from('stores').update({ name, address, phone, items, type, lat, lng }).eq('id', id);
  if (error) return alert('저장 실패: ' + error.message);
  loadStoreList();
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

      const { data: existing } = await db.from('stores').select('id').eq('name', name).eq('address', address).single();

      if (existing) {
        const { error: updateErr } = await db.from('stores').update({ name, phone, items, type, lat: parseFloat(lat), lng: parseFloat(lng) }).eq('id', existing.id);
        if (updateErr) { fail++; failedItems.push(`${name} - 수정 실패: ${updateErr.message}`); continue; }
      } else {
        const { error: insertErr } = await db.from('stores').insert({ name, address, phone, items, type, lat: parseFloat(lat), lng: parseFloat(lng) });
        if (insertErr) { fail++; failedItems.push(`${name} - 추가 실패: ${insertErr.message}`); continue; }
      }
      success++;
    } catch (e) {
      fail++;
      failedItems.push(`${name} - 오류: ${e.message}`);
    }
  }

  status.innerHTML = `완료: ${success}개 성공, ${fail}개 실패` +
    (failedItems.length ? `<br><br><b>실패 목록:</b><br>` + failedItems.join('<br>') : '');
  loadStoreList();
}
