/* Z tools stay inside the chat window, so opening a built-in plugin does not reset the model. */
(() => {
  'use strict';
  const allowed = new Set([
    'personal.html', 'plugins.html', 'quick.html', 'notes.html', 'focus.html',
    'shortcut.html', 'research.html', 'command-center.html', 'code-lab.html',
  ]);
  let frame = null;
  let overlay = null;
  let focusBefore = null;
  const closePanel = () => {
    if (!overlay) return;
    const old = overlay;
    overlay = null; frame = null;
    old.remove();
    focusBefore?.focus?.();
    focusBefore = null;
  };
  const openPanel = (url, title) => {
    if (!document.getElementById('app') || document.getElementById('z-safe-start')) {
      location.href = url.href;
      return;
    }
    if (!overlay) {
      focusBefore = document.activeElement;
      overlay = document.createElement('div');
      overlay.id = 'z-tools-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Z built-in tools');
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '2147482999',
        background: 'rgba(3,9,18,.88)', display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      });
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px',
        borderBottom: '1px solid #31465f', background: '#111d2d', minHeight: '58px',
        color: '#ebf3ff', font: '600 15px system-ui,-apple-system,sans-serif',
      });
      const back = document.createElement('button');
      back.type = 'button'; back.textContent = '← Z Chat';
      back.id = 'z-tools-back';
      Object.assign(back.style, {
        border: '1px solid #445876', borderRadius: '11px', padding: '10px 12px',
        background: '#263954', color: '#eaf3ff', font: 'inherit', cursor: 'pointer',
      });
      back.addEventListener('click', closePanel);
      const caption = document.createElement('strong');
      caption.id = 'z-tools-heading'; caption.textContent = 'Z Tools';
      bar.append(back, caption);
      frame = document.createElement('iframe');
      frame.id = 'z-tools-frame'; frame.title = 'Z built-in tools';
      frame.style.cssText = 'width:100%;flex:1;min-height:0;border:0;background:#0a111d';
      frame.addEventListener('load', () => {
        try {
          frame.contentDocument.addEventListener('click', e => {
            const link = e.target.closest('a[href]');
            if (!link) return;
            const destination = new URL(link.href);
            if (destination.origin === location.origin &&
                (destination.pathname.endsWith('/index.html') ||
                 destination.pathname.endsWith('/'))) {
              e.preventDefault();
              closePanel();
            }
          });
        } catch { /* External pages cannot access our chat. */ }
      });
      overlay.append(bar, frame);
      document.body.append(overlay);
    }
    document.getElementById('z-tools-heading').textContent = title || 'Z Tools';
    frame.src = url.href;
    document.getElementById('z-tools-back')?.focus();
  };
  document.addEventListener('click', e => {
    const anchor = e.target.closest('a[href]');
    if (!anchor || e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
        anchor.target === '_blank') return;
    if (!anchor.closest('#app') && anchor.id !== 'z-tool-link') return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    const filename = url.pathname.split('/').pop();
    if (url.origin !== location.origin || !allowed.has(filename)) return;
    e.preventDefault();
    openPanel(url, anchor.textContent.trim() || 'Z Tools');
  });
  window.addEventListener('message', e => {
    if (!frame || e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type !== 'z:insert-draft' || typeof e.data.text !== 'string') return;
    const text = e.data.text.trim();
    if (!text || text.length > 20000) return;
    const input = document.getElementById('user-input');
    if (!input) return;
    if (input.value.trim() && !confirm('Replace your current unsent chat draft?')) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    closePanel();
    if (!input.disabled) input.focus();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = input.disabled
      ? 'Added to Z Chat. Load an AI model before sending.'
      : 'Added to Z Chat. Review and press Send.';
    document.getElementById('toast-stack')?.append(toast);
    setTimeout(() => toast.remove(), 5500);
  });
  document.addEventListener('keydown', e => {
    if (overlay && e.key === 'Escape') { e.preventDefault(); closePanel(); }
  });
})();
