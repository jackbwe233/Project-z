import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const chat = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const command = readFileSync(new URL('../command-center.html', import.meta.url), 'utf8');
const decisionSource = command.match(/function decision\(p\)\{[^\n]+\}/)?.[0];
if (!decisionSource) throw new Error('Approval decision function missing');
const decision = runInNewContext(decisionSource + ';decision');

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
    expect(command).toContain('localStorage');
  });
  it('blocks any rejected proposal even when otherwise approved', () => {
    expect(decision({risk:'low',votes:['approve','reject'],validated:true})).toContain('Blocked');
    expect(decision({risk:'high',votes:['reject','approve'],validated:false})).toContain('Blocked');
  });
  it('requires two approvals for major and high-risk changes', () => {
    for (const risk of ['major','high']) {
      expect(decision({risk,votes:['approve',null],validated:true})).toContain('Awaiting');
      expect(decision({risk,votes:['approve','approve'],validated:false})).toContain('Approved by both');
    }
  });
  it('allows conditional low-risk approval only with validation', () => {
    expect(decision({risk:'low',votes:['approve',null],validated:false})).toContain('Pending');
    expect(decision({risk:'low',votes:['approve',null],validated:true})).toContain('Conditionally approved');
  });
  it('never treats approval as automatic deployment', () => {
    expect(decision({risk:'major',votes:['approve','approve'],validated:false})).toContain('manual implementation only');
  });
});
