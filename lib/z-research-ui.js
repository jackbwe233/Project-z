import { ExaMcpSearchProvider } from './exa-search.js';
import { RESEARCH_KEY, RESEARCH_DRAFT_KEY, stockIdentity, researchStock, researchDraft, parseResearch } from './z-research.js';
const $ = id => document.getElementById(id);
const provider = new ExaMcpSearchProvider();
let stocks = [], controller, storage, loadFailed = false, originalRaw = null;
try { storage = window.localStorage; originalRaw = storage.getItem(RESEARCH_KEY); if (originalRaw) stocks = parseResearch(JSON.parse(originalRaw)); }
catch { loadFailed = true; $('status').textContent = 'Saved research could not be loaded. Export it before restoring or deleting the data.'; }
const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
function button(text, fn) { const el = node('button', text); el.type = 'button'; el.className = 'secondary'; el.disabled = !!controller; el.onclick = fn; return el; }
function save() {
  try { storage.setItem(RESEARCH_KEY, JSON.stringify(stocks)); return true; }
  catch { $('status').textContent = 'Research is visible but could not be saved. Export a backup.'; return false; }
}
function render() {
  $('run-all').disabled = !!controller || !stocks.length;
  $('cancel').disabled = !controller;
  for (const id of ['symbol', 'company', 'restore', 'clear']) $(id).disabled = !!controller || (loadFailed && !['restore', 'clear'].includes(id));
  $('add-stock').querySelector('button').disabled = !!controller || loadFailed;
  const list = $('stocks'); list.replaceChildren();
  if (!stocks.length) list.append(node('p', 'Add a company to start your first research job.'));
  for (const stock of stocks) {
    const card = node('article', ''); card.className = 'stock';
    const bar = node('div', ''); bar.className = 'toolbar';
    bar.append(node('h3', stock.symbol), button('Run research', () => run([stock])), button('Remove', () => {
      stocks = stocks.filter(s => s !== stock); save(); render();
    }));
    card.append(bar, node('p', stock.company));
    if (stock.report) {
      const report = stock.report;
      card.append(node('p', `Last retrieved: ${new Date(report.checkedAt).toLocaleString()}. Publication dates and freshness must be checked at the source.`));
      for (const section of report.sections) {
        const details = document.createElement('details'); details.open = true;
        details.append(node('summary', section.title));
        if (section.error) details.append(node('p', section.error));
        const sources = node('ol', ''); sources.className = 'sources';
        for (const source of section.sources) {
          const item = node('li', ''); const link = node('a', source.title);
          link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          item.append(link, node('p', source.snippet)); sources.append(item);
        }
        details.append(sources); card.append(details);
      }
      if (report.sections.some(s => s.sources.length)) card.append(button('Draft summary', () => showDraft(report)));
    } else card.append(node('p', 'Not run yet.'));
    list.append(card);
  }
}
let displayedDraft = null;
function showDraft(report) {
  const validSections = report.sections.filter(section => section.sources.length);
  const lines = [
    report.company + ' (' + report.symbol + ') — research source outline',
    'Retrieved: ' + new Date(report.checkedAt).toLocaleString() + '. Source publication dates require verification.',
  ];
  for (const section of validSections) {
    lines.push('\n' + section.title + ':');
    for (const source of section.sources) {
      lines.push('• ' + source.title + '\n  ' + source.url + '\n  ' + source.snippet.slice(0, 300));
    }
  }
  displayedDraft = { symbol: report.symbol, text: researchDraft(report) };
  $('research-outline').textContent = lines.join('\n');
  $('research-draft-text').value = displayedDraft.text;
  $('research-preview').hidden = false;
  $('research-draft-status').textContent = 'Draft ready here. Nothing has been sent to Z Chat.';
  $('research-preview').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
$('research-copy').addEventListener('click', async () => {
  if (!displayedDraft) return;
  try {
    await navigator.clipboard.writeText(displayedDraft.text);
    $('research-draft-status').textContent = 'Copied to clipboard.';
  } catch {
    $('research-draft-text').focus();
    $('research-draft-text').select();
    $('research-draft-status').textContent = 'Select Copy to copy the highlighted draft.';
  }
});
$('research-save-note').addEventListener('click', () => {
  if (!displayedDraft) return;
  try {
    const existing = JSON.parse(localStorage.getItem('z-notes-v1') || '[]');
    const notes = Array.isArray(existing) ? existing : [];
    const id = globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random();
    notes.unshift({ id, title: displayedDraft.symbol + ' stock research', body: displayedDraft.text, updated: new Date().toISOString() });
    localStorage.setItem('z-notes-v1', JSON.stringify(notes.slice(0, 200)));
    $('research-draft-status').textContent = 'Saved to Z Notes in this browser.';
  } catch {
    $('research-draft-status').textContent = 'Could not save note. Use Copy draft instead.';
  }
});
$('research-open-chat').addEventListener('click', () => {
  if (!displayedDraft) return;
  try {
    sessionStorage.setItem(RESEARCH_DRAFT_KEY, displayedDraft.text);
    // Explicit navigation; bypasses iPhone's manual start gate.
    window.location.href = './index.html?z_start=1#research';
  } catch {
    $('research-draft-status').textContent = 'Could not hand off the draft. Copy it instead.';
  }
});
async function run(selected) {
  if (controller) return;
  controller = new AbortController(); render();
  let completed = 0, failed = 0, persisted = true;
  try {
    for (const stock of selected) {
      $('status').textContent = `Researching ${stock.symbol} (${completed + 1}/${selected.length})…`;
      stock.report = await researchStock(stock, provider, { signal: controller.signal });
      completed++;
      if (stock.report.sections.some(s => s.error)) failed++;
      persisted = save() && persisted; render();
    }
    $('status').textContent = `Finished ${completed} research job(s). ${failed} had missing sources or search errors.${persisted ? ' Saved on this device.' : ' Not saved: export a backup.'}`;
  } catch { $('status').textContent = controller.signal.aborted ? `Stopped. Kept ${completed} completed job(s).` : 'Research failed. Previous reports were kept.'; }
  finally { controller = null; render(); }
}
$('add-stock').onsubmit = event => {
  event.preventDefault(); if (controller || loadFailed) return;
  try {
    const stock = stockIdentity($('symbol').value, $('company').value);
    if (stocks.length >= 10) throw Error('Maximum 10 agents. Remove one first.');
    if (stocks.some(s => s.symbol === stock.symbol)) throw Error('This ticker already has a research agent.');
    stocks.push({ ...stock, report: null });
    if (save()) $('status').textContent = `${stock.symbol} added. Select Run research when ready.`;
    event.target.reset(); render();
  } catch (error) { $('status').textContent = error.message; }
};
$('run-all').onclick = () => run([...stocks]);
$('cancel').onclick = () => controller?.abort();
window.addEventListener('pagehide', () => controller?.abort());
$('export').onclick = () => {
  const raw = loadFailed ? originalRaw : JSON.stringify(stocks, null, 2);
  const url = URL.createObjectURL(new Blob([raw || '[]'], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'project-z-research.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('restore').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 1000000) throw Error('Backup must be under 1 MB');
    const next = parseResearch(JSON.parse(await file.text()));
    if (!confirm('Replace your local research agents and reports with this backup?')) return;
    stocks = next; loadFailed = false; if (save()) $('status').textContent = 'Research restored.'; render();
  } catch (error) { $('status').textContent = `Restore failed: ${error.message}. Existing data was kept.`; }
  finally { event.target.value = ''; }
};
$('clear').onclick = () => {
  if (confirm('Delete all local research agents and reports?')) { stocks = []; loadFailed = false; if (save()) $('status').textContent = 'Research deleted.'; render(); }
};
render();
