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

function getTaskProgress(task) {
  return Math.max(0, Math.min(100, toFiniteNumber(task?.progress, 0)));
}

function getTaskAllocatedEffort(task) {
  if (!task || task.status === 'done') return 0;
  const remainingRatio = Math.max(0, 100 - getTaskProgress(task)) / 100;
  return roundToTenth(toFiniteNumber(task.effort, 0) * remainingRatio);
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
