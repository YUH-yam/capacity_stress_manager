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
  const activeIdx = tab === 'export' && window.matchMedia('(max-width: 720px)').matches ? idx.settings : idx[tab];
  if (tabs[activeIdx]) tabs[activeIdx].classList.add('active');
  if (tab==='dash') { updateMetrics(); renderMatrix(); renderChart(); renderDashStress(); }
  if (tab==='tasks') renderTaskList();
  if (tab==='wbs') renderWBS();
  if (tab==='stress') { updateStressMeta(); renderSmx(); renderSlog(); }
  if (tab==='settings') renderSettings();
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
