export const COMMAND_KEY = 'project-z-command-v1';
export const emptyCommand = () => ({ proposals: [], ideas: [] });
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function parseCommand(value) {
  if (!value || !Array.isArray(value.proposals) || !Array.isArray(value.ideas)) throw Error('Invalid Command Center backup');
  if (value.proposals.length > 200 || value.ideas.length > 500) throw Error('Backup has too many entries');
  const ids = new Set();
  function id(value) {
    if (typeof value !== 'string' || !value || value.length > 100 || ids.has(value)) throw Error('Invalid or duplicate entry ID');
    ids.add(value); return value;
  }
  return {
    proposals: value.proposals.map(p => {
      if (!p || !text(p.title, 90) || !text(p.details, 1200) || !['low', 'major', 'high'].includes(p.risk)
        || !Array.isArray(p.votes) || p.votes.length !== 2 || p.votes.some(v => ![null, 'approve', 'reject'].includes(v))) throw Error('Invalid proposal');
      return { id: id(p.id), title: text(p.title, 90), details: text(p.details, 1200), risk: p.risk, votes: [...p.votes], validation: text(p.validation, 1000) };
    }),
    ideas: value.ideas.map(i => {
      if (!i || !text(i.text, 500)) throw Error('Invalid idea');
      return { id: id(i.id), text: text(i.text, 500) };
    }),
  };
}
export function decision(p) {
  if (p.votes.includes('reject')) return 'Blocked — creator rejection';
  if (p.votes.every(v => v === 'approve')) return 'Approved by both — manual implementation only';
  if (p.risk !== 'low') return 'Awaiting both approvals';
  if (p.votes.includes('approve') && p.validation?.trim()) return 'Conditionally approved — manual implementation only';
  return 'Pending creator approval and documented validation';
}
export function readCommand(storage) {
  const raw = storage.getItem(COMMAND_KEY);
  return raw ? parseCommand(JSON.parse(raw)) : emptyCommand();
}
