import { describe, it, expect } from 'vitest';
import { modelHistory } from '../lib/model-history.js';
import { buildMessages, buildAgentMessages, exportSessionOpenAI } from '../lib/messages.js';
import { REPETITION_MESSAGE } from '../lib/repetition-guard.js';
describe('failed-turn prompt filtering', () => {
  it('keeps successful exchanges and the latest request, without mutating the saved chat', () => {
    const messages = [{role:'user',content:'Hi'},{role:'assistant',content:'Hello!'},
      {role:'user',content:'A failed turn'},{role:'assistant',content:'again '.repeat(20)},
      {role:'user',content:'Retry'},{role:'assistant',content:REPETITION_MESSAGE},
      {role:'user',content:'Retry again'},{role:'assistant',content:'(no output)'},
      {role:'user',content:'Hello now'}];
    const session = { messages }; const original = structuredClone(messages);
    for (const build of [buildMessages,buildAgentMessages]) {
      const result = build(session);
      expect(result.slice(1)).toEqual([messages[0],messages[1],messages.at(-1)]);
    }
    expect(messages).toEqual(original); expect(exportSessionOpenAI(session)).toHaveLength(messages.length+1);
  });
  it('drops a failed tool turn as a whole, leaving no orphan tool messages', () => {
    const messages = [{role:'user',content:'Search'}, {role:'assistant',content:null,tool_calls:[{id:'a'}]},
      {role:'tool',tool_call_id:'a',content:'result'}, {role:'assistant',content:'Failed',generationError:'GPU'},
      {role:'user',content:'Try again'}];
    expect(modelHistory(messages)).toEqual([messages.at(-1)]);
  });
});
