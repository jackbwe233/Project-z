import { describe, expect, it } from 'vitest';
import { emptyLearningStore, setLearningEnabled, setAutoSave, learnFromUserMessage } from '../lib/z-learning.js';
import { recallPetName } from '../lib/project-z.js';

describe('pet names across conversations', () => {
  it('extracts an ordinary pet name when automatic safe saving is enabled', () => {
    const optedIn = setAutoSave(setLearningEnabled(emptyLearningStore(), true), true);
    const result = learnFromUserMessage(optedIn, "My dog's name is Rocky.");
    expect(result.change).toBe('saved');
    expect(result.store.saved[0].text).toBe("My dog's name is Rocky.");
    const chat = [{ role: 'user', content: "What's my dog's name?" }];
    const stored = result.store.saved.map(entry => ({ role: 'user', content: entry.text }));
    expect(recallPetName([...stored, ...chat])).toBe('Rocky');
  });

  it('uses more recent names stated in the chat', () => {
    const stored = [{ role: 'user', content: "My dog's name is Rocky." }];
    const chat = [
      { role: 'user', content: "My dog's name is Luna." },
      { role: 'user', content: "What's my dog's name?" },
    ];
    expect(recallPetName([...stored, ...chat])).toBe('Luna');
  });

  it('does not save sensitive secrets or infer a name that was never stated', () => {
    const optedIn = setAutoSave(setLearningEnabled(emptyLearningStore(), true), true);
    expect(learnFromUserMessage(optedIn, 'My password is hunter2.').store.saved).toHaveLength(0);
    expect(recallPetName([{ role: 'user', content: "What's my dog's name?" }])).toBe('');
  });
});
