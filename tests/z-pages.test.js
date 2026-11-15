// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const provider = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../lib/exa-search.js', () => ({ ExaMcpSearchProvider: class { search(...args) { return provider.search(...args); } } }));
async function mount(file, module) {
  document.body.innerHTML = readFileSync(new URL('../' + file, import.meta.url), 'utf8').match(/<body(?:\s[^>]*)?>([\s\S]*)<script/)[1];
  await import(module);
}
const $ = id => document.getElementById(id);
const click = (root, label, index = 0) => [...root.querySelectorAll('button')].filter(b => b.textContent === label)[index].click();
const submit = id => $(id).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => true));
});
describe('Command Center page', () => {
  it('records evidence and votes, blocks rejection and restores persistence', async () => {
    await mount('command-center.html', '../lib/z-command-ui.js');
    $('title').value = 'Research workflow'; $('details').value = 'Check source accuracy'; submit('proposal');
    click($('queue'), 'approve'); expect($('queue').textContent).toContain('Pending');
    $('queue').querySelector('textarea').value = 'Checked rollback and cancellation'; click($('queue'), 'Save validation note');
    expect($('queue').textContent).toContain('Conditionally approved');
    click($('queue'), 'reject', 1); expect($('queue').textContent).toContain('Blocked');
    vi.resetModules(); await mount('command-center.html', '../lib/z-command-ui.js');
    expect($('queue').textContent).toContain('Blocked');
    expect($('queue').querySelector('textarea').value).toContain('rollback');
  });
  it('keeps the current queue after invalid restore and accepts a valid backup', async () => {
    await mount('command-center.html', '../lib/z-command-ui.js');
    $('title').value = 'Keep me'; $('details').value = 'Existing proposal'; submit('proposal');
    await $('restore').onchange({ target: { files: [{ size: 30, text: async () => '{"proposals":[null],"ideas":[]}' }], value: 'bad' } });
    expect($('status').textContent).toContain('Restore failed'); expect($('queue').textContent).toContain('Keep me');
    await $('restore').onchange({ target: { files: [{ size: 50, text: async () => '{"proposals":[],"ideas":[{"id":"i1","text":"Restored idea"}]}' }], value: 'good' } });
    expect($('ideas').textContent).toContain('Restored idea'); expect($('queue').textContent).not.toContain('Keep me');
  });
  it('protects corrupt data from accidental replacement and rejects blank entries', async () => {
    localStorage.setItem('project-z-command-v1', '{broken');
    await mount('command-center.html', '../lib/z-command-ui.js');
    expect($('title').disabled).toBe(true); submit('proposal');
    expect(localStorage.getItem('project-z-command-v1')).toBe('{broken');
    $('clear').click(); $('title').value = ' '; $('details').value = ' '; submit('proposal');
    expect($('queue').textContent).toContain('No proposals');
  });
});
describe('Research page', () => {
  it('runs real UI controls with a mocked provider and persists linked reports', async () => {
    provider.search.mockResolvedValue({ results: [{title:'Official earnings',url:'https://example.com/earnings',snippet:'<script>not executable</script>'}] });
    await mount('research.html', '../lib/z-research-ui.js');
    $('symbol').value = 'aapl'; $('company').value = 'Apple, NASDAQ'; submit('add-stock');
    click($('stocks'), 'Run research');
    await vi.waitFor(() => expect($('status').textContent).toContain('Finished 1'));
    expect(provider.search).toHaveBeenCalledTimes(3);
    expect($('stocks').querySelectorAll('a')).toHaveLength(3);
    expect($('stocks').querySelectorAll('script')).toHaveLength(0);
    vi.resetModules(); await mount('research.html', '../lib/z-research-ui.js');
    expect($('stocks').textContent).toContain('Official earnings');
    expect($('stocks').textContent).toContain('Last retrieved');
  });
  it('cancels an in-flight job and keeps its previous report', async () => {
    provider.search.mockImplementation((_query, {signal}) => new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(Error('aborted')))));
    await mount('research.html', '../lib/z-research-ui.js');
    $('symbol').value = 'MSFT'; $('company').value = 'Microsoft, NASDAQ'; submit('add-stock');
    click($('stocks'), 'Run research'); expect($('cancel').disabled).toBe(false); $('cancel').click();
    await vi.waitFor(() => expect($('status').textContent).toContain('Stopped'));
    expect(provider.search).toHaveBeenCalledTimes(1); expect($('run-all').disabled).toBe(false);
  });
  it('surfaces provider errors without claiming successful sources', async () => {
    provider.search.mockRejectedValue(Error('offline'));
    await mount('research.html', '../lib/z-research-ui.js');
    $('symbol').value = 'AAPL'; $('company').value = 'Apple, NASDAQ'; submit('add-stock'); $('run-all').click();
    await vi.waitFor(() => expect($('status').textContent).toContain('1 had missing sources'));
    expect($('stocks').textContent).toContain('Search provider unavailable');
    expect($('stocks').querySelectorAll('a')).toHaveLength(0);
  });
});
describe('Chat voice controls', () => {
  async function mountVoice() {
    document.body.innerHTML = '<textarea id="input"></textarea><textarea id="z-memory"></textarea><p id="z-status"></p><div id="z-avatar"></div><p id="z-voice-status"></p>' + '<input type="checkbox" id="z-learning-toggle"><div id="z-learning-saved"></div><div id="z-learning-suggestions"></div><p id="z-knowledge-count"></p><input id="z-memory-filter"><p id="z-memory-showing"></p><input type="file" id="z-memory-import-file">' + ['z-clear','z-backup','z-import','z-persist','z-mic','z-talk','z-speak','z-quiet'].map(id => `<button id="${id}"></button>`).join('');
    const recognizers = [], spoken = [];
    window.SpeechRecognition = class { constructor() { recognizers.push(this); } start() {} abort() {} };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.speechSynthesis = { cancel: vi.fn(), speak: u => spoken.push(u) };
    const send = vi.fn(async () => { $('input').value = ''; return 'A finished reply'; });
    const { initProjectZ } = await import('../lib/project-z-ui.js');
    const api = initProjectZ({input:$('input'),notify:vi.fn(),ready:()=>true,send});
    return { api, recognizers, spoken, send };
  }
  it('wires Talk to Z through sending and playback and Stop prevents restart', async () => {
    const {api,recognizers,spoken,send} = await mountVoice(); $('z-talk').click();
    expect($('z-talk').getAttribute('aria-pressed')).toBe('true');
    recognizers[0].onresult({results:[[{transcript:'Hello Z'}]]}); await recognizers[0].onend();
    expect(send).toHaveBeenCalledOnce(); expect(spoken[0].text).toBe('A finished reply');
    $('z-quiet').click(); spoken[0].onend();
    expect(recognizers).toHaveLength(1); expect($('z-talk').getAttribute('aria-pressed')).toBe('false'); api.stopVoice();
  });
  it('protects typed drafts and inserts dictation without sending', async () => {
    const {api,recognizers,send} = await mountVoice(); $('input').value='Existing draft'; $('z-talk').click();
    expect(recognizers).toHaveLength(0); $('z-mic').click();
    recognizers[0].onresult({results:[[{transcript:'more text'}]]}); await recognizers[0].onend();
    expect($('input').value).toBe('Existing draft more text'); expect(send).not.toHaveBeenCalled(); api.stopVoice();
  });
});
