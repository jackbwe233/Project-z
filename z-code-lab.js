(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE = 'project-z:change-requests:v1';
  const BOOT_PREF = 'project-z:boot-mode:v1';
  const REPO = 'jackbwe233/Project-z';
  const files = new Set([
    'index.html','app.js','z-orbital.css','plugins.html','personal.html',
    'lib/z-voice.js','lib/z-research-ui.js','z-tools-panel.js'
  ]);
  let requests = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) || '[]');
    if (Array.isArray(parsed)) {
      requests = parsed.filter(x => x && typeof x.id === 'string' && typeof x.text === 'string')
        .slice(0, 30);
    }
  } catch { /* Corrupt requests should not block the builder. */ }
  const report = message => { $('status').textContent = message; };
  const id = () => crypto.randomUUID?.() || Date.now() + '-' + Math.random();
  const field = () => ({
    text: $('change-text').value.trim(),
    area: $('change-area').value,
    risk: $('change-risk').value,
    file: $('source-file').value
  });
  function prepare(item) {
    return [
      '# Project Z — requested change',
      '',
      'Repository: ' + REPO,
      'Branch: master (inspect the latest code; use a new branch for edits)',
      'Feature area: ' + item.area,
      'Risk level: ' + item.risk,
      'Relevant starting file: ' + item.file,
      '',
      '## What I want changed',
      item.text,
      '',
      '## What success looks like',
      '- Implement the behavior I requested on iPhone and desktop.',
      '- Preserve existing chats, local data, and working features.',
      '- Add or update tests, run them, and explain any limitations.',
      '- Show me the proposed changes before merging or deploying.',
      '- Do not include credentials or secrets in GitHub code.',
      '',
      'Please inspect the repository, implement the change using your authorized GitHub tools, and give me a summary and a reviewable pull request. Do not merge without my approval.'
    ].join('\n');
  }
  const show = item => {
    $('change-text').value = item.text;
    $('change-area').value = item.area;
    $('change-risk').value = item.risk;
    $('source-file').value = files.has(item.file) ? item.file : 'index.html';
    $('request-preview').value = prepare(item);
  };
  function build() {
    const item = field();
    if (!item.text) {
      report('Describe what you want changed first.');
      $('change-text').focus();
      return null;
    }
    $('request-preview').value = prepare(item);
    report('Request prepared locally. Copy it into ChatGPT with connected GitHub access to request a real code change.');
    return item;
  }
  $('change-form').addEventListener('submit', e => {
    e.preventDefault();
    build();
  });
  function renderRequests() {
    const list = $('saved-requests');
    list.replaceChildren();
    if (!requests.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No saved change requests yet.';
      list.append(empty);
      return;
    }
    for (const request of requests) {
      const row = document.createElement('div');
      row.className = 'tile';
      const title = document.createElement('strong');
      title.textContent = request.text.slice(0, 110);
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = request.area + ' · ' + new Date(request.created).toLocaleString();
      const controls = document.createElement('div');
      controls.className = 'buttons';
      const reopen = document.createElement('button');
      reopen.type = 'button'; reopen.textContent = 'Open request';
      reopen.addEventListener('click', () => {
        show(request);
        report('Request restored. You can edit and prepare it again.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        requests = requests.filter(x => x.id !== request.id);
        try {
          localStorage.setItem(STORE, JSON.stringify(requests));
          renderRequests();
        } catch { report('Could not save removal to device storage.'); }
      });
      controls.append(reopen, remove); row.append(title, p, controls); list.append(row);
    }
  }
  $('save-request').addEventListener('click', () => {
    const item = build();
    if (!item) return;
    if (requests.length >= 30) {
      report('30 saved requests reached. Remove an old request first.');
      return;
    }
    const entry = { ...item, id: id(), created: new Date().toISOString() };
    try {
      localStorage.setItem(STORE, JSON.stringify([entry, ...requests]));
      requests.unshift(entry); renderRequests();
      report('Saved on this device. Nothing was submitted to GitHub.');
    } catch { report('Could not save this request. Copy it instead.'); }
  });
  $('copy-request').addEventListener('click', async () => {
    if (!$('request-preview').value && !build()) return;
    try {
      await navigator.clipboard.writeText($('request-preview').value);
      report('Copied! Paste it into this ChatGPT conversation with GitHub connected.');
    } catch {
      $('request-preview').focus();
      $('request-preview').select();
      report('Clipboard unavailable. Select Copy for the highlighted text.');
    }
  });
  $('send-z').addEventListener('click', () => {
    if (!$('request-preview').value && !build()) return;
    const text = $('request-preview').value;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'z:insert-draft', text }, location.origin);
      return;
    }
    try {
      sessionStorage.setItem('project-z:tool-draft:v1', text);
      location.href = './index.html?z_start=1';
    } catch { report('Could not transfer this request. Use Copy for ChatGPT.'); }
  });
  $('view-source').addEventListener('click', async () => {
    const path = $('source-file').value;
    if (!files.has(path)) {
      $('source-status').textContent = 'This file is not permitted in the source preview.';
      return;
    }
    const button = $('view-source');
    button.disabled = true;
    $('source-preview').hidden = true;
    $('source-status').textContent = 'Reading public code from GitHub…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('https://raw.githubusercontent.com/' + REPO + '/master/' + path, {
        signal: controller.signal, cache: 'no-store'
      });
      if (!res.ok) throw new Error('GitHub returned ' + res.status);
      const full = await res.text();
      const snippet = full.slice(0, 16000);
      $('source-preview').textContent = snippet;
      $('source-preview').hidden = false;
      $('source-status').textContent = path + ' · ' + full.length.toLocaleString() +
        ' characters' + (full.length > snippet.length ? ' · preview truncated' : '') + ' · read-only';
    } catch (e) {
      $('source-status').textContent = e.name === 'AbortError'
        ? 'GitHub timed out. Try again.'
        : 'Could not retrieve source: ' + e.message;
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
    }
  });
  try { $('no-intro').checked = localStorage.getItem(BOOT_PREF) === 'off'; }
  catch { /* Storage is optional. */ }
  $('no-intro').addEventListener('change', () => {
    try {
      localStorage.setItem(BOOT_PREF, $('no-intro').checked ? 'off' : 'once');
      $('animation-status').textContent = $('no-intro').checked
        ? 'Startup animation disabled on this device.'
        : 'Startup animation enabled only for the first opening in each tab.';
    } catch {
      $('animation-status').textContent = 'Could not save animation preference.';
    }
  });
  renderRequests();
})();