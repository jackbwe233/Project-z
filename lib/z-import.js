// Offline, user-directed imports. No Google account access or network requests.
// Keep personal data on this device until the user explicitly exports it.
const isDate = d => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  const x = new Date(Date.UTC(y, m - 1, day));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === day;
};
const unescapeIcs = x => String(x || '').replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1').trim();
const normalizeIcsDate = x => {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(x || '');
  if (!match) return null;
  const [, yy, mm, dd, hh, min, , utc] = match;
  const date = yy + '-' + mm + '-' + dd;
  if (!isDate(date)) return null;
  if (!hh) return { date, time: '' };
  if (Number(hh) > 23 || Number(min) > 59) return null;
  if (utc) {
    const local = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min)));
    return { date: local.getFullYear() + '-' + String(local.getMonth() + 1).padStart(2, '0') + '-' + String(local.getDate()).padStart(2, '0'), time: String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0') };
  }
  return { date, time: hh + ':' + min };
};
const taskKey = t => [t.title.toLowerCase(), t.date, t.time || ''].join('|');
export function importCalendarIcs(source) {
  if (typeof source !== 'string' || source.length > 1500000 || !source.includes('BEGIN:VCALENDAR')) throw Error('Choose a valid .ics calendar file (under 1 MB).');
  const raw = source.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (const line of raw) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  const items = [];
  let event = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { event = {}; continue; }
    if (line === 'END:VEVENT') {
      if (event && !/CANCELLED/i.test(event.status || '') && event.title && event.start) {
        const when = normalizeIcsDate(event.start);
        if (when) items.push({ title: event.title.slice(0, 160), ...when, type: 'Event', done: false });
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const prop = line.slice(0, idx).split(';')[0].toUpperCase();
    const val = line.slice(idx + 1);
    if (prop === 'SUMMARY') event.title = unescapeIcs(val);
    if (prop === 'DTSTART') event.start = val.trim();
    if (prop === 'STATUS') event.status = val.trim();
  }
  return uniqueItems(items);
}
function csvRows(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim())) rows.push(row.slice());
      row.length = 0;
    } else field += c;
  }
  if (quoted) throw Error('CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
function csvDate(x) {
  const raw = String(x || '').trim();
  if (isDate(raw)) return raw;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (us) {
    const dt = us[3] + '-' + us[1].padStart(2, '0') + '-' + us[2].padStart(2, '0');
    if (isDate(dt)) return dt;
  }
  return null;
}
function uniqueItems(items) {
  const seen = new Set();
  return items.filter(t => {
    const key = taskKey(t);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 500);
}
export function importAssignmentsCsv(source) {
  if (typeof source !== 'string' || source.length > 1500000) throw Error('Choose a CSV assignment file under 1 MB.');
  const rows = csvRows(source.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw Error('CSV needs a header and at least one assignment.');
  const head = rows.shift().map(x => x.toLowerCase().trim().replace(/[\s_-]+/g, ''));
  const column = (...keys) => head.findIndex(h => keys.includes(h));
  const ti = column('title', 'assignment', 'name', 'task');
  const di = column('duedate', 'due', 'deadline', 'date');
  const ci = column('course', 'class', 'subject');
  const mi = column('time', 'duetime');
  if (ti < 0 || di < 0) throw Error('CSV must have Title (or Assignment) and Due Date columns.');
  const items = [];
  for (const row of rows.slice(0, 1000)) {
    const date = csvDate(row[di]); const name = String(row[ti] || '').trim();
    if (!date || !name) continue;
    const course = ci >= 0 ? String(row[ci] || '').trim().slice(0, 40) : '';
    const time = mi >= 0 && /^\d{2}:\d{2}$/.test(row[mi]?.trim()) ? row[mi].trim() : '';
    items.push({ title: (course ? course + ': ' : '') + name.slice(0, 115), date, time, type: 'Assignment', done: false });
  }
  return uniqueItems(items.map(t => ({ ...t, title: t.title.slice(0, 160) })));
}
export function mergeImportedTasks(existing, imported, newId) {
  const seen = new Set(existing.map(taskKey));
  const available = Math.max(0, 500 - existing.length);
  const added = [];
  for (const item of imported) {
    const key = taskKey(item);
    if (seen.has(key) || added.length >= available) continue;
    seen.add(key);
    added.push({ ...item, id: newId() });
  }
  return { tasks: existing.concat(added), added: added.length, skipped: imported.length - added.length };
}
