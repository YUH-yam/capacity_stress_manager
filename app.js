// ==================== GAS / SHEETS SYNC ====================
let gasUrl = '';
let syncTimer = null;
let isSyncing = false;

function setSyncUI(state, msg) {
  const dot  = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  const msgs = { idle:'Sheets未設定', loading:'読み込み中…', syncing:'同期中…', synced:'同期済み', error:'同期失敗' };
  if (dot)  { dot.className = 'sync-dot ' + state; }
  if (text) { text.textContent = msg || msgs[state] || state; }
}

function setGasMsg(msg, isError) {
  const el = document.getElementById('gasStatusMsg');
  if (el) { el.textContent = msg; el.style.color = isError ? 'var(--red)' : 'var(--text2)'; }
}

function normalizeGasUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const clean = raw.split('#')[0].split('?')[0].trim();
  const m = clean.match(/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/(exec|dev)$/);
  if (!m) return null;
  return clean.replace(/\/dev$/, '/exec');
}

function makeGasUrlWithQuery(params) {
  if (!gasUrl) return '';
  const qs = new URLSearchParams(params || {});
  return gasUrl + (gasUrl.includes('?') ? '&' : '?') + qs.toString();
}

function loadGasUrl() {
  try {
    const stored = localStorage.getItem('csm_gas_url') || '';
    const normalized = normalizeGasUrl(stored);
    gasUrl = normalized || '';
    const inp = document.getElementById('gasUrlInput');
    if (inp && stored) inp.value = normalized || stored;
    setSyncUI(gasUrl ? 'idle' : 'idle', gasUrl ? 'Sheets設定済み' : 'Sheets未設定');
    if (stored && !normalized) setGasMsg('保存済みURLの形式を確認してください。/macros/s/.../exec のURLが必要です。', true);
  } catch(e) {}
}

function onGasUrlInput() {
  // リアルタイムプレビュー（保存はしない）
}

function saveGasUrl() {
  const inp = document.getElementById('gasUrlInput');
  const rawUrl = inp ? inp.value.trim() : '';
  const url = normalizeGasUrl(rawUrl);
  if (url === null) {
    setGasMsg('URL が正しくありません。GAS Web App の /macros/s/.../exec URL を入力してください。', true);
    return;
  }
  gasUrl = url;
  if (inp) inp.value = url;
  try { localStorage.setItem('csm_gas_url', url); } catch(e) {}
  if (url) {
    setSyncUI('idle', 'Sheets設定済み');
    setGasMsg('URL を保存しました。/dev が入力された場合は /exec に補正しています。今すぐ Sheets へ保存を実行してください。');
  } else {
    setSyncUI('idle', 'Sheets未設定');
    setGasMsg('URL をクリアしました。');
  }
}

function clearGasUrl() {
  gasUrl = '';
  try { localStorage.removeItem('csm_gas_url'); } catch(e) {}
  const inp = document.getElementById('gasUrlInput');
  if (inp) inp.value = '';
  setSyncUI('idle', 'Sheets未設定');
  setGasMsg('Sheets 連携を解除しました。');
}

function buildPayload() {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    tasks, smxData, slog, nid, slogN, catalogs,
    settings: {
      daily:  document.getElementById('dailyCap')?.value  || '8.0',
      weekly: document.getElementById('weeklyCap')?.value || '40.0',
      catalogs
    }
  };
}

function pingGasByImage() {
  if (!gasUrl) return;
  try {
    const img = new Image();
    img.style.display = 'none';
    img.onload = img.onerror = () => {
      setTimeout(() => {
        try { img.remove(); } catch(e) {}
      }, 500);
    };
    document.body.appendChild(img);
    img.src = makeGasUrlWithQuery({ action: 'ping', ts: Date.now() });
  } catch(e) {}
}

function submitToGasByHiddenForm(payload) {
  return new Promise((resolve, reject) => {
    try {
      const frameName = 'csm_gas_post_frame';
      let frame = document.getElementById(frameName);
      if (!frame) {
        frame = document.createElement('iframe');
        frame.name = frameName;
        frame.id = frameName;
        frame.style.display = 'none';
        frame.setAttribute('aria-hidden', 'true');
        document.body.appendChild(frame);
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = gasUrl;
      form.target = frameName;
      form.style.display = 'none';
      form.acceptCharset = 'UTF-8';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = payload;
      form.appendChild(input);

      const clientTs = document.createElement('input');
      clientTs.type = 'hidden';
      clientTs.name = 'clientTs';
      clientTs.value = new Date().toISOString();
      form.appendChild(clientTs);

      document.body.appendChild(form);
      form.submit();

      setTimeout(() => {
        try { form.remove(); } catch(e) {}
        resolve(true);
      }, 1200);
    } catch(e) {
      reject(e);
    }
  });
}

async function syncToSheets(silent) {
  if (!gasUrl || isSyncing) return false;
  isSyncing = true;
  if (!silent) setSyncUI('syncing');

  try {
    const payload = JSON.stringify(buildPayload());

    // GET到達確認用。H1〜J1に反映されるため、URL・公開設定・再デプロイ漏れの切り分けに使える。
    pingGasByImage();

    // fetch no-cors ではなく、通常のフォームPOSTで送る。CORS制限を受けにくく、GAS doPost に届きやすい。
    await submitToGasByHiddenForm(payload);

    setSyncUI('synced', '送信完了');
    return true;
  } catch(e) {
    console.error('Sheets sync failed:', e);
    setSyncUI('error', '送信失敗');
    return false;
  } finally {
    isSyncing = false;
  }
}

function loadFromSheetsByJsonp() {
  return new Promise((resolve) => {
    if (!gasUrl) { resolve(null); return; }

    const callbackName = 'csmSheetLoad_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let done = false;

    function cleanup() {
      if (done) return;
      done = true;
      try { delete window[callbackName]; } catch(e) { window[callbackName] = undefined; }
      try { script.remove(); } catch(e) {}
    }

    window[callbackName] = function(data) {
      cleanup();
      if (!data || data.error || !data.tasks) {
        resolve(null);
        return;
      }
      resolve(data);
    };

    script.onerror = function() {
      cleanup();
      resolve(null);
    };

    script.src = makeGasUrlWithQuery({
      action: 'load',
      callback: callbackName,
      ts: Date.now()
    });

    document.body.appendChild(script);

    setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10000);
  });
}

async function loadFromSheets() {
  // GAS WebアプリのContentServiceは、通常のfetchではCORSで読めない場合がある。
  // そのため、読み込みはJSONP方式に統一する。
  return await loadFromSheetsByJsonp();
}

function scheduleSheetsSync() {
  if (!gasUrl) return;
  if (syncTimer) clearTimeout(syncTimer);
  setSyncUI('syncing', '同期待機中…');
  syncTimer = setTimeout(() => syncToSheets(false), 1500);
}

async function reloadFromSheets() {
  if (!gasUrl) { setGasMsg('先に GAS URL を設定してください。', true); return; }
  setSyncUI('loading');
  setGasMsg('スプレッドシートから読み込んでいます…');
  const data = await loadFromSheets();
  if (!data) {
    setSyncUI('error');
    setGasMsg('読み込みに失敗しました。URL・デプロイ設定を確認してください。', true);
    return;
  }
  applyRemoteData(data);
  resetTransientUiAfterRemoteLoad();
  saveDataLocalOnly();
  saveSettingsLocalOnly();
  refreshAllContentFromState();
  setSyncUI('synced');
  setGasMsg('スプレッドシートからデータを読み込み、画面全体へ反映しました。');
}

async function forceSyncToSheets() {
  if (!gasUrl) { setGasMsg('先に GAS URL を設定してください。', true); return; }
  const ok = await syncToSheets(false);
  setGasMsg(ok
    ? 'スプレッドシートへ送信しました。C1〜J1の更新状況も確認してください。'
    : 'スプレッドシートへの送信に失敗しました。URL・デプロイ設定を確認してください。', !ok);
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTaskForUi(task, idx) {
  const t = task && typeof task === 'object' ? task : {};
  const id = toFiniteNumber(t.id, idx + 1);
  const category = resolveCategoryId(t.category);
  const owners = Array.isArray(t.owners)
    ? t.owners.map(String).filter(Boolean)
    : (t.owner ? [String(t.owner)] : ['自分']);
  const tags = Array.isArray(t.tags) ? t.tags.map(String).filter(Boolean) : [];
  const progress = Math.max(0, Math.min(100, toFiniteNumber(t.progress, 0)));
  const status = ['todo','inprogress','done'].includes(t.status) ? t.status : 'todo';

  return {
    id,
    title: String(t.title || '無題タスク'),
    category,
    urgency: Boolean(t.urgency),
    importance: Boolean(t.importance),
    effort: roundToTenth(Math.max(0.1, toFiniteNumber(t.effort, 1))),
    status,
    owners: owners.length ? owners : ['自分'],
    tags,
    progress,
    startDate: normalizeDateValue(t.startDate),
    endDate: normalizeDateValue(t.endDate || t.deadline)
  };
}

function normalizeStressForUi(remote) {
  const base = defaultStress();
  const src = remote && typeof remote === 'object' ? remote : {};

  Object.keys(src).forEach(key => {
    const item = src[key];
    if (!item || typeof item !== 'object') return;
    const score = Math.max(1, Math.min(5, Math.round(toFiniteNumber(item.score, 3))));
    base[key] = {
      score,
      note: String(item.note || ''),
      ts: String(item.ts || todayStr())
    };
  });

  return base;
}

function normalizeSlogForUi(remote) {
  if (!Array.isArray(remote)) return [];
  return remote.map((item, idx) => {
    const e = item && typeof item === 'object' ? item : {};
    const score = Math.max(1, Math.min(5, Math.round(toFiniteNumber(e.score, 3))));
    return {
      id: toFiniteNumber(e.id, idx + 1),
      loc: String(e.loc || ''),
      area: String(e.area || ''),
      score,
      note: String(e.note || ''),
      ts: String(e.ts || '')
    };
  }).filter(e => e.loc && e.area);
}

function applyRemoteData(data) {
  if (!data || typeof data !== 'object') return false;

  const remoteCatalogs = data.catalogs || data.settings?.catalogs;
  if (remoteCatalogs) {
    catalogs = normalizeCatalogs(remoteCatalogs);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'tasks')) {
    tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTaskForUi) : [];
    ensureCatalogsCoverTasks(tasks);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'smxData')) {
    smxData = normalizeStressForUi(data.smxData);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'slog')) {
    slog = normalizeSlogForUi(data.slog);
  }

  const maxTaskId = tasks.reduce((max, t) => Math.max(max, toFiniteNumber(t.id, 0)), 0);
  const remoteNid = toFiniteNumber(data.nid, maxTaskId + 1);
  nid = Math.max(remoteNid, maxTaskId + 1);

  const maxSlogId = slog.reduce((max, e) => Math.max(max, toFiniteNumber(e.id, 0)), 0);
  const remoteSlogN = toFiniteNumber(data.slogN, maxSlogId + 1);
  slogN = Math.max(remoteSlogN, maxSlogId + 1);

  if (data.settings && typeof data.settings === 'object') {
    const dc = document.getElementById('dailyCap');
    const wc = document.getElementById('weeklyCap');
    if (dc && Object.prototype.hasOwnProperty.call(data.settings, 'daily'))  dc.value = formatHours(data.settings.daily);
    if (wc && Object.prototype.hasOwnProperty.call(data.settings, 'weekly')) wc.value = formatHours(data.settings.weekly);
  }

  return true;
}

function resetTransientUiAfterRemoteLoad() {
  selCell = null;
  selScore = null;
  const ep = document.getElementById('editPanel');
  if (ep) ep.style.display = 'none';
}

function refreshAllContentFromState() {
  renderTaskCatalogInputs();
  updateMetrics();
  renderMatrix();
  renderChart();
  renderDashStress();
  renderTaskList();
  renderWBS();
  updateStressMeta();
  renderSmx();
  renderSlog();
  renderSettings();
}

// ==================== DATA ====================
const CATS = {Strategic:'戦略',Technical:'技術',People:'ピープル',Operational:'オペレーション',External:'外部対応'};
const CAT_COLORS = {Strategic:'#1D9E75',Technical:'#378ADD',People:'#D4537E',Operational:'#888780',External:'#BA7517'};
const LOCS = ['職場','LITALICO','家','移動中','その他'];
const AREAS = ['体調','メンタル','脳・集中','エネルギー','睡眠'];
const SC = {1:'#E24B4A',2:'#D85A30',3:'#EF9F27',4:'#5BB082',5:'#1D9E75'};
const SL = {1:'非常に悪い',2:'悪い',3:'普通',4:'良い',5:'非常に良い'};
const OWNER_LIST = ['自分','マネージャー','リーダー','メンバー1','メンバー2','メンバー3'];
const TAG_LIST   = ['資料作成','データ分析','内部調整','外部対応','その他'];
const APP_SCHEMA_VERSION = 2;
const DEFAULT_CATEGORIES = Object.keys(CATS).map(id => ({id, label:CATS[id], color:CAT_COLORS[id]}));
let catalogs = defaultCatalogs();

// multi-check toggle helper
function toggleMck(lbl) {
  const cb = lbl.querySelector('input');
  cb.checked = !cb.checked;
  lbl.classList.toggle('checked', cb.checked);
}
// read checked values from a group
function readMck(groupId) {
  return [...document.querySelectorAll(`#${groupId} input:checked`)].map(c => c.value);
}
// reset a group to default checked values
function resetMck(groupId, defaults=[]) {
  document.querySelectorAll(`#${groupId} .mck-label`).forEach(lbl => {
    const cb = lbl.querySelector('input');
    cb.checked = defaults.includes(cb.value);
    lbl.classList.toggle('checked', cb.checked);
  });
}

function defaultStress() {
  const d = {};
  LOCS.forEach(loc => AREAS.forEach(area => {
    d[`${loc}_${area}`] = {score:3, note:'', ts:todayStr()};
  }));
  return d;
}

function todayStr() {
  const n = new Date();
  return `${n.getMonth()+1}/${n.getDate()} ${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function roundToTenth(value) {
  const n = toFiniteNumber(value, 0);
  return Math.round(n * 10) / 10;
}

function formatHours(value) {
  return roundToTenth(value).toFixed(1);
}

function normalizeDateValue(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function parseDateOnly(value) {
  const s = normalizeDateValue(value);
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultCatalogs() {
  return {
    categories: DEFAULT_CATEGORIES.map(c => ({...c})),
    owners: [...OWNER_LIST],
    tags: [...TAG_LIST]
  };
}

function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(v => String(v || '').trim())
    .filter(v => v && !seen.has(v) && seen.add(v));
}

function makeCategoryId(label, seed=Date.now()) {
  const ascii = String(label || '').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
  return ascii || `Category_${seed}`;
}

function normalizeCatalogs(raw) {
  const base = defaultCatalogs();
  const src = raw && typeof raw === 'object' ? raw : {};
  const srcCategories = Array.isArray(src.categories) ? src.categories : base.categories;
  const categories = srcCategories.map((item, idx) => {
    const c = item && typeof item === 'object' ? item : {};
    const label = String(c.label || c.name || c.id || '').trim();
    if (!label) return null;
    return {
      id: String(c.id || makeCategoryId(label, idx)).trim(),
      label,
      color: /^#[0-9a-f]{6}$/i.test(String(c.color || '')) ? c.color : DEFAULT_CATEGORIES[idx % DEFAULT_CATEGORIES.length].color
    };
  }).filter(Boolean);
  const dedupedCategories = [];
  const ids = new Set();
  categories.forEach((cat, idx) => {
    let id = cat.id || makeCategoryId(cat.label, idx);
    while (ids.has(id)) id = `${id}_${idx + 1}`;
    ids.add(id);
    dedupedCategories.push({...cat, id});
  });
  const owners = uniqueStrings(src.owners);
  const tags = uniqueStrings(src.tags);
  return {
    categories: dedupedCategories.length ? dedupedCategories : base.categories,
    owners: owners.length ? owners : base.owners,
    tags: tags.length ? tags : base.tags
  };
}

function findCategory(id) {
  return catalogs.categories.find(c => c.id === id) || null;
}

function resolveCategoryId(value) {
  const raw = String(value || '').trim();
  if (!raw) return catalogs.categories[0]?.id || 'Operational';
  const byId = findCategory(raw);
  if (byId) return byId.id;
  const byLabel = catalogs.categories.find(c => c.label === raw);
  if (byLabel) return byLabel.id;
  const cat = {
    id: raw,
    label: CATS[raw] || raw,
    color: CAT_COLORS[raw] || DEFAULT_CATEGORIES[catalogs.categories.length % DEFAULT_CATEGORIES.length].color
  };
  catalogs.categories.push(cat);
  return cat.id;
}

function ensureCatalogsCoverTasks(taskList) {
  (taskList || []).forEach(t => {
    t.category = resolveCategoryId(t.category);
    catalogs.owners = uniqueStrings([...catalogs.owners, ...(t.owners || [])]);
    catalogs.tags = uniqueStrings([...catalogs.tags, ...(t.tags || [])]);
  });
}

function getCategoryLabel(id) {
  return findCategory(id)?.label || id || '未分類';
}

function getCategoryColor(id) {
  return findCategory(id)?.color || '#888780';
}

function renderMckOptions(groupId, values, checkedValues=[]) {
  const el = document.getElementById(groupId);
  if (!el) return;
  const checked = new Set(checkedValues);
  el.innerHTML = values.map(v => {
    const isChecked = checked.has(v);
    return `<label class="mck-label${isChecked ? ' checked' : ''}" onclick="toggleMck(this)"><input type="checkbox" value="${escapeAttr(v)}"${isChecked ? ' checked' : ''}>${escapeHtml(v)}</label>`;
  }).join('');
}

function renderTaskCatalogInputs() {
  const cat = document.getElementById('tCat');
  if (cat) {
    const current = cat.value;
    cat.innerHTML = catalogs.categories.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.label)}</option>`).join('');
    cat.value = findCategory(current) ? current : (catalogs.categories[0]?.id || '');
  }
  const currentOwners = readMck('tOwners');
  const currentTags = readMck('tTags');
  renderMckOptions('tOwners', catalogs.owners, currentOwners.length ? currentOwners : (catalogs.owners.includes('自分') ? ['自分'] : [catalogs.owners[0]].filter(Boolean)));
  renderMckOptions('tTags', catalogs.tags, currentTags);
}

function persistCatalogState() {
  saveDataLocalOnly();
  saveSettingsLocalOnly();
  scheduleSheetsSync();
  refreshAllContentFromState();
}

function renderSettings() {
  const catEl = document.getElementById('categorySettingsList');
  const ownerEl = document.getElementById('ownerSettingsList');
  const tagEl = document.getElementById('tagSettingsList');
  if (catEl) {
    catEl.innerHTML = catalogs.categories.map(c => `
      <div class="settings-row with-color">
        <input type="text" value="${escapeAttr(c.label)}" onchange="updateCategorySetting('${escapeAttr(c.id)}','label',this.value)">
        <input type="color" value="${escapeAttr(c.color)}" aria-label="${escapeAttr(c.label)}の色" onchange="updateCategorySetting('${escapeAttr(c.id)}','color',this.value)">
        <button class="sm danger" onclick="deleteCategorySetting('${escapeAttr(c.id)}')">削除</button>
      </div>
    `).join('');
  }
  if (ownerEl) ownerEl.innerHTML = renderListSettingsRows('owners');
  if (tagEl) tagEl.innerHTML = renderListSettingsRows('tags');
}

function renderListSettingsRows(type) {
  return (catalogs[type] || []).map((value, idx) => `
    <div class="settings-row">
      <input type="text" value="${escapeAttr(value)}" onchange="renameListSetting('${type}',${idx},this.value)">
      <button class="sm danger" onclick="deleteListSetting('${type}',${idx})">削除</button>
    </div>
  `).join('');
}

function addCategorySetting() {
  const labelInput = document.getElementById('newCategoryLabel');
  const colorInput = document.getElementById('newCategoryColor');
  const label = labelInput?.value.trim();
  if (!label) { labelInput?.focus(); return; }
  let id = makeCategoryId(label);
  let i = 2;
  while (catalogs.categories.some(c => c.id === id)) id = `${makeCategoryId(label)}_${i++}`;
  catalogs.categories.push({id, label, color: colorInput?.value || '#378ADD'});
  labelInput.value = '';
  persistCatalogState();
}

function updateCategorySetting(id, field, value) {
  const cat = findCategory(id);
  if (!cat) return;
  if (field === 'label') {
    const label = String(value || '').trim();
    if (!label) { renderSettings(); return; }
    cat.label = label;
  }
  if (field === 'color' && /^#[0-9a-f]{6}$/i.test(String(value || ''))) cat.color = value;
  persistCatalogState();
}

function deleteCategorySetting(id) {
  if (catalogs.categories.length <= 1) return;
  const fallback = catalogs.categories.find(c => c.id !== id)?.id;
  catalogs.categories = catalogs.categories.filter(c => c.id !== id);
  tasks.forEach(t => { if (t.category === id) t.category = fallback; });
  persistCatalogState();
}

function addListSetting(type) {
  const inputId = type === 'owners' ? 'newOwnerValue' : 'newTagValue';
  const input = document.getElementById(inputId);
  const value = input?.value.trim();
  if (!value) { input?.focus(); return; }
  catalogs[type] = uniqueStrings([...(catalogs[type] || []), value]);
  input.value = '';
  persistCatalogState();
}

function renameListSetting(type, idx, nextValue) {
  const list = catalogs[type] || [];
  const oldValue = list[idx];
  const value = String(nextValue || '').trim();
  if (!oldValue || !value) { renderSettings(); return; }
  list[idx] = value;
  catalogs[type] = uniqueStrings(list);
  const key = type === 'owners' ? 'owners' : 'tags';
  tasks.forEach(t => { t[key] = uniqueStrings((t[key] || []).map(v => v === oldValue ? value : v)); });
  persistCatalogState();
}

function deleteListSetting(type, idx) {
  const list = catalogs[type] || [];
  if (type === 'owners' && list.length <= 1) return;
  const oldValue = list[idx];
  catalogs[type] = list.filter((_, i) => i !== idx);
  const key = type === 'owners' ? 'owners' : 'tags';
  tasks.forEach(t => { t[key] = (t[key] || []).filter(v => v !== oldValue); });
  persistCatalogState();
}

let tasks = [{
  id:1,title:'Q2プロダクトロードマップ策定',category:'Strategic',
  urgency:false,importance:false,effort:4,status:'todo',
  owners:['自分'],tags:[],progress:0,startDate:'',endDate:''
}];
let nid = 2;
let taskFilter = 'all';
let smxData = defaultStress();
let slog = [];
let slogN = 1;
let selCell = null, selScore = null;
let chartInst = null;

// drag state
let dragSrc = null;

// ==================== STORAGE ====================
function saveDataLocalOnly() {
  try {
    localStorage.setItem('csm_tasks', JSON.stringify(tasks));
    localStorage.setItem('csm_nid', String(nid));
    localStorage.setItem('csm_smx', JSON.stringify(smxData));
    localStorage.setItem('csm_slog', JSON.stringify(slog));
    localStorage.setItem('csm_slogN', String(slogN));
    localStorage.setItem('csm_catalogs', JSON.stringify(catalogs));
    localStorage.setItem('csm_schema_version', String(APP_SCHEMA_VERSION));
  } catch(e) {}
}
function save() {
  saveDataLocalOnly();
  scheduleSheetsSync(); // Sheets へデバウンス同期
}
function load() {
  try {
    const c = localStorage.getItem('csm_catalogs');
    if (c) catalogs = normalizeCatalogs(JSON.parse(c));
    const t = localStorage.getItem('csm_tasks');
    if (t) {
      const parsedTasks = JSON.parse(t);
      tasks = Array.isArray(parsedTasks) ? parsedTasks.map(normalizeTaskForUi) : [];
    } else {
      tasks = tasks.map(normalizeTaskForUi);
    }
    ensureCatalogsCoverTasks(tasks);
    const n = localStorage.getItem('csm_nid');
    if (n) nid = parseInt(n);
    const s = localStorage.getItem('csm_smx');
    if (s) smxData = normalizeStressForUi(JSON.parse(s));
    const sl = localStorage.getItem('csm_slog');
    if (sl) slog = normalizeSlogForUi(JSON.parse(sl));
    const sn = localStorage.getItem('csm_slogN');
    if (sn) slogN = parseInt(sn);
  } catch(e) {}
}
function saveSettingsLocalOnly() {
  try {
    const dc = document.getElementById('dailyCap');
    const wc = document.getElementById('weeklyCap');
    if (dc) localStorage.setItem('csm_dailyCap', formatHours(dc.value));
    if (wc) localStorage.setItem('csm_weeklyCap', formatHours(wc.value));
  } catch(e) {}
}
function saveSettings() {
  saveSettingsLocalOnly();
  scheduleSheetsSync();
}
function loadSettings() {
  try {
    const dc = localStorage.getItem('csm_dailyCap');
    const wc = localStorage.getItem('csm_weeklyCap');
    if (dc && document.getElementById('dailyCap')) document.getElementById('dailyCap').value = formatHours(dc);
    if (wc && document.getElementById('weeklyCap')) document.getElementById('weeklyCap').value = formatHours(wc);
  } catch(e) {}
}

// ==================== INIT ====================
const WDAYS = ['日','月','火','水','木','金','土'];
const nd = new Date();
document.getElementById('dateDisp').textContent =
  `${nd.getFullYear()}年${nd.getMonth()+1}月${nd.getDate()}日（${WDAYS[nd.getDay()]}）`;

// localStorage から即時表示（ファーストペイント）
load();
loadSettings();
loadGasUrl();
ra();

// Live progress slider label
const tProg = document.getElementById('tProgress');
if (tProg) tProg.addEventListener('input', () => { document.getElementById('tProgressVal').textContent = tProg.value + '%'; });

// Sheets から最新データを非同期取得（GAS URL が設定済みの場合）
(async () => {
  if (!gasUrl) return;
  setSyncUI('loading');
  const data = await loadFromSheets();
  if (data) {
    applyRemoteData(data);
    saveDataLocalOnly();
    saveSettingsLocalOnly();
    ra();
    setSyncUI('synced');
  } else {
    setSyncUI('idle', 'Sheets設定済み');
  }
})();

// ==================== TAB ====================
function sw(tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('p-'+tab)?.classList.add('active');
  const tabs = document.querySelectorAll('.tab');
  const idx = {'dash':0,'tasks':1,'wbs':2,'stress':3,'settings':4,'export':5};
  if (tabs[idx[tab]]) tabs[idx[tab]].classList.add('active');
  if (tab==='dash') { updateMetrics(); renderMatrix(); renderChart(); renderDashStress(); }
  if (tab==='tasks') renderTaskList();
  if (tab==='wbs') renderWBS();
  if (tab==='stress') { updateStressMeta(); renderSmx(); renderSlog(); }
  if (tab==='settings') renderSettings();
}

// ==================== METRICS ====================
function getCap() {
  return {
    d: Math.max(0.1, roundToTenth(document.getElementById('dailyCap')?.value || 8)),
    w: Math.max(0.1, roundToTenth(document.getElementById('weeklyCap')?.value || 40))
  };
}
function bc(p) { return p >= 1 ? '#E24B4A' : p >= .8 ? '#EF9F27' : '#1D9E75'; }
function sv(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

function updateMetrics() {
  const {d, w} = getCap();
  const myA = tasks.filter(t => (t.owners||[t.owner]).includes('自分') && t.status !== 'done');
  const te = myA.filter(t => t.urgency).reduce((s,t) => s + t.effort, 0);
  const we = myA.reduce((s,t) => s + t.effort, 0);
  const tp = Math.min(te/d, 1), wp = Math.min(we/w, 1);
  sv('todayH', te.toFixed(1)+'h');
  sv('weekH', we.toFixed(1)+'h');
  sv('todayCapL', '/ '+formatHours(d)+'h 上限');
  sv('weekCapL', '/ '+formatHours(w)+'h 上限');
  sv('weekUtil', Math.round(wp*100)+'%');
  sv('q1Cnt', tasks.filter(t => t.urgency && t.importance && t.status !== 'done').length);
  const tb = document.getElementById('todayBar');
  const wb = document.getElementById('weekBar');
  if (tb) { tb.style.width = Math.round(tp*100)+'%'; tb.style.background = bc(tp); }
  if (wb) { wb.style.width = Math.round(wp*100)+'%'; wb.style.background = bc(wp); }
  const alerts = Object.values(smxData).filter(x => x.score <= 2).length;
  sv('stressStatNum', alerts);
  const ss = document.getElementById('stressStat');
  const sl = document.getElementById('stressStatLbl');
  if (ss) ss.style.background = alerts > 0 ? '#fff0f0' : '';
  if (ss) ss.style.borderColor = alerts > 0 ? '#fcc' : '';
  if (sl) sl.style.color = alerts > 0 ? '#c44' : '';
}

function renderMatrix() {
  const act = tasks.filter(t => t.status !== 'done');
  [{q:'q1',u:true,i:true},{q:'q2',u:false,i:true},{q:'q3',u:true,i:false},{q:'q4',u:false,i:false}].forEach(({q,u,i}) => {
    const el = document.getElementById(q+'t'); if (!el) return;
    const qt = act.filter(t => t.urgency === u && t.importance === i);
    el.innerHTML = qt.map(t =>
      `<div class="mx-chip"><span>${escapeHtml(t.title)}</span><span style="background:${getCategoryColor(t.category)}22;color:${getCategoryColor(t.category)};padding:1px 5px;border-radius:3px;font-size:9px;flex-shrink:0;">${formatHours(t.effort)}h</span></div>`
    ).join('') || '<div style="font-size:10px;color:var(--text3);font-style:italic;">なし</div>';
  });
}

function renderDashStress() {
  const el = document.getElementById('dashStressSummary'); if (!el) return;
  const rows = LOCS.map(loc => {
    const sc = AREAS.map(a => smxData[`${loc}_${a}`]?.score).filter(Boolean);
    if (!sc.length) return null;
    const avg = sc.reduce((a,b) => a+b, 0) / sc.length;
    return {loc, avg, col: SC[Math.round(avg)]};
  }).filter(Boolean);
  el.innerHTML = rows.map(r =>
    `<div class="stress-bar-row">
      <div class="stress-circle" style="background:${r.col}22;color:${r.col};">${r.avg.toFixed(1)}</div>
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span style="font-size:12px;font-weight:500;">${r.loc}</span>
          <span style="font-size:11px;color:${r.col};">${SL[Math.round(r.avg)]}</span>
        </div>
        <div class="prog-bar"><div class="prog-fill" style="background:${r.col};width:${Math.round(r.avg/5*100)}%;"></div></div>
      </div>
    </div>`
  ).join('') || '<div style="font-size:12px;color:var(--text2);">まだ記録がありません</div>';
}

function renderChart() {
  const filt = catalogs.categories.map(cat => ({
    c: cat.id,
    label: cat.label,
    v: tasks.filter(t => t.category === cat.id && t.status !== 'done').reduce((s,t) => s+t.effort, 0),
    color: cat.color
  })).filter(x => x.v > 0);
  const canvas = document.getElementById('catChart'); if (!canvas) return;
  if (chartInst) { chartInst.destroy(); chartInst = null; }
  const legend = document.getElementById('chartLegend');
  if (!filt.length) { if (legend) legend.innerHTML = ''; return; }
  if (typeof Chart === 'undefined') {
    if (legend) legend.innerHTML = filt.map(x =>
      `<div class="legend-item"><div class="legend-dot" style="background:${x.color};"></div>${escapeHtml(x.label)} ${formatHours(x.v)}h</div>`
    ).join('');
    return;
  }
  chartInst = new Chart(canvas, {
    type: 'doughnut',
    data: { labels: filt.map(x => x.label), datasets: [{ data: filt.map(x => x.v), backgroundColor: filt.map(x => x.color), borderWidth: 0, hoverOffset: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatHours(ctx.raw)}h` } } } }
  });
  if (legend) legend.innerHTML = filt.map(x =>
    `<div class="legend-item"><div class="legend-dot" style="background:${x.color};"></div>${escapeHtml(x.label)} ${formatHours(x.v)}h</div>`
  ).join('');
}

// ==================== TASKS ====================
function sf(f) {
  taskFilter = f;
  ['all','self','del','done'].forEach(id => document.getElementById('f-'+id)?.classList.toggle('active', id === f));
  renderTaskList();
}

function endDateColor(endDate) {
  if (!endDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = parseDateOnly(endDate);
  if (!d) return '';
  const diff = Math.ceil((d - today) / 86400000);
  if (diff < 0) return 'color:#c44;font-weight:500;'; // overdue
  if (diff <= 3) return 'color:#b45309;font-weight:500;'; // soon
  return 'color:var(--text2);';
}

function dateLabel(dateValue) {
  return normalizeDateValue(dateValue).replace(/-/g,'/');
}

function endDateStatusText(endDate) {
  if (!endDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = parseDateOnly(endDate);
  if (!d) return '';
  const diff = Math.ceil((d - today) / 86400000);
  const label = dateLabel(endDate);
  if (diff < 0) return `⚠️ ${label}（${Math.abs(diff)}日超過）`;
  if (diff === 0) return `🔔 ${label}（今日）`;
  if (diff <= 3) return `⏰ ${label}（あと${diff}日）`;
  return '';
}

function dateRangeText(startDate, endDate) {
  const start = normalizeDateValue(startDate);
  const end = normalizeDateValue(endDate);
  const range = start && end
    ? `📅 ${dateLabel(start)} → ${dateLabel(end)}`
    : start
      ? `📅 開始 ${dateLabel(start)}`
      : end
        ? `📅 終了 ${dateLabel(end)}`
        : '';
  const status = endDateStatusText(end);
  return status ? `${range} ${status}` : range;
}

function isDateRangeValid(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  return !start || !end || start <= end;
}

function renderTaskList() {
  let f = tasks;
  if (taskFilter === 'self') f = tasks.filter(t => (t.owners||[t.owner]).includes('自分') && t.status !== 'done');
  else if (taskFilter === 'del') f = tasks.filter(t => !(t.owners||[t.owner]).includes('自分') && t.status !== 'done');
  else if (taskFilter === 'done') f = tasks.filter(t => t.status === 'done');
  else f = tasks.filter(t => t.status !== 'done');
  const el = document.getElementById('taskList'); if (!el) return;
  if (!f.length) { el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2);">タスクがありません</div>'; return; }
  const stc = {todo:'#378ADD', inprogress:'#1D9E75', done:'#888780'};
  el.innerHTML = f.map(t => {
    const owners = t.owners || (t.owner ? [t.owner] : []);
    const tags   = t.tags   || [];
    const prog   = t.progress != null ? t.progress : 0;
    const progCol = prog >= 100 ? '#888780' : prog >= 60 ? '#1D9E75' : prog >= 30 ? '#EF9F27' : '#378ADD';
    const categoryColor = getCategoryColor(t.category);
    const categoryLabel = getCategoryLabel(t.category);
    const startDate = normalizeDateValue(t.startDate);
    const endDate = normalizeDateValue(t.endDate);
    return `<div class="task-item" draggable="true" data-id="${t.id}"
      ondragstart="dStart(event,${t.id})" ondragover="dOver(event)" ondrop="dDrop(event,${t.id})" ondragend="dEnd(event)">
      <div class="task-drag" title="ドラッグして並び替え">⠿</div>
      <div class="task-dot" style="background:${stc[t.status]};"></div>
      <div class="task-body">
        <div class="task-title" style="${t.status==='done'?'text-decoration:line-through;opacity:.5;':''}">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span class="badge" style="background:${categoryColor}22;color:${categoryColor};">${escapeHtml(categoryLabel)}</span>
          ${t.urgency ? '<span class="badge" style="background:#fff0f0;color:#c44;">緊急</span>' : ''}
          ${t.importance ? '<span class="badge" style="background:#eff6ff;color:#2563eb;">重要</span>' : ''}
          <span style="font-size:11px;color:var(--text2);">${formatHours(t.effort)}h</span>
          ${owners.map(o => `<span class="badge" style="background:var(--bg2);color:var(--text2);border:1px solid var(--border);">👤${escapeHtml(o)}</span>`).join('')}
          ${tags.map(tg => `<span class="badge" style="background:#f0f0ff;color:#5050bb;">🏷${escapeHtml(tg)}</span>`).join('')}
        </div>
        <div class="flag-edit-row no-print">
          <label><input type="checkbox" ${t.urgency ? 'checked' : ''} onchange="setTaskFlag(${t.id},'urgency',this.checked)"> 緊急</label>
          <label><input type="checkbox" ${t.importance ? 'checked' : ''} onchange="setTaskFlag(${t.id},'importance',this.checked)"> 重要</label>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:5px;">
          <div class="task-prog-bar" style="flex:1;"><div class="task-prog-fill" style="width:${prog}%;background:${progCol};"></div></div>
          <span style="font-size:10px;color:${progCol};font-weight:600;min-width:30px;">${prog}%</span>
        </div>
        ${startDate || endDate ? `<div class="task-deadline" style="${endDateColor(endDate)}">${dateRangeText(startDate, endDate)}</div>` : ''}
        <div class="deadline-edit no-print" id="dl-edit-${t.id}" style="display:none;">
          <span style="font-size:11px;color:var(--text2);">開始:</span>
          <input type="date" value="${startDate}" id="sd-input-${t.id}" style="font-size:11px;padding:3px 7px;">
          <span style="font-size:11px;color:var(--text2);">終了:</span>
          <input type="date" value="${endDate}" id="ed-input-${t.id}" style="font-size:11px;padding:3px 7px;">
          <button class="sm" onclick="saveDateRange(${t.id})">保存</button>
          <button class="sm" onclick="toggleDeadlineEdit(${t.id})">閉じる</button>
        </div>
        <div class="effort-edit-row no-print" id="ef-edit-${t.id}" style="display:none;">
          <span style="font-size:11px;color:var(--text2);">工数:</span>
          <input type="number" min="0.1" max="40" step="0.1" value="${formatHours(t.effort)}" id="ef-input-${t.id}" style="font-size:11px;padding:3px 7px;width:68px;">
          <span style="font-size:11px;color:var(--text2);">h</span>
          <button class="sm" onclick="saveEffort(${t.id})">保存</button>
          <button class="sm" onclick="toggleEffortEdit(${t.id})">閉じる</button>
        </div>
        <div class="prog-edit-row no-print" id="pg-edit-${t.id}" style="display:none;">
          <span style="font-size:11px;color:var(--text2);">進捗:</span>
          <input type="range" min="0" max="100" step="5" value="${prog}" id="pg-input-${t.id}" style="flex:1;accent-color:var(--green);"
            oninput="document.getElementById('pg-val-${t.id}').textContent=this.value+'%'">
          <span id="pg-val-${t.id}" style="font-size:11px;color:var(--text2);min-width:32px;">${prog}%</span>
          <button class="sm" onclick="saveProgress(${t.id})">保存</button>
          <button class="sm" onclick="toggleProgressEdit(${t.id})">閉じる</button>
        </div>
      </div>
      <div class="task-actions no-print">
        <select onchange="chgSt(${t.id},this.value)" style="font-size:11px;padding:2px 4px;">
          <option value="todo"${t.status==='todo'?' selected':''}>未着手</option>
          <option value="inprogress"${t.status==='inprogress'?' selected':''}>進行中</option>
          <option value="done"${t.status==='done'?' selected':''}>完了</option>
        </select>
        <button class="sm" onclick="toggleProgressEdit(${t.id})">📊 進捗</button>
        <button class="sm" onclick="toggleEffortEdit(${t.id})">⏱ 工数</button>
        <button class="sm" onclick="toggleDeadlineEdit(${t.id})">📅 日付</button>
        <button class="sm danger" onclick="delTask(${t.id})">削除</button>
      </div>
    </div>`;
  }).join('');
}

function toggleDeadlineEdit(id) {
  const el = document.getElementById('dl-edit-'+id);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}
function toggleEffortEdit(id) {
  const el = document.getElementById('ef-edit-'+id);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}
function toggleProgressEdit(id) {
  const el = document.getElementById('pg-edit-'+id);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}
function saveDateRange(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  const start = normalizeDateValue(document.getElementById('sd-input-'+id)?.value);
  const end = normalizeDateValue(document.getElementById('ed-input-'+id)?.value);
  if (!isDateRangeValid(start, end)) {
    alert('終了日は開始日以降にしてください。');
    return;
  }
  t.startDate = start;
  t.endDate = end;
  save(); renderTaskList(); ra();
}
function saveEffort(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  const inp = document.getElementById('ef-input-'+id);
  if (inp) t.effort = Math.max(0.1, roundToTenth(inp.value || t.effort));
  save(); renderTaskList(); ra();
}
function saveProgress(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  const inp = document.getElementById('pg-input-'+id);
  if (inp) t.progress = parseInt(inp.value);
  save(); renderTaskList(); ra();
}
function chgSt(id, s) { const t = tasks.find(x => x.id === id); if (t) { t.status = s; save(); renderTaskList(); ra(); } }
function setTaskFlag(id, key, checked) {
  if (!['urgency','importance'].includes(key)) return;
  const t = tasks.find(x => x.id === id);
  if (t) { t[key] = Boolean(checked); save(); renderTaskList(); ra(); }
}
function delTask(id) { tasks = tasks.filter(x => x.id !== id); save(); renderTaskList(); ra(); }
function addTask() {
  const title = document.getElementById('tTitle').value.trim();
  if (!title) { document.getElementById('tTitle').focus(); return; }
  const startDate = normalizeDateValue(document.getElementById('tStartDate').value);
  const endDate = normalizeDateValue(document.getElementById('tEndDate').value);
  if (!isDateRangeValid(startDate, endDate)) {
    alert('終了日は開始日以降にしてください。');
    return;
  }
  tasks.push({
    id: nid++, title,
    category: document.getElementById('tCat').value,
    urgency: document.getElementById('tUrgent').checked,
    importance: document.getElementById('tImportant').checked,
    effort: Math.max(0.1, roundToTenth(document.getElementById('tEffort').value || 1)),
    status: 'todo',
    owners: readMck('tOwners'),
    tags:   readMck('tTags'),
    progress: parseInt(document.getElementById('tProgress').value) || 0,
    startDate,
    endDate
  });
  document.getElementById('tTitle').value = '';
  document.getElementById('tUrgent').checked = false;
  document.getElementById('tImportant').checked = false;
  document.getElementById('tEffort').value = '2.0';
  document.getElementById('tStartDate').value = '';
  document.getElementById('tEndDate').value = '';
  document.getElementById('tProgress').value = '0';
  document.getElementById('tProgressVal').textContent = '0%';
  resetMck('tOwners', ['自分']);
  resetMck('tTags', []);
  save(); renderTaskList(); ra();
}

// ==================== DRAG & DROP ====================
function dStart(e, id) {
  dragSrc = id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function dOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function dDrop(e, targetId) {
  e.preventDefault();
  if (dragSrc === null || dragSrc === targetId) return;
  const srcIdx = tasks.findIndex(t => t.id === dragSrc);
  const tgtIdx = tasks.findIndex(t => t.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;
  const [removed] = tasks.splice(srcIdx, 1);
  tasks.splice(tgtIdx, 0, removed);
  save(); renderTaskList();
}
function dEnd(e) {
  dragSrc = null;
  document.querySelectorAll('.task-item').forEach(el => {
    el.classList.remove('dragging');
    el.classList.remove('drag-over');
  });
}

// ==================== WBS (Timeline) ====================
function renderWBS() {
  const el = document.getElementById('wbsContent'); if (!el) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const PAST_DAYS = 7;
  const FUTURE_DAYS = 28;
  const TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS; // 35
  const COL_W = (100 / TOTAL_DAYS).toFixed(4); // % per day

  function pct(dayOffset) {
    return (((dayOffset + PAST_DAYS) / TOTAL_DAYS) * 100).toFixed(3);
  }
  const todayPct = parseFloat(pct(0));
  const WDAYS_SHORT = ['日','月','火','水','木','金','土'];

  // ── Build 3-row header ──
  let gridLines = '';
  let colBgs = '';
  let monthBand = '';
  let dayBand   = '';
  let wdayBand  = '';

  let prevMonth = -1;
  let monthStartPct = 0;

  for (let i = -PAST_DAYS; i <= FUTURE_DAYS; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const p   = parseFloat(pct(i));
    const cw  = parseFloat(COL_W);
    const isToday = i === 0;
    const isSun = d.getDay() === 0;
    const isSat = d.getDay() === 6;

    gridLines += `<div style="position:absolute;left:${p.toFixed(3)}%;top:0;bottom:0;width:1px;background:var(--border);opacity:${(isSun||isSat)?0.7:0.3};pointer-events:none;z-index:1;"></div>`;

    if (isToday) {
      colBgs += `<div style="position:absolute;left:${p.toFixed(3)}%;width:${cw.toFixed(3)}%;top:0;bottom:0;background:#ffe8e8;pointer-events:none;z-index:0;"></div>`;
    } else if (isSun || isSat) {
      colBgs += `<div style="position:absolute;left:${p.toFixed(3)}%;width:${cw.toFixed(3)}%;top:0;bottom:0;background:#f5f5f4;pointer-events:none;z-index:0;"></div>`;
    }

    const dayCol = isToday ? '#E24B4A' : isSun ? '#c44' : isSat ? '#4477cc' : 'var(--text2)';
    dayBand += `<div style="position:absolute;left:${p.toFixed(3)}%;width:${cw.toFixed(3)}%;top:33.3%;height:33.3%;display:flex;align-items:center;justify-content:center;font-size:${isToday?9:8}px;font-weight:${isToday?700:400};color:${dayCol};z-index:2;line-height:1;">${d.getDate()}</div>`;

    const wdLabel = isToday ? '今' : WDAYS_SHORT[d.getDay()];
    wdayBand += `<div style="position:absolute;left:${p.toFixed(3)}%;width:${cw.toFixed(3)}%;top:66.6%;height:33.4%;display:flex;align-items:center;justify-content:center;font-size:${isToday?9:8}px;font-weight:${isToday?700:400};color:${dayCol};z-index:2;line-height:1;">${wdLabel}</div>`;

    if (d.getMonth() !== prevMonth) {
      if (prevMonth !== -1) {
        const monthW = (p - monthStartPct).toFixed(3);
        monthBand += `<div style="position:absolute;left:${monthStartPct.toFixed(3)}%;width:${monthW}%;top:0;height:33.3%;display:flex;align-items:center;padding-left:4px;font-size:9px;font-weight:600;color:var(--text);border-right:1px solid var(--border2);z-index:2;">${prevMonth+1}月</div>`;
      }
      prevMonth = d.getMonth();
      monthStartPct = p;
    }
    if (i === FUTURE_DAYS) {
      const monthW = (p + cw - monthStartPct).toFixed(3);
      monthBand += `<div style="position:absolute;left:${monthStartPct.toFixed(3)}%;width:${monthW}%;top:0;height:33.3%;display:flex;align-items:center;padding-left:4px;font-size:9px;font-weight:600;color:var(--text);z-index:2;">${prevMonth+1}月</div>`;
    }
  }

  const todayHighlight = `<div style="position:absolute;left:${todayPct.toFixed(3)}%;width:${COL_W}%;top:0;bottom:0;background:#ffdddd;z-index:0;pointer-events:none;"></div>`;
  const todayLine = `<div style="position:absolute;left:${todayPct.toFixed(3)}%;top:0;bottom:0;width:2px;background:#E24B4A;opacity:.6;z-index:5;pointer-events:none;"></div>`;

  const stLabel = {todo:'未着手', inprogress:'進行中', done:'完了'};
  const stColor = {todo:'#378ADD', inprogress:'#1D9E75', done:'#888780'};

  let rows = '';
  let wbsNo = 1;

  catalogs.categories.forEach(catInfo => {
    const cat = catInfo.id;
    const catColor = catInfo.color;
    const catTasks = tasks.filter(t => t.category === cat);
    if (!catTasks.length) return;
    const totalH = catTasks.reduce((s,t) => s + t.effort, 0);
    const avgProg = Math.round(catTasks.reduce((s,t) => s + (t.progress||0), 0) / catTasks.length);

    rows += `<div class="wbs-tl-cat">
      <div class="wbs-tl-label" style="border-left:3px solid ${catColor};">
        <span style="color:${catColor};font-weight:600;font-size:11px;">■ ${escapeHtml(catInfo.label)}</span>
        <span style="font-size:10px;color:var(--text2);">${catTasks.length}件 · ${formatHours(totalH)}h · 平均${avgProg}%</span>
      </div>
      <div class="wbs-tl-chart" style="background:${catColor}06;">${colBgs}${gridLines}${todayLine}</div>
    </div>`;

    catTasks.forEach(t => {
      const owners = t.owners || (t.owner ? [t.owner] : []);
      const prog   = t.progress != null ? t.progress : 0;
      const progCol = prog >= 100 ? '#888780' : prog >= 60 ? '#1D9E75' : prog >= 30 ? '#EF9F27' : '#378ADD';

      let chartContent = colBgs + gridLines + todayLine;

      const start = parseDateOnly(t.startDate);
      const end = parseDateOnly(t.endDate);
      if (start || end) {
        const startBase = start || today;
        const endBase = end || startBase;
        const startDiff = Math.round((startBase - today) / 86400000);
        const endDiff = Math.round((endBase - today) / 86400000);
        const fromDiff = Math.min(startDiff, endDiff);
        const toDiff = Math.max(startDiff, endDiff);
        const clampedFrom = Math.max(-PAST_DAYS, Math.min(FUTURE_DAYS, fromDiff));
        const clampedTo = Math.max(-PAST_DAYS, Math.min(FUTURE_DAYS, toDiff));
        const sp = parseFloat(pct(clampedFrom));
        const ep = parseFloat(pct(clampedTo));
        const barFrom = Math.min(sp, ep);
        const barW = Math.max(parseFloat(COL_W), Math.abs(ep - sp) + parseFloat(COL_W));
        const fillW   = barW * prog / 100;
        const markerDiff = end ? endDiff : startDiff;
        const clampedMarker = Math.max(-PAST_DAYS, Math.min(FUTURE_DAYS, markerDiff));
        const dp = parseFloat(pct(clampedMarker));

        const isOverdue = end && endDiff < 0 && t.status !== 'done';
        const isSoon = end && !isOverdue && endDiff <= 3;
        const dotCol = isOverdue ? '#E24B4A' : isSoon ? '#EF9F27' : catColor;
        const dlLabel = end
          ? (isOverdue ? `${Math.abs(endDiff)}日超過` : endDiff === 0 ? '今日' : `${endDiff}日後`)
          : '開始';

        chartContent += `
          <div style="position:absolute;left:${barFrom.toFixed(3)}%;width:${barW.toFixed(3)}%;height:8px;top:38%;background:${dotCol}22;border-radius:4px;z-index:3;"></div>
          <div style="position:absolute;left:${barFrom.toFixed(3)}%;width:${fillW.toFixed(3)}%;height:8px;top:38%;background:${progCol}99;border-radius:4px;z-index:4;"></div>
          <div style="position:absolute;left:${dp.toFixed(3)}%;top:26%;transform:translateX(-50%);z-index:6;width:14px;height:14px;border-radius:50%;background:${dotCol};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
          <div style="position:absolute;left:${dp.toFixed(3)}%;top:calc(26% + 16px);transform:translateX(-50%);z-index:6;font-size:8px;color:${dotCol};white-space:nowrap;font-weight:600;">${dlLabel}</div>
          <div style="position:absolute;left:${barFrom.toFixed(3)}%;top:58%;font-size:8px;color:${progCol};font-weight:600;z-index:5;">${prog}%</div>`;
      } else {
        const barFrom = parseFloat(pct(-PAST_DAYS));
        const barW    = parseFloat(pct(FUTURE_DAYS)) - barFrom;
        const fillW   = barW * prog / 100;
        chartContent += `
          <div style="position:absolute;left:${barFrom.toFixed(3)}%;width:${barW.toFixed(3)}%;height:8px;top:38%;background:#ddd;border-radius:4px;z-index:3;"></div>
          <div style="position:absolute;left:${barFrom.toFixed(3)}%;width:${fillW.toFixed(3)}%;height:8px;top:38%;background:${progCol}99;border-radius:4px;z-index:4;"></div>
          <div style="position:absolute;left:${todayPct.toFixed(3)}%;top:26%;transform:translate(-50%,-0%);z-index:5;width:10px;height:10px;border-radius:50%;background:#bbb;border:2px solid white;"></div>
          <div style="position:absolute;left:${barFrom.toFixed(3)}%;top:58%;font-size:8px;color:${progCol};font-weight:600;z-index:5;">${prog}%</div>`;
      }

      const q = t.urgency && t.importance ? 'Q1' : !t.urgency && t.importance ? 'Q2' : t.urgency ? 'Q3' : 'Q4';
      const qCol = q==='Q1'?'#c44':q==='Q2'?'#2563eb':q==='Q3'?'#b45309':'#888';
      const scheduleText = dateRangeText(t.startDate, t.endDate);

      rows += `<div class="wbs-tl-task">
        <div class="wbs-tl-label">
          <div style="display:flex;align-items:flex-start;gap:4px;">
            <span style="color:var(--text3);font-size:9px;font-family:monospace;flex-shrink:0;margin-top:1px;">${String(wbsNo++).padStart(2,'0')}</span>
            <span style="font-size:11px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(t.title)}">${escapeHtml(t.title)}</span>
          </div>
          <div style="display:flex;gap:4px;align-items:center;margin-top:2px;flex-wrap:wrap;">
            <span style="font-size:9px;color:${stColor[t.status]};border:1px solid ${stColor[t.status]};padding:0 3px;border-radius:2px;line-height:1.6;">${stLabel[t.status]}</span>
            <span style="font-size:9px;color:${qCol};font-weight:600;">${q}</span>
            <span style="font-size:9px;color:var(--text2);">${formatHours(t.effort)}h</span>
          </div>
          ${scheduleText ? `<div style="font-size:8px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${scheduleText}</div>` : ''}
          <div style="margin-top:3px;">
            <div style="height:3px;background:var(--border);border-radius:2px;"><div style="height:3px;width:${prog}%;background:${progCol};border-radius:2px;"></div></div>
            <div style="font-size:8px;color:${progCol};font-weight:600;margin-top:1px;">${prog}%  ${owners.map(o=>`👤${escapeHtml(o)}`).join(' ')}</div>
          </div>
        </div>
        <div class="wbs-tl-chart">${chartContent}</div>
      </div>`;
    });
  });

  const totalAll = tasks.reduce((s,t) => s + t.effort, 0);
  const avgProgAll = tasks.length ? Math.round(tasks.reduce((s,t) => s + (t.progress||0), 0) / tasks.length) : 0;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
      <div style="font-size:13px;font-weight:500;">WBS タイムライン <span style="font-size:11px;font-weight:400;color:var(--text2);">（7日前〜今日〜28日後）</span></div>
      <div style="font-size:11px;color:var(--text2);">総工数: <strong style="color:var(--text);">${formatHours(totalAll)}h</strong> · ${tasks.length}件 · 全体進捗: <strong style="color:var(--text);">${avgProgAll}%</strong></div>
    </div>
    <div class="wbs-timeline">
      <div class="wbs-tl-header">
        <div class="wbs-tl-label" style="font-size:10px;color:var(--text2);font-weight:500;justify-content:center;align-items:center;text-align:center;">
          <div style="font-size:9px;color:var(--text3);">月</div>
          <div style="font-size:9px;color:var(--text3);">日</div>
          <div style="font-size:9px;color:var(--text3);">曜</div>
        </div>
        <div class="wbs-tl-chart" style="position:relative;">
          ${todayHighlight}${monthBand}${dayBand}${wdayBand}${gridLines}
          <div style="position:absolute;left:${todayPct.toFixed(3)}%;top:0;bottom:0;width:2px;background:#E24B4A;opacity:.8;z-index:9;"></div>
        </div>
      </div>
      ${rows}
    </div>
    <div style="margin-top:10px;display:flex;gap:14px;font-size:10px;color:var(--text2);flex-wrap:wrap;">
      <span>● 終了日マーカー：<span style="color:#E24B4A;">超過</span> / <span style="color:#EF9F27;">3日以内</span> / <span style="color:#1D9E75;">通常</span></span>
      <span>進捗バー（塗り）= 進捗率</span>
      <span style="color:#E24B4A;font-weight:500;">│ = 今日</span>
    </div>`;
}

function printWBS() {
  renderWBS();
  const allPanels = document.querySelectorAll('.panel');
  const prevStates = [];
  allPanels.forEach(p => { prevStates.push(p.classList.contains('active')); p.classList.remove('active'); });
  document.getElementById('p-wbs').classList.add('active');
  document.body.classList.add('print-wbs-only');
  setTimeout(() => {
    window.print();
    allPanels.forEach((p, i) => { if (prevStates[i]) p.classList.add('active'); });
    document.body.classList.remove('print-wbs-only');
  }, 150);
}

// ==================== STRESS ====================
function updateStressMeta() {
  const vals = Object.values(smxData).map(d => d.score).filter(Boolean);
  const avg = vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
  const alerts = vals.filter(s => s <= 2).length;
  sv('stressAvg', avg ? avg.toFixed(1) : '--');
  sv('alertCnt', alerts);
  const ac = document.getElementById('alertCard');
  const al = document.getElementById('alertLbl');
  if (ac) { ac.style.background = alerts > 0 ? '#fff0f0' : ''; ac.style.borderColor = alerts > 0 ? '#fcc' : ''; }
  if (al) al.style.color = alerts > 0 ? '#c44' : '';
  const la = LOCS.map(l => { const sc = AREAS.map(a => smxData[`${l}_${a}`]?.score).filter(Boolean); return {l, a: sc.length ? sc.reduce((a,b)=>a+b,0)/sc.length : 0}; });
  const tl = la.sort((a,b) => a.a - b.a)[0];
  sv('topLoc', tl?.a > 0 ? `${tl.l} (${tl.a.toFixed(1)})` : '--');
  const aa = AREAS.map(a => { const sc = LOCS.map(l => smxData[`${l}_${a}`]?.score).filter(Boolean); return {a, v: sc.length ? sc.reduce((x,y)=>x+y,0)/sc.length : 0}; });
  const ta = aa.sort((a,b) => a.v - b.v)[0];
  sv('topArea', ta?.v > 0 ? `${ta.a} (${ta.v.toFixed(1)})` : '--');
}

function renderSmx() {
  const table = document.getElementById('smxTable'); if (!table) return;
  let html = '<thead><tr><th class="row-head">場所 \\ 部位</th>';
  AREAS.forEach(a => {
    const sc = LOCS.map(l => smxData[`${l}_${a}`]?.score).filter(Boolean);
    const avg = sc.length ? sc.reduce((x,y)=>x+y,0)/sc.length : null;
    const col = avg ? SC[Math.round(avg)] : null;
    html += `<th>${a}${avg ? `<br><span style="font-size:9px;color:${col};font-family:monospace;">${avg.toFixed(1)}</span>` : ''}</th>`;
  });
  html += '</tr></thead><tbody>';
  LOCS.forEach(loc => {
    const lsc = AREAS.map(a => smxData[`${loc}_${a}`]?.score).filter(Boolean);
    const lavg = lsc.length ? lsc.reduce((a,b)=>a+b,0)/lsc.length : null;
    const lcol = lavg ? SC[Math.round(lavg)] : null;
    html += `<tr><th class="row-head">${loc}${lavg ? `<br><span style="font-size:9px;color:${lcol};font-family:monospace;font-weight:400;">${lavg.toFixed(1)}</span>` : ''}</th>`;
    AREAS.forEach(area => {
      const key = `${loc}_${area}`;
      const d = smxData[key];
      const s = d?.score;
      const col = s ? SC[s] : null;
      const isSel = selCell?.loc === loc && selCell?.area === area;
      html += `<td class="smx-cell${isSel?' smx-selected':''}" onclick="selCellFn('${loc}','${area}')" style="${isSel?`outline:2px solid ${col||'#333'};`:''}"  >`;
      if (s) {
        html += `<div class="smx-score" style="background:${col}33;color:${col};">${s}</div>`;
        html += `<div class="smx-lbl">${SL[s]}</div>`;
      } else {
        html += `<div class="smx-score" style="background:#eee;color:#aaa;font-size:16px;">+</div>`;
        html += `<div class="smx-lbl" style="color:#bbb;">未記録</div>`;
      }
      html += '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

function selCellFn(loc, area) {
  selCell = {loc, area};
  selScore = smxData[`${loc}_${area}`]?.score || null;
  const ep = document.getElementById('editPanel'); if (ep) ep.style.display = 'block';
  const d = smxData[`${loc}_${area}`];
  sv('editTitle', `${loc} × ${area}${d ? ` — 現在: ${SL[d.score]}` : '（未記録）'}`);
  const sn = document.getElementById('stressNote'); if (sn) sn.value = d?.note || '';
  renderScoreBtns(); renderSmx();
  ep?.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderScoreBtns() {
  const el = document.getElementById('scoreBtns'); if (!el) return;
  el.innerHTML = [5,4,3,2,1].map(s => {
    const col = SC[s], pk = selScore === s;
    return `<button class="score-btn" onclick="ps(${s})" style="background:${col}${pk?'44':'1A'};color:${col};border-color:${pk?col:'transparent'};">
      <div style="font-size:16px;font-weight:500;">${s}</div>
      <div style="font-size:9px;">${SL[s]}</div>
    </button>`;
  }).join('');
}

function ps(s) { selScore = s; renderScoreBtns(); }

function saveStress() {
  if (!selCell || !selScore) return;
  const {loc, area} = selCell;
  const key = `${loc}_${area}`;
  const note = document.getElementById('stressNote')?.value || '';
  const ts = todayStr();
  smxData[key] = {score: selScore, note, ts};
  slog.unshift({id: slogN++, loc, area, score: selScore, note, ts});
  save(); closeEdit(); updateStressMeta(); renderSmx(); renderSlog(); updateMetrics();
}

function closeEdit() {
  selCell = null; selScore = null;
  const ep = document.getElementById('editPanel'); if (ep) ep.style.display = 'none';
  renderSmx();
}

function renderSlog() {
  const el = document.getElementById('slogEl'); if (!el) return;
  if (!slog.length) { el.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text2);">まだ記録がありません</div>'; return; }
  el.innerHTML = slog.slice(0, 15).map(e => {
    const col = SC[e.score];
    return `<div class="log-item">
      <div class="log-dot" style="background:${col}22;color:${col};">${e.score}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;">${e.loc} × ${e.area} <span style="font-size:11px;font-weight:400;color:${col};">${SL[e.score]}</span></div>
        ${e.note ? `<div style="font-size:11px;color:var(--text2);">${e.note}</div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text3);flex-shrink:0;">${e.ts}</div>
    </div>`;
  }).join('');
}

// ==================== PRINT ALL ====================
function printAll() {
  const panels = ['p-dash','p-tasks','p-wbs','p-stress'];
  renderWBS();
  document.body.classList.add('printing-all');
  panels.forEach(id => { document.getElementById(id).classList.add('active'); });
  document.getElementById('p-export').classList.remove('active');
  setTimeout(() => {
    window.print();
    panels.forEach(id => { document.getElementById(id).classList.remove('active'); });
    document.getElementById('p-export').classList.add('active');
    document.body.classList.remove('printing-all');
  }, 200);
}

// ==================== EXPORT / IMPORT JSON ====================
function exportJSON() {
  const data = {
    schemaVersion: APP_SCHEMA_VERSION,
    tasks, smxData, slog, catalogs,
    settings: {
      daily: document.getElementById('dailyCap')?.value,
      weekly: document.getElementById('weeklyCap')?.value,
      catalogs
    }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `csm_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}
function importJSON(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.catalogs || data.settings?.catalogs) catalogs = normalizeCatalogs(data.catalogs || data.settings.catalogs);
      if (data.tasks) {
        tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTaskForUi) : [];
        ensureCatalogsCoverTasks(tasks);
      }
      if (data.smxData) smxData = normalizeStressForUi(data.smxData);
      if (data.slog) slog = normalizeSlogForUi(data.slog);
      if (data.settings) {
        if (document.getElementById('dailyCap')) document.getElementById('dailyCap').value = formatHours(data.settings.daily || 8);
        if (document.getElementById('weeklyCap')) document.getElementById('weeklyCap').value = formatHours(data.settings.weekly || 40);
      }
      nid = tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
      slogN = slog.length ? Math.max(...slog.map(e => e.id || 0)) + 1 : 1;
      save(); ra();
      alert('データを読み込みました。');
    } catch(err) { alert('読み込みに失敗しました: '+err.message); }
  };
  reader.readAsText(file);
}

// ==================== REFRESH ALL ====================
function ra() {
  refreshAllContentFromState();
}

// Print all: special CSS
const printStyle = document.createElement('style');
printStyle.textContent = `
body.printing-all .panel { display: block !important; }
body.printing-all #p-export { display: none !important; }
@media print {
  body.printing-all .panel { display: block !important; }
  body.printing-all .panel + .panel { page-break-before: always; }
  body.printing-all .tabs, body.printing-all .header { display: none; }
  body.printing-all .no-print { display: none !important; }
  /* WBS only print */
  body.print-wbs-only .panel { display: none !important; }
  body.print-wbs-only #p-wbs { display: block !important; }
  body.print-wbs-only .tabs, body.print-wbs-only .header { display: none !important; }
  body.print-wbs-only .no-print { display: none !important; }
  /* Timeline print adjustments */
  .wbs-tl-label { width: 160px !important; }
  .wbs-timeline { font-size: 10px !important; }
}`;
document.head.appendChild(printStyle);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Initial render
ra();
