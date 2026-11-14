import { describe, it, expect, vi } from 'vitest';
import { stockIdentity, safeSource, researchStock, parseResearch, researchDraft } from '../lib/z-research.js';
const stock = { symbol: 'AAPL', company: 'Apple Inc., NASDAQ' };
const source = { title: 'Earnings', url: 'https://example.com/earnings', snippet: 'Source excerpt' };
describe('stock research jobs', () => {
  it('validates tickers and requires company context', () => {
    expect(stockIdentity('brk.b', 'Berkshire, NYSE').symbol).toBe('BRK.B');
    expect(() => stockIdentity('bad ticker', 'Test')).toThrow();
    expect(() => stockIdentity('AAPL', '')).toThrow();
  });
  it('runs three bounded searches and preserves dated source evidence', async () => {
    const provider = { search: vi.fn(async () => ({ results: [source] })) };
    const report = await researchStock(stock, provider, { now: () => new Date('2026-11-14T12:00:00Z') });
    expect(provider.search).toHaveBeenCalledTimes(3);
    expect(provider.search.mock.calls[0][0]).toContain('Apple Inc., NASDAQ');
    expect(report.checkedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(report.sections[0].sources[0]).toEqual(source);
    expect(researchDraft(report)).toContain('untrusted evidence');
    expect(researchDraft(report)).toContain(source.url);
  });
  it('keeps successful sections when one search fails', async () => {
    const provider = { search: vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ results: [source] }) };
    const report = await researchStock(stock, provider);
    expect(report.sections[0].error).toContain('unavailable');
    expect(report.sections[1].sources).toHaveLength(1);
  });
  it('stops subsequent searches when cancelled', async () => {
    const controller = new AbortController();
    const provider = { search: vi.fn(async () => { controller.abort(); return { results: [source] }; }) };
    await expect(researchStock(stock, provider, { signal: controller.signal })).rejects.toThrow();
    expect(provider.search).toHaveBeenCalledTimes(1);
  });
  it('reports timeouts and does not invent results', async () => {
    const provider = { search: (_q, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) };
    const report = await researchStock(stock, provider, { timeoutMs: 1 });
    expect(report.sections.every(s => s.error.includes('timed out') && s.sources.length === 0)).toBe(true);
  });
  it('rejects script URLs, duplicates and damaged backups', () => {
    expect(safeSource({ ...source, url: 'javascript:alert(1)' })).toBeNull();
    expect(safeSource({ ...source, url: 'https://user:password@example.com/' })).toBeNull();
    expect(() => parseResearch([stock, stock])).toThrow();
    expect(() => parseResearch([{ ...stock, report: { checkedAt: 'bad' } }])).toThrow();
  });
  it('round trips evidence and strips unsafe imported links', async () => {
    const report = await researchStock(stock, { search: async () => ({ results: [source] }) });
    const restored = parseResearch([{ ...stock, report }]); expect(restored[0].report).toEqual(report);
    report.sections[0].sources.push({ ...source, url: 'javascript:evil' });
    expect(parseResearch([{ ...stock, report }])[0].report.sections[0].sources).toHaveLength(1);
  });
});
