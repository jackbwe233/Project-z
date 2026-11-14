// Lightweight, model-independent status badge for the chat header.
// No hidden monitoring or network access; checks locally stored tasks while Z is open.
(() => {
  'use strict';
  const el = document.getElementById('z-today-due');
  if (!el) return;
  const iso = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const today = () => iso(new Date());
  function update() {
    let tasks = [];
    try {
      const data = JSON.parse(localStorage.getItem('z-personal-tasks-v1') || '[]');
      if (Array.isArray(data)) tasks = data.filter(x => x && typeof x.title === 'string' && typeof x.date === 'string' && !x.done);
    } catch { /* Keep badge safe when browser data is corrupt. */ }
    const date = today();
    const urgent = tasks.filter(t => t.date <= date);
    const soon = tasks.filter(t => t.date > date && (Date.parse(t.date) - Date.parse(date)) / 86400000 <= 2);
    el.textContent = urgent.length ? urgent.length + ' due • My Day'
      : soon.length ? soon.length + ' soon • My Day'
        : 'My Day';
    el.setAttribute('aria-label', urgent.length ? 'You have ' + urgent.length + ' tasks due or overdue. Open Personal Mode.'
      : soon.length ? soon.length + ' upcoming tasks within two days. Open Personal Mode.'
        : 'Open Z Personal Mode');
    el.title = urgent.length ? 'Open your deadlines and overdue tasks' : 'Open your day and reminders';
  }
  update();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  window.addEventListener('storage', update);
  window.setInterval(update, 60000);
})();