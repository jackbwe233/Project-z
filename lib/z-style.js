/**
 * Z's privacy-first conversation style learning.
 * Opt-in. Stores only bounded numeric style signals, not message text.
 * Never infers demographics, identity, health, politics or psychological traits.
 */
export const STYLE_KEY = "project-z:communication-style:v1";
const TONES = ["auto", "casual", "neutral", "professional"];
const LENGTHS = ["auto", "short", "balanced", "detailed"];
const EXPLANATIONS = ["auto", "simple", "step-by-step", "thorough"];
const MAX_SIGNAL = 60;
export function emptyStyle() {
  return {
    version: 1,
    learnEnabled: false,
    tone: "auto",
    length: "auto",
    explanation: "auto",
    signals: { casual: 0, professional: 0, short: 0, detailed: 0, steps: 0, simple: 0 },
    samples: 0,
  };
}
const bounded = value => Math.max(0, Math.min(MAX_SIGNAL, Math.floor(Number(value) || 0)));
export function normalizeStyle(raw) {
  const clean = emptyStyle();
  if (!raw || typeof raw !== "object") return clean;
  return {
    ...clean,
    learnEnabled: raw.learnEnabled === true,
    tone: TONES.includes(raw.tone) ? raw.tone : "auto",
    length: LENGTHS.includes(raw.length) ? raw.length : "auto",
    explanation: EXPLANATIONS.includes(raw.explanation) ? raw.explanation : "auto",
    signals: Object.fromEntries(Object.keys(clean.signals).map(k => [k, bounded(raw.signals?.[k])])),
    samples: Math.max(0, Math.min(200, Math.floor(Number(raw.samples) || 0))),
  };
}
export function readStyle(storage) {
  try { return normalizeStyle(JSON.parse(storage?.getItem(STYLE_KEY) || "null")); }
  catch { return emptyStyle(); }
}
export function writeStyle(storage, style) {
  try { storage?.setItem(STYLE_KEY, JSON.stringify(normalizeStyle(style))); return Boolean(storage); }
  catch { return false; }
}
export function updateStyle(style, patch) {
  const current = normalizeStyle(style);
  return normalizeStyle({
    ...current,
    learnEnabled: patch?.learnEnabled === undefined ? current.learnEnabled : patch.learnEnabled,
    tone: patch?.tone ?? current.tone,
    length: patch?.length ?? current.length,
    explanation: patch?.explanation ?? current.explanation,
  });
}
/** Derive only coarse writing-style signals from messages. Do not retain text. */
export function learnCommunicationStyle(style, message) {
  const current = normalizeStyle(style);
  if (!current.learnEnabled) return current;
  const text = String(message || "").trim();
  if (text.length < 6 || text.length > 6000) return current;
  // Ignore messages containing likely secrets or sensitive details. Style is not worth storing them.
  if (/\b(password|passcode|secret key|api key|access token|credit card|ssn|bank account|my address|diagnos(?:is|ed)|medication|sexuality|my religion|my ethnicity|my race)\b/i.test(text)) return current;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return current;
  const casual = /\b(?:lol|lmao|idk|tbh|btw|wanna|gonna|nah|yep|bro|yo|js|ur|rn|fr)\b/i.test(text);
  const professional = /\b(?:please provide|could you explain|would you mind|i would appreciate|in summary|sincerely|regarding)\b/i.test(text);
  const steps = /\b(?:step.by.step|walk me through|one step at a time|show (?:me )?the steps|first,? then)\b/i.test(text);
  const simple = /\b(?:simpl(?:e|er|ify)|explain like|easy to understand|less technical|in plain english)\b/i.test(text);
  const short = /\b(?:short(?:er)?|brief|concise|quick|just the answer|straight to the point)\b/i.test(text) || text.length <= 75;
  const detailed = /\b(?:detail(?:ed)?|in.depth|explain (?:it )?fully|comprehensive|thorough)\b/i.test(text) || text.length >= 380;
  const next = { ...current, signals: { ...current.signals }, samples: Math.min(200, current.samples + 1) };
  for (const [key, match] of Object.entries({ casual, professional, steps, simple, short, detailed })) {
    if (match) next.signals[key] = Math.min(MAX_SIGNAL, next.signals[key] + 1);
  }
  // Slow decay prevents an early style from becoming permanent.
  if (next.samples % 20 === 0) {
    for (const key of Object.keys(next.signals)) next.signals[key] = Math.floor(next.signals[key] * 0.85);
  }
  return next;
}
export function effectiveStyle(style) {
  const s = normalizeStyle(style);
  const enough = s.learnEnabled && s.samples >= 4;
  const tone = s.tone !== "auto" ? s.tone : !enough ? "neutral"
    : s.signals.casual >= Math.max(3, s.signals.professional + 2) ? "casual"
    : s.signals.professional >= Math.max(3, s.signals.casual + 2) ? "professional" : "neutral";
  const length = s.length !== "auto" ? s.length : !enough ? "balanced"
    : s.signals.short >= Math.max(3, s.signals.detailed + 2) ? "short"
    : s.signals.detailed >= Math.max(3, s.signals.short + 2) ? "detailed" : "balanced";
  const explanation = s.explanation !== "auto" ? s.explanation : !enough ? "simple"
    : s.signals.steps >= 3 ? "step-by-step" : "simple";
  return { tone, length, explanation, samples: s.samples, learning: s.learnEnabled };
}
export function buildStyleContext(style) {
  const s = normalizeStyle(style);
  const effective = effectiveStyle(s);
  if (!s.learnEnabled && s.tone === "auto" && s.length === "auto" && s.explanation === "auto") return "";
  const tone = {
    casual: "Use natural, relaxed wording without forced slang.",
    neutral: "Use a clear, friendly, neutral tone.",
    professional: "Use polished, professional wording.",
  }[effective.tone];
  const length = {
    short: "Prefer brief, direct answers.",
    balanced: "Keep answers focused with enough explanation to be useful.",
    detailed: "Give more complete, detailed answers.",
  }[effective.length];
  const explanation = {
    simple: "Explain concepts plainly, without unnecessary jargon.",
    "step-by-step": "For instructions, explain one clear step at a time.",
    thorough: "When teaching, include reasoning and illustrative examples.",
  }[effective.explanation];
  return [
    "Conversation style preferences, chosen by the user or learned with opt-in:",
    tone, length, explanation,
    "These affect response style only. Do not imitate typos, make personality diagnoses, infer sensitive traits, or pretend to know facts not shared by the user.",
  ].join("\n");
}
