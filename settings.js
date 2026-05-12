const STORAGE_KEY = 'pinPresets';
let db;

// ─── 로그인 ──────────────────────────────────────────────

function initAuth() {
  db = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
  db.auth.getSession().then(({ data: { session } }) => renderAuthSection(session));
  db.auth.onAuthStateChange((_event, session) => renderAuthSection(session));
}

function renderAuthSection(session) {
  const loginPrompt = document.getElementById('login-prompt');
  const profileSection = document.getElementById('profile-section');
  if (session) {
    loginPrompt.classList.add('hidden');
    profileSection.classList.remove('hidden');
    const user = session.user;
    const avatar = document.getElementById('profile-avatar');
    const name = document.getElementById('profile-name');
    if (user.user_metadata?.avatar_url) {
      avatar.src = user.user_metadata.avatar_url;
      avatar.classList.remove('hidden');
    }
    name.textContent = user.user_metadata?.full_name || user.user_metadata?.name || user.email || '';
  } else {
    loginPrompt.classList.remove('hidden');
    profileSection.classList.add('hidden');
  }
}

async function signOut() {
  await db.auth.signOut();
}
let currentPresetId = null;
let currentRuleId = null;
let currentPinType = 'color';
let currentPinImageData = null;
let originalPresetName = '';
let originalRuleOrder = [];
let ruleFormSnapshot = '';

const REPORT_TYPE_NAMES = {
  available: '있어요',
  low_stock: '마지막 몇 개',
  out_of_stock: '없어요',
  no_report: '제보 없음',
  any: '모두'
};

// ─── 데이터 ───────────────────────────────────────────────

function getDefaultPresets() {
  return {
    activeId: 1,
    nextId: 2,
    presets: [{
      id: 1,
      name: '기본 설정',
      nextRuleId: 6,
      rules: [
        { id: 1, condition: { reportType: 'available', timeType: 'max', minHours: null, maxHours: 24, favoriteOnly: false }, pin: { type: 'color', value: '#43a047' } },
        { id: 2, condition: { reportType: 'available', timeType: 'range', minHours: 24, maxHours: 72, favoriteOnly: false }, pin: { type: 'color', value: '#fb8c00' } },
        { id: 3, condition: { reportType: 'low_stock', timeType: 'max', minHours: null, maxHours: 24, favoriteOnly: false }, pin: { type: 'color', value: '#fb8c00' } },
        { id: 4, condition: { reportType: 'out_of_stock', timeType: 'none', minHours: null, maxHours: null, favoriteOnly: false }, pin: { type: 'color', value: '#e53935' } },
        { id: 5, condition: { reportType: 'any', timeType: 'none', minHours: null, maxHours: null, favoriteOnly: false }, pin: { type: 'color', value: '#1e88e5' } },
      ]
    }]
  };
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) try { return JSON.parse(saved); } catch {}
  return getDefaultPresets();
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── 뷰 전환 ─────────────────────────────────────────────

function showMainView() {
  document.getElementById('main-view').classList.remove('hidden');
  document.getElementById('preset-edit-view').classList.add('hidden');
  document.getElementById('rule-edit-view').classList.add('hidden');
  renderPresetList();
}

function showPresetEditView(presetId) {
  currentPresetId = presetId;
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('preset-edit-view').classList.remove('hidden');
  document.getElementById('rule-edit-view').classList.add('hidden');

  const data = loadData();
  const preset = data.presets.find(p => p.id === presetId);
  if (preset) {
    document.getElementById('preset-name-input').value = preset.name;
    originalPresetName = preset.name;
    originalRuleOrder = preset.rules.map(r => r.id);
  }
  renderRuleList();
}

function showRuleEditView() {
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('preset-edit-view').classList.add('hidden');
  document.getElementById('rule-edit-view').classList.remove('hidden');
}

// ─── 프리셋 ──────────────────────────────────────────────

function renderPresetList() {
  const data = loadData();
  const el = document.getElementById('preset-list');

  if (!data.presets.length) {
    el.innerHTML = '<p class="empty-msg">프리셋이 없어요.</p>';
    return;
  }

  el.innerHTML = data.presets.map(p => `
    <div class="preset-item ${p.id === data.activeId ? 'active' : ''}">
      <div class="preset-item-left" onclick="showPresetEditView(${p.id})">
        <span class="preset-name">${p.name}</span>
        <span class="preset-rule-count">${p.rules.length}개 규칙 ›</span>
      </div>
      <div class="preset-item-right">
        ${p.id !== data.activeId
          ? `<button class="btn-activate" onclick="activatePreset(event, ${p.id})">적용</button>`
          : '<span class="active-badge">적용 중</span>'}
        ${data.presets.length > 1
          ? `<button class="btn-delete" onclick="deletePreset(event, ${p.id})">삭제</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

function addPreset() {
  const name = prompt('프리셋 이름을 입력해주세요');
  if (!name || !name.trim()) return;

  const data = loadData();
  data.presets.push({
    id: data.nextId,
    name: name.trim(),
    nextRuleId: 1,
    rules: []
  });
  data.nextId++;
  saveData(data);
  renderPresetList();
}

function activatePreset(e, presetId) {
  e.stopPropagation();
  const data = loadData();
  data.activeId = presetId;
  saveData(data);
  renderPresetList();
}

function deletePreset(e, presetId) {
  e.stopPropagation();
  if (!confirm('이 프리셋을 삭제할까요?')) return;
  const data = loadData();
  data.presets = data.presets.filter(p => p.id !== presetId);
  if (data.activeId === presetId && data.presets.length) data.activeId = data.presets[0].id;
  saveData(data);
  renderPresetList();
}

function savePresetName() {
  const name = document.getElementById('preset-name-input').value.trim();
  if (!name) return;
  const data = loadData();
  const preset = data.presets.find(p => p.id === currentPresetId);
  if (preset) { preset.name = name; saveData(data); }
}

// ─── 규칙 ────────────────────────────────────────────────

function conditionText(condition) {
  let text = REPORT_TYPE_NAMES[condition.reportType] || condition.reportType;
  if (condition.timeType === 'max') text += ` · ${condition.maxHours}h 이내`;
  else if (condition.timeType === 'min') text += ` · ${condition.minHours}h 초과`;
  else if (condition.timeType === 'range') text += ` · ${condition.minHours}~${condition.maxHours}h`;
  if (condition.favoriteOnly) text += ' · 찜만';
  return text;
}

function pinPreviewHTML(pin) {
  if (pin.type === 'image') return `<img class="rule-pin-img" src="${pin.value}">`;
  return `<div class="rule-pin-dot" style="background:${pin.value}"></div>`;
}

function renderRuleList() {
  const data = loadData();
  const preset = data.presets.find(p => p.id === currentPresetId);
  if (!preset) return;

  const el = document.getElementById('rule-list');
  if (!preset.rules.length) {
    el.innerHTML = '<p class="empty-msg">규칙이 없어요. 아래 버튼으로 추가하세요.</p>';
    return;
  }

  el.innerHTML = preset.rules.map((rule) => `
    <div class="rule-item" data-rule-id="${rule.id}">
      <div class="drag-handle">⠿</div>
      <div class="rule-content" onclick="openRuleEdit(${rule.id})">
        <span class="rule-condition">${conditionText(rule.condition)}</span>
        <span class="rule-arrow">→</span>
        ${pinPreviewHTML(rule.pin)}
      </div>
      <button class="rule-delete" onclick="deleteRule(${rule.id})">✕</button>
    </div>
  `).join('');
  initRuleDrag();
}

function initRuleDrag() {
  document.querySelectorAll('#rule-list .rule-item').forEach(item => {
    // 터치
    item.addEventListener('touchstart', e => {
      if (e.target.closest('.rule-delete')) return;
      const touch = e.touches[0];
      const startY = touch.clientY;
      const startX = touch.clientX;

      function onMoveCheck(e) {
        const t = e.touches[0];
        const dy = Math.abs(t.clientY - startY);
        const dx = Math.abs(t.clientX - startX);
        if (dy > 8) {
          e.preventDefault();
          document.removeEventListener('touchmove', onMoveCheck);
          document.removeEventListener('touchend', onEndCheck);
          startDrag(startY, item, 'touch');
        } else if (dx > 8) {
          document.removeEventListener('touchmove', onMoveCheck);
          document.removeEventListener('touchend', onEndCheck);
        }
      }

      function onEndCheck() {
        document.removeEventListener('touchmove', onMoveCheck);
        document.removeEventListener('touchend', onEndCheck);
      }

      document.addEventListener('touchmove', onMoveCheck, { passive: false });
      document.addEventListener('touchend', onEndCheck);
    }, { passive: true });

    // 마우스
    item.addEventListener('mousedown', e => {
      if (e.target.closest('.rule-delete') || e.target.closest('.rule-content')) return;
      startDrag(e.clientY, item, 'mouse');
    });
  });
}

function startDrag(startY, el, inputType) {
  const rect = el.getBoundingClientRect();
  const offsetY = startY - rect.top;

  const ph = document.createElement('div');
  ph.className = 'drag-placeholder';
  ph.style.height = rect.height + 'px';
  el.after(ph);

  el.classList.add('dragging');
  el.style.position = 'fixed';
  el.style.top = rect.top + 'px';
  el.style.width = rect.width + 'px';
  el.style.zIndex = '999';

  function getClientY(e) {
    return inputType === 'touch' ? e.touches[0].clientY : e.clientY;
  }

  function onMove(e) {
    if (inputType === 'touch') e.preventDefault();
    const y = getClientY(e);
    el.style.top = (y - offsetY) + 'px';

    const siblings = [...document.querySelectorAll('#rule-list .rule-item:not(.dragging)')];
    const over = siblings.find(s => {
      const r = s.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (over) {
      const r = over.getBoundingClientRect();
      y < r.top + r.height / 2 ? over.before(ph) : over.after(ph);
    }
  }

  function onEnd() {
    if (inputType === 'touch') {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    } else {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    }

    el.classList.remove('dragging');
    el.style.position = '';
    el.style.top = '';
    el.style.width = '';
    el.style.zIndex = '';
    ph.replaceWith(el);

    // 순서는 뒤로가기 시 저장 여부 확인 후 저장
  }

  if (inputType === 'touch') {
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  } else {
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }
}

function deleteRule(ruleId) {
  if (!confirm('이 규칙을 삭제할까요?')) return;
  const data = loadData();
  const preset = data.presets.find(p => p.id === currentPresetId);
  if (!preset) return;
  preset.rules = preset.rules.filter(r => r.id !== ruleId);
  saveData(data);
  renderRuleList();
}

function openRuleEdit(ruleId) {
  currentRuleId = ruleId;
  currentPinImageData = null;
  showRuleEditView();

  if (ruleId !== null) {
    const data = loadData();
    const preset = data.presets.find(p => p.id === currentPresetId);
    const rule = preset?.rules.find(r => r.id === ruleId);
    if (rule) {
      document.getElementById('rule-report-type').value = rule.condition.reportType;
      document.getElementById('rule-time-type').value = rule.condition.timeType;
      document.getElementById('rule-min-hours').value = rule.condition.minHours ?? '';
      document.getElementById('rule-max-hours').value = rule.condition.maxHours ?? '';
      document.getElementById('rule-favorite-only').checked = rule.condition.favoriteOnly;
      setPinType(rule.pin.type);
      if (rule.pin.type === 'color') {
        document.getElementById('rule-pin-color').value = rule.pin.value;
      } else {
        currentPinImageData = rule.pin.value;
        document.getElementById('pin-image-preview').innerHTML = `<img src="${rule.pin.value}" class="pin-img-thumb">`;
      }
    }
  } else {
    document.getElementById('rule-report-type').value = 'any';
    document.getElementById('rule-time-type').value = 'none';
    document.getElementById('rule-min-hours').value = '';
    document.getElementById('rule-max-hours').value = '';
    document.getElementById('rule-favorite-only').checked = false;
    setPinType('color');
    document.getElementById('rule-pin-color').value = '#1e88e5';
    document.getElementById('pin-image-preview').innerHTML = '';
  }
  updateTimeInputs();
  ruleFormSnapshot = getRuleFormSnapshot();
}

function getRuleFormSnapshot() {
  return JSON.stringify({
    reportType: document.getElementById('rule-report-type').value,
    timeType: document.getElementById('rule-time-type').value,
    minHours: document.getElementById('rule-min-hours').value,
    maxHours: document.getElementById('rule-max-hours').value,
    favoriteOnly: document.getElementById('rule-favorite-only').checked,
    pinType: currentPinType,
    pinColor: document.getElementById('rule-pin-color').value,
    pinImage: currentPinImageData
  });
}

function showUnsavedModal(onSave, onDiscard) {
  const modal = document.getElementById('unsaved-modal');
  modal.classList.remove('hidden');
  document.getElementById('unsaved-save').onclick = () => {
    modal.classList.add('hidden');
    onSave();
  };
  document.getElementById('unsaved-discard').onclick = () => {
    modal.classList.add('hidden');
    onDiscard();
  };
}

function getCurrentRuleOrder() {
  return [...document.querySelectorAll('#rule-list .rule-item')]
    .map(el => parseInt(el.dataset.ruleId)).join(',');
}

function saveRuleOrder() {
  const newOrder = [...document.querySelectorAll('#rule-list .rule-item')]
    .map(el => parseInt(el.dataset.ruleId));
  const data = loadData();
  const preset = data.presets.find(p => p.id === currentPresetId);
  if (preset) {
    preset.rules = newOrder.map(id => preset.rules.find(r => r.id === id)).filter(Boolean);
    saveData(data);
  }
}

function backFromPresetEdit() {
  const currentName = document.getElementById('preset-name-input').value.trim();
  const nameChanged = currentName !== originalPresetName;
  const orderChanged = getCurrentRuleOrder() !== originalRuleOrder.join(',');

  if (nameChanged || orderChanged) {
    showUnsavedModal(
      () => { savePresetName(); saveRuleOrder(); showMainView(); },
      () => showMainView()
    );
    return;
  }
  showMainView();
}

function backFromRuleEdit() {
  if (getRuleFormSnapshot() !== ruleFormSnapshot) {
    showUnsavedModal(
      () => saveRule(),
      () => closeRuleEdit()
    );
    return;
  }
  closeRuleEdit();
}

function closeRuleEdit() {
  currentRuleId = null;
  currentPinImageData = null;
  showPresetEditView(currentPresetId);
}

function saveRule() {
  const reportType = document.getElementById('rule-report-type').value;
  const timeType = document.getElementById('rule-time-type').value;
  const minHours = document.getElementById('rule-min-hours').value !== ''
    ? parseInt(document.getElementById('rule-min-hours').value) : null;
  const maxHours = document.getElementById('rule-max-hours').value !== ''
    ? parseInt(document.getElementById('rule-max-hours').value) : null;
  const favoriteOnly = document.getElementById('rule-favorite-only').checked;

  let pin;
  if (currentPinType === 'image') {
    if (!currentPinImageData) { alert('이미지를 선택해주세요.'); return; }
    pin = { type: 'image', value: currentPinImageData };
  } else {
    pin = { type: 'color', value: document.getElementById('rule-pin-color').value };
  }

  const condition = { reportType, timeType, minHours, maxHours, favoriteOnly };
  const data = loadData();
  const preset = data.presets.find(p => p.id === currentPresetId);
  if (!preset) return;

  if (currentRuleId !== null) {
    const rule = preset.rules.find(r => r.id === currentRuleId);
    if (rule) { rule.condition = condition; rule.pin = pin; }
  } else {
    preset.rules.push({ id: preset.nextRuleId, condition, pin });
    preset.nextRuleId++;
  }

  saveData(data);
  closeRuleEdit();
}

// ─── 핀 타입 ─────────────────────────────────────────────

function setPinType(type) {
  currentPinType = type;
  document.querySelectorAll('.pin-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  document.getElementById('pin-color-field').classList.toggle('hidden', type !== 'color');
  document.getElementById('pin-image-field').classList.toggle('hidden', type !== 'image');
}

function previewPinImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    currentPinImageData = e.target.result;
    document.getElementById('pin-image-preview').innerHTML =
      `<img src="${currentPinImageData}" class="pin-img-thumb">`;
  };
  reader.readAsDataURL(file);
}

// ─── 시간 조건 UI ─────────────────────────────────────────

function updateTimeInputs() {
  const timeType = document.getElementById('rule-time-type').value;
  const timeInputs = document.getElementById('time-inputs');
  const separator = document.getElementById('time-separator');
  const minInput = document.getElementById('rule-min-hours');
  const maxInput = document.getElementById('rule-max-hours');

  timeInputs.classList.toggle('hidden', timeType === 'none');

  if (timeType === 'max') {
    minInput.classList.add('hidden');
    separator.classList.add('hidden');
    maxInput.classList.remove('hidden');
    maxInput.placeholder = '시간';
  } else if (timeType === 'min') {
    minInput.classList.remove('hidden');
    separator.classList.add('hidden');
    maxInput.classList.add('hidden');
    minInput.placeholder = '시간';
  } else if (timeType === 'range') {
    minInput.classList.remove('hidden');
    separator.classList.remove('hidden');
    maxInput.classList.remove('hidden');
    minInput.placeholder = '시작';
    maxInput.placeholder = '끝';
  }
}

// ─── 위치 토글 ────────────────────────────────────────────

function initLocationToggle() {
  const toggle = document.getElementById('location-toggle');
  toggle.checked = localStorage.getItem('locationEnabled') === 'true';
  toggle.addEventListener('change', (e) => {
    localStorage.setItem('locationEnabled', String(e.target.checked));
  });
}

// ─── 알림 프리셋 ─────────────────────────────────────────

const NOTI_KEY = 'notiPresets';
let currentNotiPresetId = null;
let notiLocType = 'gps';
let notiFixedLat = null;
let notiFixedLng = null;
let notiFixedAddress = '';
let notiPickerMap = null;
let notiPickerLat = null;
let notiPickerLng = null;

function getNotiPresets() {
  try { return JSON.parse(localStorage.getItem(NOTI_KEY) || '[]'); } catch { return []; }
}

function saveNotiPresets(presets) {
  localStorage.setItem(NOTI_KEY, JSON.stringify(presets));
}

function renderNotiPresetList() {
  const presets = getNotiPresets();
  const el = document.getElementById('noti-preset-list');
  if (!presets.length) {
    el.innerHTML = '<div style="padding:12px 16px;font-size:14px;color:#aaa">알림 프리셋이 없어요</div>';
    return;
  }
  el.innerHTML = presets.map(p => `
    <div class="settings-item" style="cursor:pointer" onclick="openNotiEdit('${p.id}')">
      <div>
        <div>${p.name || '이름 없음'}</div>
        <div style="font-size:12px;color:#aaa">${p.location?.type === 'gps' ? '현재 내 위치' : p.location?.address || '직접 지정'} · ${p.radius >= 1000 ? p.radius/1000+'km' : p.radius+'m'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <label class="toggle-switch" onclick="event.stopPropagation()">
          <input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="toggleNotiPreset('${p.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <span style="color:#aaa">›</span>
      </div>
    </div>
  `).join('');
}

function toggleNotiPreset(id, enabled) {
  const presets = getNotiPresets();
  const p = presets.find(x => x.id === id);
  if (p) { p.enabled = enabled; saveNotiPresets(presets); syncNotiSubscription(); }
}

function openNotiEdit(id) {
  const presets = getNotiPresets();
  const p = presets.find(x => x.id === id) || null;
  currentNotiPresetId = id;

  document.getElementById('noti-preset-name-input').value = p?.name || '';
  document.getElementById('noti-enabled').checked = p?.enabled !== false;
  document.getElementById('noti-fav-only').checked = p?.favOnly || false;
  const timeEnabled = !!p?.timeRange;
  document.getElementById('noti-time-enabled').checked = timeEnabled;
  toggleNotiTimeRange(timeEnabled);
  document.getElementById('noti-time-start').value = p?.timeRange?.start || '09:00';
  document.getElementById('noti-time-end').value = p?.timeRange?.end || '22:00';

  notiLocType = p?.location?.type || 'gps';
  notiFixedLat = p?.location?.lat || null;
  notiFixedLng = p?.location?.lng || null;
  notiFixedAddress = p?.location?.address || '';
  updateNotiLocUI();

  // 반경 칩
  const radius = p?.radius || 1000;
  document.querySelectorAll('#noti-radius-chips .chip').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.value) === radius);
  });

  // 가게 종류 칩
  const types = p?.types || [];
  document.querySelectorAll('#noti-type-chips .chip').forEach(btn => {
    if (btn.dataset.value === 'all') btn.classList.toggle('active', !types.length);
    else btn.classList.toggle('active', types.includes(btn.dataset.value));
  });

  // 재고 상태 칩
  const reportTypes = p?.reportTypes || ['available', 'low_stock'];
  document.querySelectorAll('#noti-report-chips .chip').forEach(btn => {
    btn.classList.toggle('active', reportTypes.includes(btn.dataset.value));
  });

  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('noti-edit-view').classList.remove('hidden');
}

function addNotiPreset() {
  const presets = getNotiPresets();
  const id = 'n' + Date.now();
  presets.push({ id, name: '새 알림', enabled: true, location: { type: 'gps' }, radius: 1000, types: [], reportTypes: ['available', 'low_stock'], favOnly: false, timeRange: { start: '09:00', end: '22:00' } });
  saveNotiPresets(presets);
  renderNotiPresetList();
  openNotiEdit(id);
}

function saveNotiPreset() {
  const presets = getNotiPresets();
  const idx = presets.findIndex(x => x.id === currentNotiPresetId);
  if (idx === -1) return;

  const types = [...document.querySelectorAll('#noti-type-chips .chip.active')]
    .map(b => b.dataset.value).filter(v => v !== 'all');
  const reportTypes = [...document.querySelectorAll('#noti-report-chips .chip.active')]
    .map(b => b.dataset.value);
  const radius = Number(document.querySelector('#noti-radius-chips .chip.active')?.dataset.value || 1000);

  const location = notiLocType === 'gps'
    ? { type: 'gps' }
    : { type: 'fixed', lat: notiFixedLat, lng: notiFixedLng, address: notiFixedAddress };

  presets[idx] = {
    ...presets[idx],
    name: document.getElementById('noti-preset-name-input').value || '이름 없음',
    enabled: document.getElementById('noti-enabled').checked,
    location,
    radius,
    types,
    reportTypes,
    favOnly: document.getElementById('noti-fav-only').checked,
    timeRange: document.getElementById('noti-time-enabled').checked ? {
      start: document.getElementById('noti-time-start').value,
      end: document.getElementById('noti-time-end').value
    } : null
  };

  saveNotiPresets(presets);
  syncNotiSubscription();
  backFromNotiEdit();
}

function backFromNotiEdit() {
  document.getElementById('noti-edit-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  renderNotiPresetList();
}

function setNotiLocationType(type) {
  notiLocType = type;
  updateNotiLocUI();
}

function toggleNotiTimeRange(enabled) {
  document.getElementById('noti-time-range').classList.toggle('hidden', !enabled);
}

function updateNotiLocUI() {
  const isGps = notiLocType === 'gps';
  document.getElementById('noti-loc-gps-check').style.display = isGps ? '' : 'none';
  document.getElementById('noti-loc-fixed-check').style.display = isGps ? 'none' : '';
  document.getElementById('noti-map-picker-btn-wrap').classList.toggle('hidden', isGps);
  document.getElementById('noti-loc-fixed-address').textContent = notiFixedAddress || '위치를 선택해주세요';
}

function openNotiMapPicker() {
  document.getElementById('noti-edit-view').classList.add('hidden');
  document.getElementById('noti-map-picker').classList.remove('hidden');
  document.getElementById('noti-map-picker').style.display = 'flex';

  if (!notiPickerMap) {
    const lat = notiFixedLat || 37.5447;
    const lng = notiFixedLng || 127.0558;
    notiPickerMap = new kakao.maps.Map(document.getElementById('noti-map-picker-map'), {
      center: new kakao.maps.LatLng(lat, lng), level: 4
    });
    kakao.maps.event.addListener(notiPickerMap, 'drag', updateNotiPickerAddress);
    kakao.maps.event.addListener(notiPickerMap, 'dragend', updateNotiPickerAddress);
  } else if (notiFixedLat) {
    notiPickerMap.setCenter(new kakao.maps.LatLng(notiFixedLat, notiFixedLng));
  }
  updateNotiPickerAddress();
}

function updateNotiPickerAddress() {
  const center = notiPickerMap.getCenter();
  notiPickerLat = center.getLat();
  notiPickerLng = center.getLng();
  const geocoder = new kakao.maps.services.Geocoder();
  geocoder.coord2Address(notiPickerLng, notiPickerLat, (result, status) => {
    if (status === kakao.maps.services.Status.OK) {
      document.getElementById('noti-picker-address').textContent =
        result[0].road_address?.address_name || result[0].address?.address_name || '';
    }
  });
}

function confirmNotiMapPicker() {
  notiFixedLat = notiPickerLat;
  notiFixedLng = notiPickerLng;
  notiFixedAddress = document.getElementById('noti-picker-address').textContent;
  document.getElementById('noti-loc-fixed-address').textContent = notiFixedAddress;
  cancelNotiMapPicker();
}

function cancelNotiMapPicker() {
  document.getElementById('noti-map-picker').classList.add('hidden');
  document.getElementById('noti-map-picker').style.display = 'none';
  document.getElementById('noti-edit-view').classList.remove('hidden');
}

function initNotiChips() {
  document.querySelectorAll('#noti-radius-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#noti-radius-chips .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#noti-type-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.value === 'all') {
        document.querySelectorAll('#noti-type-chips .chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        document.querySelector('#noti-type-chips .chip[data-value="all"]').classList.remove('active');
        btn.classList.toggle('active');
      }
    });
  });

  document.querySelectorAll('#noti-report-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });
}

async function syncNotiSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const presets = getNotiPresets();
  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

  await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
      auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
      conditions: { presets, favorites }
    })
  });
}

async function requestNotiPermission() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('이 브라우저는 알림을 지원하지 않아요.');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { alert('알림 권한이 필요해요.'); return; }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: CONFIG.vapidPublicKey
    });
  }
  await syncNotiSubscription();
  alert('알림이 설정됐어요!');
}

// ─── 초기화 ──────────────────────────────────────────────

window.addEventListener('load', () => {
  initAuth();
  initLocationToggle();
  document.getElementById('add-preset-btn').addEventListener('click', addPreset);
  document.getElementById('add-noti-preset-btn').addEventListener('click', addNotiPreset);
  initNotiChips();
  renderNotiPresetList();
  showMainView();
});
