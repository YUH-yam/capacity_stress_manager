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
