import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decision, parseCommand, readCommand } from '../lib/z-command.js';

const chat = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const command = readFileSync(new URL('../command-center.html', import.meta.url), 'utf8');

describe('Command Center integration', () => {
  it('links from the main chat without replacing its controls', () => {
    expect(chat).toContain('href="./command-center.html"');
    expect(chat).toContain('id="new-chat-btn"');
    expect(chat).toContain('id="model-picker"');
  });
  it('provides proposals, approvals, ideas, and local backup controls', () => {
    for (const id of ['proposal', 'queue', 'idea', 'ideas', 'export', 'clear']) {
      expect(command).toContain('id="' + id + '"');
    }
    expect(command).toContain('z-command-ui.js');
  });
  it('blocks any rejected proposal even when otherwise approved', () => {
    expect(decision({risk:'low',votes:['approve','reject'],validation:'Checked reversible behavior'})).toContain('Blocked');
    expect(decision({risk:'high',votes:['reject','approve'],validation:''})).toContain('Blocked');
  });
  it('requires two approvals for major and high-risk changes', () => {
    for (const risk of ['major','high']) {
      expect(decision({risk,votes:['approve',null],validation:'Checked reversible behavior'})).toContain('Awaiting');
      expect(decision({risk,votes:['approve','approve'],validation:''})).toContain('Approved by both');
    }
  });
  it('allows conditional low-risk approval only with validation', () => {
    expect(decision({risk:'low',votes:['approve',null],validation:''})).toContain('Pending');
    expect(decision({risk:'low',votes:['approve',null],validation:'Checked reversible behavior'})).toContain('Conditionally approved');
  });
  it('never treats approval as automatic deployment', () => {
    expect(decision({risk:'major',votes:['approve','approve'],validation:''})).toContain('manual implementation only');
  });
});

describe('Command Center backups', () => {
  const proposal = { id: 'p1', title: 'Test', details: 'Try feature', risk: 'low', votes: ['approve', null], validation: 'Checked rollback' };
  it('restores notes, ideas and votes without retaining unknown properties', () => {
    const data = { proposals: [{ ...proposal, execute: 'never' }], ideas: [{id:'i1',text:'Idea'}] };
    const restored = readCommand({ getItem: () => JSON.stringify(data) });
    expect(restored.proposals[0]).toEqual(proposal);
    expect(restored.ideas[0].text).toBe('Idea');
  });
  it('does not treat the legacy validation checkbox as documented evidence', () => {
    const restored = parseCommand({ proposals: [{ ...proposal, validation: undefined, validated: true }], ideas: [] });
    expect(decision(restored.proposals[0])).toContain('Pending');
  });
  it('rejects malformed records and duplicate IDs before replacing anything', () => {
    for (const value of [null, {}, {proposals:[null],ideas:[]}, {proposals:[{...proposal,votes:['approve']}],ideas:[]}, {proposals:[proposal],ideas:[{id:'p1',text:'Duplicate'}]}]) {
      expect(() => parseCommand(value)).toThrow();
    }
  });
});
