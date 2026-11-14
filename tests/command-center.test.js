import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const command = readFileSync(new URL('../command-center.html', import.meta.url), 'utf8');

describe('Command Center integration', () => {
  it('links the Command Center from the main chat', () => {
    expect(chat).toContain('href="./command-center.html"');
    expect(chat).toContain('id="new-chat-btn"');
    expect(chat).toContain('id="model-picker"');
  });
  it('contains the approval queue and idea lab', () => {
    expect(command).toContain('id="queue"');
    expect(command).toContain('id="ideas"');
    expect(command).toContain('function decision(p)');
  });
  it('keeps decisions manual and rejects a creator veto', () => {
    expect(command).toContain("if(p.votes.includes('reject'))");
    expect(command).toContain('manual implementation only');
    expect(command).toContain('localStorage');
  });
});
