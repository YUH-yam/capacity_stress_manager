// ==================== WBS (Timeline) ====================
function renderWBS() {
  const el = document.getElementById('wbsContent'); if (!el) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const PAST_DAYS = 7;
  const FUTURE_DAYS = 28;
  const TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS + 1; // 7日前〜28日後の36日分
  const COL_W = (100 / TOTAL_DAYS).toFixed(4); // % per day

  function clampDayOffset(dayOffset) {
    return Math.max(-PAST_DAYS, Math.min(FUTURE_DAYS, dayOffset));
  }
  function timePct(dayOffset, minuteOfDay = 0) {
    const clippedDay = clampDayOffset(dayOffset);
    const clippedMinute = Math.max(0, Math.min(1439, minuteOfDay));
    const raw = ((clippedDay + PAST_DAYS + clippedMinute / 1440) / TOTAL_DAYS) * 100;
    return Math.max(0, Math.min(100, raw));
  }
  function pct(dayOffset) {
    return timePct(dayOffset, 0).toFixed(3);
  }
  function endPct(dayOffset) {
    return timePct(dayOffset, 1439);
  }
  function scheduleMetrics(startDate, endDate, fallbackColor, progress, status) {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start && !end) {
      return {
        hasDate: false,
        left: 0,
        width: 100,
        fillWidth: Math.max(0, Math.min(100, progress || 0)),
        markerPct: todayPct,
        markerEdge: 'center',
        color: '#d0d0cc',
        markerLabel: '未設定'
      };
    }

    const startBase = start || end || today;
    const endBase = end || start || today;
    const startDiff = Math.round((startBase - today) / 86400000);
    const endDiff = Math.round((endBase - today) / 86400000);
    const fromDiff = Math.min(startDiff, endDiff);
    const toDiff = Math.max(startDiff, endDiff);
    const left = timePct(fromDiff, 0);
    const right = endPct(toDiff);
    const width = Math.max(0.4, right - left);
    const markerDiff = end ? endDiff : startDiff;
    const markerPct = end ? endPct(markerDiff) : timePct(markerDiff, 0);
    const isOverdue = end && endDiff < 0 && status !== 'done';
    const isSoon = end && !isOverdue && endDiff <= 3;
    const color = isOverdue ? '#E24B4A' : isSoon ? '#EF9F27' : fallbackColor;
    const markerLabel = end
      ? (isOverdue ? `${Math.abs(endDiff)}日超過` : endDiff === 0 ? '今日' : `${endDiff}日後`)
      : '開始';

    return {
      hasDate: true,
      left,
      width,
      fillWidth: Math.max(0, Math.min(width, width * (progress || 0) / 100)),
      markerPct,
      markerEdge: end ? 'end' : 'start',
      color,
      markerLabel
    };
  }
  function markerLeftCss(metrics, sizePx) {
    if (metrics.markerEdge === 'end') return `calc(${metrics.markerPct.toFixed(3)}% - ${sizePx}px)`;
    if (metrics.markerEdge === 'start') return `${metrics.markerPct.toFixed(3)}%`;
    return `calc(${metrics.markerPct.toFixed(3)}% - ${sizePx / 2}px)`;
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
  let mobileRows = '';
  let wbsNo = 1;

  catalogs.categories.forEach(catInfo => {
    const cat = catInfo.id;
    const catColor = catInfo.color;
    const catTasks = tasks.filter(t => t.category === cat);
    if (!catTasks.length) return;
    const totalH = catTasks.reduce((s,t) => s + t.effort, 0);
    const avgProg = Math.round(catTasks.reduce((s,t) => s + (t.progress||0), 0) / catTasks.length);
    let mobileTaskCards = '';

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
      const taskNo = String(wbsNo++).padStart(2,'0');

      let chartContent = colBgs + gridLines + todayLine;
      const metrics = scheduleMetrics(t.startDate, t.endDate, catColor, prog, t.status);

      if (metrics.hasDate) {
        const dotLeft = markerLeftCss(metrics, 14);
        const labelLeft = metrics.markerEdge === 'end'
          ? `calc(${metrics.markerPct.toFixed(3)}% - 28px)`
          : metrics.markerEdge === 'start'
            ? `${metrics.markerPct.toFixed(3)}%`
            : `calc(${metrics.markerPct.toFixed(3)}% - 14px)`;

        chartContent += `
          <div style="position:absolute;left:${metrics.left.toFixed(3)}%;width:${metrics.width.toFixed(3)}%;height:8px;top:38%;background:${metrics.color}22;border-radius:4px;z-index:3;"></div>
          <div style="position:absolute;left:${metrics.left.toFixed(3)}%;width:${metrics.fillWidth.toFixed(3)}%;height:8px;top:38%;background:${progCol}99;border-radius:4px;z-index:4;"></div>
          <div style="position:absolute;left:${dotLeft};top:26%;z-index:6;width:14px;height:14px;border-radius:50%;background:${metrics.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
          <div style="position:absolute;left:${labelLeft};top:calc(26% + 16px);z-index:6;font-size:8px;color:${metrics.color};white-space:nowrap;font-weight:600;">${metrics.markerLabel}</div>
          <div style="position:absolute;left:${metrics.left.toFixed(3)}%;top:58%;font-size:8px;color:${progCol};font-weight:600;z-index:5;">${prog}%</div>`;
      } else {
        chartContent += `
          <div style="position:absolute;left:${metrics.left.toFixed(3)}%;width:${metrics.width.toFixed(3)}%;height:8px;top:38%;background:#ddd;border-radius:4px;z-index:3;"></div>
          <div style="position:absolute;left:${metrics.left.toFixed(3)}%;width:${metrics.fillWidth.toFixed(3)}%;height:8px;top:38%;background:${progCol}99;border-radius:4px;z-index:4;"></div>
          <div style="position:absolute;left:${todayPct.toFixed(3)}%;top:26%;transform:translate(-50%,-0%);z-index:5;width:10px;height:10px;border-radius:50%;background:#bbb;border:2px solid white;"></div>
          <div style="position:absolute;left:${metrics.left.toFixed(3)}%;top:58%;font-size:8px;color:${progCol};font-weight:600;z-index:5;">${prog}%</div>`;
      }

      const q = t.urgency && t.importance ? 'Q1' : !t.urgency && t.importance ? 'Q2' : t.urgency ? 'Q3' : 'Q4';
      const qCol = q==='Q1'?'#c44':q==='Q2'?'#2563eb':q==='Q3'?'#b45309':'#888';
      const scheduleText = dateRangeText(t.startDate, t.endDate);
      const mobileOwners = owners.length ? owners.map(o => `👤${escapeHtml(o)}`).join(' ') : '担当未設定';

      rows += `<div class="wbs-tl-task">
        <div class="wbs-tl-label">
          <div style="display:flex;align-items:flex-start;gap:4px;">
            <span style="color:var(--text3);font-size:9px;font-family:monospace;flex-shrink:0;margin-top:1px;">${taskNo}</span>
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

      mobileTaskCards += `<div class="wbs-mobile-task" style="border-left-color:${catColor};">
        <div class="wbs-mobile-title-row">
          <span class="wbs-mobile-no">${taskNo}</span>
          <div class="wbs-mobile-title" title="${escapeAttr(t.title)}">${escapeHtml(t.title)}</div>
          <span class="wbs-mobile-progress" style="color:${progCol};">${prog}%</span>
        </div>
        <div class="wbs-mobile-meta">
          <span style="color:${stColor[t.status]};border-color:${stColor[t.status]};">${stLabel[t.status]}</span>
          <span style="color:${qCol};border-color:${qCol};">${q}</span>
          <span>${formatHours(t.effort)}h</span>
          <span>${mobileOwners}</span>
        </div>
        <div class="wbs-mobile-date" style="${endDateColor(t.endDate)}">${scheduleText || '日程未設定'}</div>
        <div class="wbs-mobile-rail${metrics.hasDate ? '' : ' is-empty'}">
          <div class="wbs-mobile-today" style="left:${todayPct.toFixed(3)}%;"></div>
          <div class="wbs-mobile-range" style="left:${metrics.left.toFixed(3)}%;width:${metrics.width.toFixed(3)}%;background:${metrics.color}22;">
            <div class="wbs-mobile-range-fill" style="width:${prog}%;background:${progCol};"></div>
          </div>
        </div>
        <div class="wbs-mobile-scale">
          <span>7日前</span><span>今日</span><span>28日後</span>
        </div>
      </div>`;
    });

    mobileRows += `<section class="wbs-mobile-section" style="--cat-color:${catColor};">
      <div class="wbs-mobile-cat">
        <div class="wbs-mobile-cat-name">${escapeHtml(catInfo.label)}</div>
        <div class="wbs-mobile-cat-meta">${catTasks.length}件 · ${formatHours(totalH)}h · 平均${avgProg}%</div>
      </div>
      ${mobileTaskCards}
    </section>`;
  });

  const totalAll = tasks.reduce((s,t) => s + t.effort, 0);
  const avgProgAll = tasks.length ? Math.round(tasks.reduce((s,t) => s + (t.progress||0), 0) / tasks.length) : 0;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
      <div style="font-size:13px;font-weight:500;">WBS タイムライン <span style="font-size:11px;font-weight:400;color:var(--text2);">（7日前〜今日〜28日後）</span></div>
      <div style="font-size:11px;color:var(--text2);">総工数: <strong style="color:var(--text);">${formatHours(totalAll)}h</strong> · ${tasks.length}件 · 全体進捗: <strong style="color:var(--text);">${avgProgAll}%</strong></div>
    </div>
    <div class="wbs-timeline wbs-timeline-desktop">
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
    <div class="wbs-mobile">
      ${mobileRows || '<div class="wbs-mobile-empty">タスクがありません。</div>'}
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
