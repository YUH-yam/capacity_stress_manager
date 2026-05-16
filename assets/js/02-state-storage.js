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
    const localSchemaVersion = toFiniteNumber(localStorage.getItem('csm_schema_version'), 0);
    const legacyLocal = localSchemaVersion < 2 && !c;
    const t = localStorage.getItem('csm_tasks');
    if (t) {
      const parsedTasks = JSON.parse(t);
      tasks = Array.isArray(parsedTasks) ? parsedTasks.map((task, idx) => normalizeTaskForUi(task, idx, {legacy: legacyLocal})) : [];
    } else {
      tasks = tasks.map(normalizeTaskForUi);
    }
    ensureCatalogsCoverTasks(tasks);
    const n = localStorage.getItem('csm_nid');
    if (n) nid = parseInt(n);
    const s = localStorage.getItem('csm_smx');
    if (s) smxData = normalizeStressForUi(JSON.parse(s), {legacy: legacyLocal});
    const sl = localStorage.getItem('csm_slog');
    if (sl) slog = normalizeSlogForUi(JSON.parse(sl), {legacy: legacyLocal});
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
