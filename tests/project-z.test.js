import { describe, it, expect } from 'vitest';
import { PERSONALITY, readMemory, writeMemory, withMemory, normalizeMemory, rememberFromMessage, parseMemoryBackup } from '../lib/project-z.js';
import { buildMessages, buildAgentMessages } from '../lib/messages.js';

describe('Project Z memory', () => {
  it('restores memory after a new storage reader is created', () => {
    const data = new Map();
    const storage = { setItem: (k,v) => data.set(k,v), getItem: k => data.get(k) };
    expect(writeMemory(storage, 'I prefer short replies')).toBe(true);
    expect(readMemory({ getItem: k => data.get(k) })).toBe('I prefer short replies');
  });
  it('reports blocked writes without crashing', () => {
    expect(writeMemory({ setItem() { throw Error('quota'); } }, 'test')).toBe(false);
    expect(readMemory(undefined)).toBe('');
  });
  it('saves explicit requests, deduplicates and does not infer facts', () => {
    const notes = rememberFromMessage('', 'Remember that I like lacrosse');
    expect(notes).toBe('I like lacrosse');
    expect(rememberFromMessage(notes, 'Remember that I like lacrosse')).toBe(notes);
    expect(rememberFromMessage(notes, 'My friend likes football')).toBe(notes);
    expect(normalizeMemory('a'.repeat(3000))).toHaveLength(2000);
  });
  it('restores exported memory without changing the contents', () => {
    const notes = 'I like lacrosse\nI prefer short answers';
    const saved = new Map();
    const storage = { setItem: (k, v) => saved.set(k, v), getItem: k => saved.get(k) };
    expect(writeMemory(storage, parseMemoryBackup(notes))).toBe(true);
    expect(readMemory(storage)).toBe(notes);
  });
  it('rejects invalid or oversized imports rather than silently truncating them', () => {
    expect(() => parseMemoryBackup('a'.repeat(2001))).toThrow('2,000-character limit');
    expect(() => parseMemoryBackup(null)).toThrow('text file');
    expect(parseMemoryBackup('  note  ')).toBe('note');
  });
  it('supplies notes to both chat paths without modifying stored sessions', () => {
    const session = { systemPrompt: 'You are a helpful assistant.', messages: [] };
    const enriched = withMemory(session, 'I like lacrosse');
    expect(buildMessages(enriched, { grammarMode: 'off' })[0].content).toContain('I like lacrosse');
    expect(buildAgentMessages(enriched)[0].content).toContain('I like lacrosse');
    expect(enriched.systemPrompt).toContain(PERSONALITY);
    expect(session.systemPrompt).toBe('You are a helpful assistant.');
  });
  it('preserves a custom personality and removes cleared memory from subsequent prompts', () => {
    const session = { systemPrompt: 'Custom instructions', messages: [] };
    expect(withMemory(session, '').systemPrompt).toBe('Custom instructions');
    expect(withMemory(session, 'note').systemPrompt).toContain('note');
  });
});
