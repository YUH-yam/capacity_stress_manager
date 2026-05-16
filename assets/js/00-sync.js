// ==================== GAS / SHEETS SYNC ====================
let gasUrl = '';
let syncTimer = null;
let isSyncing = false;
let lastSheetLoadError = '';

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
    lastSheetLoadError = '';

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
      const payload = unwrapCsmPayload(data);
      if (!payload || payload.error) {
        lastSheetLoadError = payload?.error || 'GASからCSMデータ形式ではない応答が返りました。';
        resolve(null);
        return;
      }
      resolve(payload);
    };

    script.onerror = function() {
      cleanup();
      lastSheetLoadError = 'JSONPスクリプトの読み込みに失敗しました。GAS URL、公開範囲、再デプロイ状況を確認してください。';
      resolve(null);
    };

    script.src = makeGasUrlWithQuery({
      action: 'load',
      callback: callbackName,
      ts: Date.now()
    });

    document.body.appendChild(script);

    setTimeout(() => {
      if (done) return;
      cleanup();
      lastSheetLoadError = 'GASから10秒以内に応答がありませんでした。URLまたはWebアプリの公開設定を確認してください。';
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
    setGasMsg(`読み込みに失敗しました。${lastSheetLoadError || 'URL・デプロイ設定を確認してください。'}`, true);
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

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch(e) { return value; }
}

function unwrapCsmPayload(data) {
  let current = parseMaybeJson(data);
  if (!current || typeof current !== 'object') return null;

  ['payload','data','csmData'].forEach(key => {
    if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key)) {
      const parsed = parseMaybeJson(current[key]);
      if (parsed && typeof parsed === 'object') current = parsed;
    }
  });

  return current && typeof current === 'object' ? current : null;
}

function isLegacyPayload(data) {
  if (!data || typeof data !== 'object') return false;
  const version = toFiniteNumber(data.schemaVersion, 0);
  return version < 2 && !(data.catalogs || data.settings?.catalogs);
}

function normalizeStressScore(score, legacy) {
  const s = Math.max(1, Math.min(5, Math.round(toFiniteNumber(score, 3))));
  return legacy ? 6 - s : s;
}

function normalizeTaskForUi(task, idx, options={}) {
  const t = task && typeof task === 'object' ? task : {};
  const legacy = Boolean(options.legacy);
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
    importance: t.importance === undefined ? (legacy ? true : false) : Boolean(t.importance),
    effort: roundToTenth(Math.max(0.1, toFiniteNumber(t.effort, 1))),
    status,
    owners: owners.length ? owners : ['自分'],
    tags,
    progress,
    startDate: normalizeDateValue(t.startDate),
    endDate: normalizeDateValue(t.endDate || t.deadline)
  };
}

function normalizeStressForUi(remote, options={}) {
  const base = defaultStress();
  const src = remote && typeof remote === 'object' ? remote : {};
  const legacy = Boolean(options.legacy);

  Object.keys(src).forEach(key => {
    const item = src[key];
    if (!item || typeof item !== 'object') return;
    const score = normalizeStressScore(item.score, legacy);
    base[key] = {
      score,
      note: String(item.note || ''),
      ts: String(item.ts || todayStr())
    };
  });

  return base;
}

function normalizeSlogForUi(remote, options={}) {
  if (!Array.isArray(remote)) return [];
  const legacy = Boolean(options.legacy);
  return remote.map((item, idx) => {
    const e = item && typeof item === 'object' ? item : {};
    const score = normalizeStressScore(e.score, legacy);
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
  data = unwrapCsmPayload(data);
  if (!data || typeof data !== 'object') return false;
  const legacy = isLegacyPayload(data);

  const remoteCatalogs = data.catalogs || data.settings?.catalogs;
  if (remoteCatalogs) {
    catalogs = normalizeCatalogs(remoteCatalogs);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'tasks')) {
    tasks = Array.isArray(data.tasks) ? data.tasks.map((task, idx) => normalizeTaskForUi(task, idx, {legacy})) : [];
    ensureCatalogsCoverTasks(tasks);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'smxData')) {
    smxData = normalizeStressForUi(data.smxData, {legacy});
  }

  if (Object.prototype.hasOwnProperty.call(data, 'slog')) {
    slog = normalizeSlogForUi(data.slog, {legacy});
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
