// Match the Cloudflare Worker: maximum 12 messages and a 16,000-byte JSON body.
// Preserve the latest question and trim the oldest context first.
const MAX_BODY_BYTES = 16000;
const MAX_MESSAGES = 12;
const MAX_CHARS = 4000;
const encoder = new TextEncoder();

export function buildGeminiHistory(messages) {
  if (!Array.isArray(messages)) throw new Error("Conversation is missing.");
  const valid = messages.filter(m => (m?.role === "user" || m?.role === "assistant")
    && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!valid.length || valid.at(-1).role !== "user") throw new Error("A user question is required.");
  const history = valid.slice(-MAX_MESSAGES);
  // Never start a Gemini conversation with a model answer.
  while (history[0]?.role === "assistant") history.shift();
  while (encoder.encode(JSON.stringify({ messages: history })).length > MAX_BODY_BYTES) {
    if (history.length > 1) {
      history.shift();
      while (history[0]?.role === "assistant") history.shift();
    } else {
      // JSON encoding can expand a 4000-character question (e.g. escaped control
      // characters); fit the last question safely rather than issuing a 413.
      const question = history[0];
      if (question.content.length <= 1) throw new Error("Question exceeds the Worker request limit.");
      question.content = question.content.slice(0, Math.floor(question.content.length * 0.8));
    }
  }
  return history;
}
