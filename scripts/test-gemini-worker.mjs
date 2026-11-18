// Unauthenticated deployment smoke test; no keys or access tokens required.
// Run via: node scripts/test-gemini-worker.mjs
const endpoint = "https://project-z-brain.mcrkw49n9c.workers.dev";
const origin = "https://jackbwe233.github.io";
async function check(path, init, expected, description) {
  const r = await fetch(endpoint + path, { ...init, signal: AbortSignal.timeout(15000) });
  if (r.status !== expected) {
    const body = await r.text();
    throw new Error(description + ": expected HTTP " + expected + ", received " + r.status + " — " + body.slice(0, 200));
  }
  return r;
}
const health = await check("/health", { headers: { Origin: origin } }, 200, "Health");
const healthJSON = await health.json();
if (healthJSON.ok !== true) throw new Error("Health returned ok=false");
if (health.headers.get("access-control-allow-origin") !== origin) throw new Error("GET CORS origin missing");
const preflight = await check("/chat", {
  method: "OPTIONS",
  headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-z-access" },
}, 204, "CORS preflight");
if (preflight.headers.get("access-control-allow-origin") !== origin) throw new Error("OPTIONS CORS origin missing");
const unauthorized = await check("/chat", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json", "X-Z-Access": "intentionally-invalid-test-token" },
  body: JSON.stringify({ messages: [{ role: "user", content: "Hi Z" }] }),
}, 401, "Unauthorized requests must be rejected");
const payload = await unauthorized.json();
if (typeof payload.error !== "string") throw new Error("Unauthorized JSON error missing");
await check("/chat", { method: "OPTIONS", headers: { Origin: "https://example.com", "Access-Control-Request-Method": "POST" } }, 403, "Disallowed origin");
console.log("Gemini Worker smoke tests passed: health, CORS, authorization and origin protection.");
