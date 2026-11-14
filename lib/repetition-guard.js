/** Stop obvious decoding loops before they fill a conversation with repeated text. */
export const REPETITION_MESSAGE = 'I got stuck repeating myself, so I stopped this reply. Start a new conversation and try again. If it keeps happening, switch models.';
export class RepetitionError extends Error {
  constructor() { super(REPETITION_MESSAGE); this.name = 'RepetitionError'; }
}
export function hasRepetitionLoop(text) {
  if (typeof text !== 'string') return false;
  const tail = text.slice(-4096).trim().toLowerCase();
  if (tail.length < 48) return false;
  const words = tail.match(/[\p{L}\p{N}]+/gu) || [];
  // Require twelve consecutive copies of a word or short phrase, not merely
  // frequent words scattered through prose, source excerpts or program code.
  for (let size = 1; size <= 8; size++) {
    const count = size * 12;
    if (words.length < count) continue;
    const end = words.length;
    let repeats = true;
    for (let i = 0; i < count; i++) {
      if (words[end - 1 - i] !== words[end - 1 - (i % size)]) { repeats = false; break; }
    }
    if (repeats) return true;
  }
  // Some tokenizers produce a loop without spaces ("hellohellohello...").
  if (tail.length >= 96) {
    for (let size = 1; size <= 32; size++) {
      const unit = tail.slice(-size);
      if (/\p{L}/u.test(unit) && tail.endsWith(unit.repeat(12))) return true;
    }
  }
  return false;
}
const guardedModels = new WeakSet();
export function withRepetitionGuard(model) {
  if (guardedModels.has(model)) return model;
  const generate = model.generate.bind(model);
  model.generate = async function* (...args) {
    try {
      for await (const chunk of generate(...args)) {
        if (hasRepetitionLoop(chunk.rawText ?? chunk.text)) throw new RepetitionError();
        yield chunk;
      }
    } catch (error) {
      // The source iterator has closed before reset, so its finally block
      // cannot restore a poisoned prompt cache after this cleanup.
      if (error?.name === 'RepetitionError') {
        try { await model.reset?.(); } catch { /* Preserve the actual failure. */ }
      }
      throw error;
    }
  };
  guardedModels.add(model);
  return model;
}
