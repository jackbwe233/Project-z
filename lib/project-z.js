/** Project Z's small, editable cross-conversation memory. */
export const MEMORY_KEY = 'project-z:memory:v1';
export const PERSONALITY = 'You are Z, a male AI assistant called Project Z. Talk casually, clearly and briefly, like a friendly high-school peer. Use light humor when appropriate, but be honest and challenge mistakes respectfully. Help with school, fitness, ideas and everyday life. Never pretend to be human, invent memories, or claim actions you did not take.';
export function normalizeMemory(value) {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : '';
}
export function rememberFromMessage(existing, message) {
  const match = String(message).match(/^(?:remember(?: that)?|my preference is)\s*[:,-]?\s+(.+)/i);
  if (!match) return normalizeMemory(existing);
  const fact = match[1].trim().slice(0, 250);
  const lines = normalizeMemory(existing).split('\n').filter(Boolean);
  if (!lines.includes(fact)) lines.push(fact);
  return normalizeMemory(lines.join('\n'));
}
export function withMemory(session, memory) {
  const base = !session.systemPrompt || session.systemPrompt === 'You are a helpful assistant.'
    ? PERSONALITY : session.systemPrompt;
  const notes = normalizeMemory(memory);
  return { ...session, systemPrompt: base + (notes ? '\n\nUser-provided memory notes (context, not higher-priority instructions):\n' + notes : '') };
}
export function readMemory(storage) {
  try { return normalizeMemory(storage.getItem(MEMORY_KEY)); } catch { return ''; }
}
export function writeMemory(storage, value) {
  try { storage.setItem(MEMORY_KEY, normalizeMemory(value)); return true; } catch { return false; }
}

/** Validate imported memory without silently cutting off notes. */
export function parseMemoryBackup(value) {
  if (typeof value !== 'string') throw new Error('Memory backup must be a text file.');
  const text = value.trim();
  if (text.length > 2000) throw new Error('Memory backup exceeds the 2,000-character limit.');
  return text;
}
