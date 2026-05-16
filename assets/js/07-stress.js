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
