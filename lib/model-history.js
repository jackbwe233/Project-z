import { hasRepetitionLoop, REPETITION_MESSAGE } from './repetition-guard.js';
/** Keep saved chats intact, but do not teach the model to imitate failed turns. */
export function isFailedReply(message) {
  if (message?.role !== 'assistant' || message.tool_calls?.length) return false;
  const text = String(message.content || '').trim();
  return !!message.generationError || ['(no output)', '(stopped)', REPETITION_MESSAGE].includes(text)
    || hasRepetitionLoop(text);
}
export function modelHistory(messages = []) {
  const output = [];
  let turn = [];
  const finish = () => {
    if (!turn.some(isFailedReply)) output.push(...turn);
    turn = [];
  };
  for (const message of messages) {
    if (message.role === 'user') finish();
    turn.push(message);
  }
  finish();
  return output;
}
