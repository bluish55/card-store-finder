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

// ─── 초기화 ──────────────────────────────────────────────

window.addEventListener('load', () => {
  initAuth();
  initLocationToggle();
  document.getElementById('add-preset-btn').addEventListener('click', addPreset);
  showMainView();
});
