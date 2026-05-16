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
