import { describe, it, expect, vi } from 'vitest';
import { hasRepetitionLoop, withRepetitionGuard, RepetitionError, REPETITION_MESSAGE } from '../lib/repetition-guard.js';
import { generationErrorFallback } from '../lib/generation.js';
import { generateLfmAssistant } from '../lib/lfm-adapter.js';

describe('repetition guard', () => {
  it('detects repeated words, phrases and unspaced token loops', () => {
    for (const text of ['hello '.repeat(12), 'I can help. '.repeat(12), 'hello'.repeat(24), '你好吗 '.repeat(20)]) expect(hasRepetitionLoop(text)).toBe(true);
  });
  it('allows ordinary prose, code, short emphasis and punctuation', () => {
    for (const text of [undefined, 'very very good', 'ha '.repeat(8), 'The cat sat on the mat. The dog ran past the cat.', 'for (let i = 0; i < 12; i++) { console.log(i); }', '-'.repeat(200), '0123456789'.repeat(20)]) expect(hasRepetitionLoop(text)).toBe(false);
  });
  it('closes the iterator then resets cache and suppresses the looping chunk', async () => {
    const events = [], seen = [];
    const model = { async *generate() { try { yield {text:'Hello'}; yield {text:'hello '.repeat(12)}; events.push('must not run'); } finally { events.push('closed'); } }, reset() { events.push('reset'); } };
    withRepetitionGuard(model);
    await expect((async () => { for await (const chunk of model.generate()) seen.push(chunk.text); })()).rejects.toBeInstanceOf(RepetitionError);
    expect(seen).toEqual(['Hello']); expect(events).toEqual(['closed','reset']);
  });
  it('preserves runtime this and options and wraps only once', async () => {
    const model = { value:'OK', async *generate(_messages,options) { yield {text:this.value, options}; }, reset:vi.fn() };
    withRepetitionGuard(model); const generate = model.generate; withRepetitionGuard(model);
    expect(model.generate).toBe(generate);
    const received=[]; for await(const chunk of model.generate([], {maxNewTokens:42})) received.push(chunk);
    expect(received).toEqual([{text:'OK',options:{maxNewTokens:42}}]); expect(model.reset).not.toHaveBeenCalled();
  });
  it('does not swallow unrelated errors or confuse them with cancellation', async () => {
    const model={ async *generate() { yield {text:'Starting'}; throw Error('GPU failed'); },reset:vi.fn() };
    withRepetitionGuard(model);
    await expect((async()=>{for await(const chunk of model.generate()){ expect(chunk.text).toBe("Starting"); }})()).rejects.toThrow('GPU failed');
    expect(model.reset).not.toHaveBeenCalled();
  });
  it('replaces poisoned output with recovery copy', () => {
    const fallback = generationErrorFallback(new RepetitionError(),{raw:'hello '.repeat(20)});
    expect(fallback.raw).toBe(REPETITION_MESSAGE); expect(fallback.aborted).toBe(false);
  });
  it('also stops tool-enabled LFM generation', async () => {
    const model=withRepetitionGuard({ async *generate() { yield {rawText:'word '.repeat(12)}; } });
    await expect(generateLfmAssistant({model,messages:[],tools:[],maxNewTokens:100})).rejects.toBeInstanceOf(RepetitionError);
  });
});
