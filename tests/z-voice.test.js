import { describe, it, expect, vi, afterEach } from 'vitest';
import { createVoiceConversation } from '../lib/z-voice.js';
function setup(overrides = {}) {
  const recognizers = [], utterances = [];
  const options = {
    createRecognition: () => { const r = { start: vi.fn(), abort: vi.fn() }; recognizers.push(r); return r; },
    synth: { cancel: vi.fn(), speak: vi.fn(u => utterances.push(u)) },
    createUtterance: text => ({ text }), ready: () => true,
    send: vi.fn(async () => 'Hello Jack'), dictate: vi.fn(), onState: vi.fn(), onError: vi.fn(), ...overrides,
  };
  const voice = createVoiceConversation(options);
  return { voice, options, recognizers, utterances };
}
const result = text => ({ results: [Object.assign([{ transcript: text }], { isFinal: true })] });
afterEach(() => vi.useRealTimers());
describe('voice turn lifecycle', () => {
  it('sends a final transcript, waits for the reply, speaks, then listens again', async () => {
    const { voice, options, recognizers, utterances } = setup();
    voice.start(); recognizers[0].onresult(result('Hi'));
    await recognizers[0].onend();
    expect(options.send).toHaveBeenCalledWith('Hi');
    expect(recognizers).toHaveLength(1);
    expect(utterances[0].text).toBe('Hello Jack');
    utterances[0].onend(); expect(recognizers).toHaveLength(2); voice.stop();
  });
  it('dictation does not send or speak', async () => {
    const { voice, options, recognizers } = setup(); voice.start(false);
    recognizers[0].onresult(result('Draft only')); await recognizers[0].onend();
    expect(options.dictate).toHaveBeenCalledWith('Draft only');
    expect(options.send).not.toHaveBeenCalled(); expect(options.synth.speak).not.toHaveBeenCalled();
  });
  it('ignores late speech and recognition events after Stop', async () => {
    let resolve;
    const { voice, options, recognizers } = setup({ send: () => new Promise(r => { resolve = r; }) });
    voice.start(); const r = recognizers[0]; r.onresult(result('Hi')); const end = r.onend();
    voice.stop(); resolve('Late answer'); await end;
    expect(options.synth.speak).not.toHaveBeenCalled();
    r.onresult(result('stale')); await r.onend(); expect(voice.active).toBe(false);
  });
  it('does not restart after playback cancellation', async () => {
    const { voice, recognizers, utterances } = setup(); voice.start();
    recognizers[0].onresult(result('Hi')); await recognizers[0].onend(); voice.stop();
    utterances[0].onend(); expect(recognizers).toHaveLength(1);
  });
  it('stops on permission errors, silence, unavailable model and rejected turns', async () => {
    for (const mode of ['permission', 'silence', 'not-ready', 'send-error']) {
      const { voice, options, recognizers } = setup({ ready: () => mode !== 'not-ready', send: async () => { throw Error('failure'); } });
      voice.start();
      if (mode === 'permission') recognizers[0].onerror({ error: 'not-allowed' });
      if (mode === 'silence') await recognizers[0].onend();
      if (mode === 'send-error') { recognizers[0].onresult(result('Hi')); await recognizers[0].onend(); }
      expect(voice.active).toBe(false); expect(options.onError).toHaveBeenCalled();
    }
  });
  it('times out instead of leaving the microphone enabled indefinitely', () => {
    vi.useFakeTimers(); const { voice, recognizers } = setup(); voice.start();
    vi.advanceTimersByTime(30000); expect(voice.active).toBe(false); expect(recognizers[0].abort).toHaveBeenCalled();
  });
});
