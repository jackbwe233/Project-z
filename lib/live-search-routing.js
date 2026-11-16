/** Detect clear live-information requests without sending saved memories to search. */
export function liveSearchQuery(messages = []) {
  const latest = [...messages].reverse().find(message => message.role === "user");
  const text = String(latest?.content || "").trim();
  if (!text) return "";
  const explicit = /^\/(?:search|live)\s+/i.test(text);
  const current = /\b(today|tonight|tomorrow|right now|currently|latest|recent|live|current)\b/i.test(text);
  const subject = /\b(weather|forecast|temperature|news|headlines|score|scores|stock|stocks|price|prices|traffic|election|standings)\b/i.test(text);
  const weatherQuestion = /\b(weather|forecast)\b/i.test(text)
    && !/\b(what is weather|what is a forecast|how .*work|define|meaning)\b/i.test(text);
  if (!explicit && !(current && subject) && !weatherQuestion) return "";
  return text.replace(/^\/(?:search|live)\s+/i, "").slice(0, 256);
}
