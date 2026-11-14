import { COMMAND_KEY, emptyCommand, readCommand, parseCommand, decision } from './z-command.js';
const $ = id => document.getElementById(id);
let data = emptyCommand(), storage, loadFailed = false, originalRaw = null;
try { storage = window.localStorage; originalRaw = storage.getItem(COMMAND_KEY); data = readCommand(storage); }
catch { loadFailed = true; $('status').textContent = 'Saved data could not be loaded. Export the original data before making changes.'; }
function node(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
function action(label, handler, kind = 'secondary') { const b = node('button', label); b.className = kind; b.type = 'button'; b.onclick = handler; return b; }
function save() {
  try { storage.setItem(COMMAND_KEY, JSON.stringify(data)); $('status').textContent = 'Saved on this device.'; }
  catch { $('status').textContent = 'Storage unavailable. Changes are only in memory; export a backup.'; }
  render();
}
function render() {
  for (const form of [$('proposal'), $('idea')]) for (const field of form.elements) field.disabled = loadFailed;
  const q = $('queue'); q.replaceChildren();
  if (!data.proposals.length) q.append(node('p', 'No proposals yet.'));
  for (const p of data.proposals) {
    const el = node('div', ''); el.className = 'item';
    el.append(node('strong', p.title), node('p', p.details), node('p', `Risk: ${p.risk} · ${decision(p)}`));
    for (let i = 0; i < 2; i++) {
      const row = node('div', ''); row.className = 'row';
      row.append(node('span', `Creator ${i + 1}: ${p.votes[i] || 'pending'}`));
      for (const vote of ['approve', 'reject', null]) row.append(action(vote || 'Reset vote', () => { p.votes[i] = vote; save(); }));
      el.append(row);
    }
    const label = node('label', 'Validation evidence (low-risk proposals only)');
    const note = document.createElement('textarea'); note.rows = 2; note.maxLength = 1000;
    note.value = p.validation || ''; note.disabled = p.risk !== 'low'; label.append(note);
    const validate = action('Save validation note', () => { p.validation = note.value.trim(); save(); });
    validate.disabled = p.risk !== 'low';
    el.append(label, validate, action('Remove', () => {
      if (confirm('Remove this proposal?')) { data.proposals = data.proposals.filter(x => x.id !== p.id); save(); }
    }, 'danger')); q.append(el);
  }
  const ideas = $('ideas'); ideas.replaceChildren();
  if (!data.ideas.length) ideas.append(node('p', 'No ideas yet.'));
  for (const x of data.ideas) {
    const row = node('div', ''); row.className = 'item row';
    row.append(node('span', x.text), action('Remove', () => { data.ideas = data.ideas.filter(y => y.id !== x.id); save(); })); ideas.append(row);
  }
}
$('proposal').onsubmit = event => {
  event.preventDefault(); if (loadFailed) return;
  const title = $('title').value.trim(), details = $('details').value.trim();
  if (!title || !details) { $('status').textContent = 'Enter a name and description.'; return; }
  if (data.proposals.length >= 200) { $('status').textContent = 'Export or remove proposals first (200 maximum).'; return; }
  data.proposals.unshift({ id: crypto.randomUUID(), title, details, risk: $('risk').value, votes: [null, null], validation: '' });
  event.target.reset(); save();
};
$('idea').onsubmit = event => {
  event.preventDefault(); if (loadFailed) return; const text = $('idea-text').value.trim();
  if (!text || data.ideas.length >= 500) { $('status').textContent = 'Enter an idea (500 maximum).'; return; }
  data.ideas.unshift({ id: crypto.randomUUID(), text }); event.target.reset(); save();
};
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([loadFailed ? (originalRaw || '{}') : JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'project-z-command-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('restore').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 1000000) throw Error('Backup must be under 1 MB');
    const next = parseCommand(JSON.parse(await file.text()));
    if (!confirm('Replace local proposals and ideas with this backup? Recorded votes are not verified identities.')) return;
    data = next; loadFailed = false; save();
  } catch (error) { $('status').textContent = `Restore failed: ${error.message}. Existing data was kept.`; }
  finally { event.target.value = ''; }
};
$('clear').onclick = () => { if (confirm('Delete all local proposals and ideas?')) { data = emptyCommand(); loadFailed = false; save(); } };
render();
