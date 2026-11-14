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
export const EMPTY_REPLY_MESSAGE = 'The model produced no readable text. This is a generation failure, not a reply. Download this conversation’s Debug trace so the token diagnostics can be checked.';
export class EmptyGenerationError extends Error {
  constructor(message = EMPTY_REPLY_MESSAGE) { super(message); this.name = 'EmptyGenerationError'; }
}
const guardedModels = new WeakSet();
export function withRepetitionGuard(model) {
  if (guardedModels.has(model)) return model;
  const generate = model.generate.bind(model);
  model.generate = async function* (...args) {
    let blankTokens = 0, sawText = false, zeroTokens = 0;
    const diagnostics = { tokens: 0, firstTokenIds: [], emptyTokenLimit: 64, zeroTokenRun: 0 };
    model.lastGenerationDiagnostics = diagnostics;
    try {
      for await (const chunk of generate(...args)) {
        if (chunk.phase !== 'prefill') {
          diagnostics.tokens++;
          if (Number.isInteger(chunk.token) && diagnostics.firstTokenIds.length < 32) diagnostics.firstTokenIds.push(chunk.token);
          zeroTokens = chunk.token === 0 ? zeroTokens + 1 : 0;
          diagnostics.zeroTokenRun = Math.max(diagnostics.zeroTokenRun, zeroTokens);
          if (!sawText && zeroTokens >= 4) {
            throw new EmptyGenerationError('Gemma returned repeated token ID 0 without text. Reload the model; if it happens again, clear its cached model and download it again.');
          }
          const text = chunk.rawText ?? chunk.text;
          if (typeof text === 'string' && text.trim()) { sawText = true; blankTokens = 0; }
          else if (!sawText && ++blankTokens >= 64) throw new EmptyGenerationError();
        }
        if (hasRepetitionLoop(chunk.rawText ?? chunk.text)) throw new RepetitionError();
        yield chunk;
      }
      if (!sawText && !args[1]?.signal?.aborted) throw new EmptyGenerationError();
    } catch (error) {
      // The source iterator has closed before reset, so its finally block
      // cannot restore a poisoned prompt cache after this cleanup.
      if (['RepetitionError', 'EmptyGenerationError'].includes(error?.name)) {
        try { await model.reset?.(); } catch { /* Preserve the actual failure. */ }
      }
      throw error;
    }
  };
  guardedModels.add(model);
  return model;
}
