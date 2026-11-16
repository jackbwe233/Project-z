/* global Response, TextEncoder, crypto, URL, fetch, AbortSignal */
// Project Z Gemini gateway for Cloudflare Workers.
// Deploy this file as the Worker script; configure GEMINI_API_KEY and
// Z_ACCESS_TOKEN as encrypted Cloudflare Worker secrets, never here.
const ALLOWED_ORIGIN = "https://jackbwe233.github.io";
const MODEL = "gemini-3.5-flash-lite";
const MAX_BODY_BYTES = 16000;
const MAX_MESSAGES = 12;

function cors(origin) {
  return origin === ALLOWED_ORIGIN ? {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, X-Z-Access",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  } : {};
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) },
  });
}

async function matchesToken(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string" || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([actual, expected].map(
    token => crypto.subtle.digest("SHA-256", encoder.encode(token)),
  ));
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") {
      return origin === ALLOWED_ORIGIN
        ? new Response(null, { status: 204, headers: cors(origin) })
        : new Response(null, { status: 403 });
    }
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, service: "Project Z Brain" }, 200, origin);
    }
    if (path !== "/chat") return json({ error: "Not found" }, 404, origin);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, origin);
    if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403, origin);
    if (!env.GEMINI_API_KEY || !env.Z_ACCESS_TOKEN) return json({ error: "Worker secrets missing" }, 503, origin);
    if (!(await matchesToken(request.headers.get("X-Z-Access"), env.Z_ACCESS_TOKEN))) {
      return json({ error: "Not authorized" }, 401, origin);
    }
    if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
      return json({ error: "Expected JSON" }, 415, origin);
    }
    if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
      return json({ error: "Question too long" }, 413, origin);
    }
    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error("too big");
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid or oversized JSON" }, 400, origin);
    }
    const messages = body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES
      || messages.some(m => !["user", "assistant"].includes(m?.role)
        || typeof m?.content !== "string" || !m.content.trim() || m.content.length > 4000)
      || messages.at(-1).role !== "user") {
      return json({ error: "Supply 1–12 short chat messages ending with a user question" }, 400, origin);
    }
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const requestBody = {
      systemInstruction: { parts: [{ text: "You are Z, a helpful, clear, friendly male AI assistant. Be accurate, acknowledge uncertainty, and speak casually and concisely. Never invent actions or memories." }] },
      contents,
      generationConfig: { maxOutputTokens: 700 },
    };
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : 502;
        return json({
          error: status === 429 ? "Gemini rate limit reached; try later" : "Gemini request failed",
          upstreamStatus: upstream.status,
        }, status, origin);
      }
      const result = await upstream.json();
      const answer = (result.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("").trim();
      if (!answer) return json({ error: "Gemini returned no text" }, 502, origin);
      return json({ answer, model: MODEL }, 200, origin);
    } catch {
      return json({ error: "Gemini connection timed out or failed" }, 504, origin);
    }
  },
};
