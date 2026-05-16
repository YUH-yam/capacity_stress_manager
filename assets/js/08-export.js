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
      const data = unwrapCsmPayload(JSON.parse(e.target.result));
      if (!data) throw new Error('CSMデータ形式ではありません。');
      const legacy = isLegacyPayload(data);
      if (data.catalogs || data.settings?.catalogs) catalogs = normalizeCatalogs(data.catalogs || data.settings.catalogs);
      if (data.tasks) {
        tasks = Array.isArray(data.tasks) ? data.tasks.map((task, idx) => normalizeTaskForUi(task, idx, {legacy})) : [];
        ensureCatalogsCoverTasks(tasks);
      }
      if (data.smxData) smxData = normalizeStressForUi(data.smxData, {legacy});
      if (data.slog) slog = normalizeSlogForUi(data.slog, {legacy});
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
