/* Z mobile onboarding: never asks users to install on desktop or inside installed PWA. */
(() => {
  "use strict";
  const KEY = "project-z:install-guide-dismissed:v1";
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPod|iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const mobile = ios || android;
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const installed = () => window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  const dismissed = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
  let card = null, deferredInstall = null, previousFocus = null;
  function dismiss(remember) {
    if (remember) try { localStorage.setItem(KEY, "1"); } catch { /* Storage can be disabled. */ }
    card?.remove(); card = null;
    previousFocus?.focus?.(); previousFocus = null;
  }
  function element(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function addStep(list, number, text) {
    const li = element("li", "z-install-step");
    li.append(element("strong", number), document.createTextNode(text));
    list.append(li);
  }
  function show(force = false) {
    if (!mobile || installed() || (!force && dismissed()) || card) return;
    previousFocus = document.activeElement;
    const overlay = element("div", "z-install-guide");
    overlay.id = "z-install-guide";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "z-install-title");
    const backdrop = element("div", "z-install-backdrop");
    const sheet = element("div", "z-install-sheet");
    const head = element("div", "z-install-head");
    const zmark = element("span", "z-install-z", "Z");
    const titles = element("div", "z-install-titles");
    titles.append(element("span", "z-install-eyebrow", "PROJECT Z"));
    const title = element("h2", "", "Add Z to your Home Screen");
    title.id = "z-install-title";
    titles.append(title);
    const close = element("button", "z-install-close", "×");
    close.type = "button"; close.setAttribute("aria-label", "Close installation guide");
    head.append(zmark, titles, close);
    const intro = element("p", "z-install-description", "Open Z like an app with its own icon. No App Store download needed.");
    const list = element("ol", "z-install-steps");
    const note = element("p", "z-install-note");
    const actions = element("div", "z-install-actions");
    const ok = element("button", "z-install-ok", "Got it");
    const later = element("button", "z-install-later", "Maybe later");
    ok.type = "button"; later.type = "button";
    actions.append(ok, later);
    if (safari) {
      addStep(list, "1", "Tap Share in Safari (the square with the upward arrow).");
      addStep(list, "2", "Scroll down and tap Add to Home Screen.");
      addStep(list, "3", "Tap Add. Find the Z icon on your iPhone.");
      note.textContent = "If you do not see Add to Home Screen, scroll through Safari's sharing options.";
    } else if (ios) {
      addStep(list, "1", "Open this page in Safari on your iPhone.");
      addStep(list, "2", "Tap Share (the square with the upward arrow).");
      addStep(list, "3", "Choose Add to Home Screen, then Add.");
      note.textContent = "The menu in your current browser may look different.";
    } else {
      addStep(list, "1", "Open Z in Chrome on your Android phone.");
      addStep(list, "2", "Tap the three-dot menu (⋮).");
      addStep(list, "3", "Select Install app or Add to Home screen, then confirm.");
      note.textContent = "Menu names vary across Android browsers.";
      if (deferredInstall) ok.textContent = "Install Z";
    }
    sheet.append(head, intro, list, note, actions);
    overlay.append(backdrop, sheet);
    const hide = () => dismiss(true);
    close.addEventListener("click", hide);
    later.addEventListener("click", hide);
    ok.addEventListener("click", async () => {
      const prompt = android && deferredInstall;
      if (!prompt) { hide(); return; }
      deferredInstall = null;
      dismiss(false);
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") dismiss(true);
      } catch { /* The menu instructions remain available from Plugins. */ }
    });
    backdrop.addEventListener("click", hide);
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); hide(); }
      if (event.key !== "Tab") return;
      const controls = [close, ok, later];
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault(); controls[2].focus();
      } else if (!event.shiftKey && document.activeElement === controls[2]) {
        event.preventDefault(); controls[0].focus();
      }
    });
    card = overlay; document.body.append(overlay);
    close.focus({ preventScroll: true });
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); deferredInstall = event;
  });
  window.addEventListener("appinstalled", () => dismiss(true));
  window.ZInstallGuide = { show: () => show(true) };
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-z-install-guide]");
    if (!button) return;
    event.preventDefault(); show(true);
  });
  const style = document.createElement("style");
  style.textContent = [
    ".z-install-guide{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:end center;padding:14px 12px calc(16px + env(safe-area-inset-bottom));font:15px/1.45 system-ui,-apple-system,sans-serif;color:#edf5ff}",
    ".z-install-backdrop{position:absolute;inset:0;background:#040913d9;backdrop-filter:blur(7px)}",
    ".z-install-sheet{position:relative;width:min(100%,440px);max-height:calc(100dvh - 36px - env(safe-area-inset-bottom));overflow:auto;border:1px solid #4d688c;border-radius:24px;background:linear-gradient(145deg,#1c2e49,#0f192b);padding:21px 20px 18px;box-shadow:0 18px 70px #000b}",
    ".z-install-head{display:flex;gap:12px;align-items:center}.z-install-titles{flex:1;min-width:0}",
    ".z-install-z{flex:none;display:grid;place-items:center;width:54px;height:54px;border:1px solid #7798c8;border-radius:15px;background:linear-gradient(140deg,#b5d2ff,#667fa4);color:#0b1526;font:italic 850 35px system-ui}",
    ".z-install-eyebrow{color:#a6c7f8;font:750 10px system-ui;letter-spacing:.16em}",
    "#z-install-title{font:750 19px/1.2 system-ui;letter-spacing:-.03em;margin:3px 0;color:#f0f6ff}",
    ".z-install-close{flex:none;border:1px solid #486386;background:#203753;color:#dceafb;border-radius:11px;width:39px;height:39px;font:28px system-ui;cursor:pointer}",
    ".z-install-description{color:#b2c4db;margin:14px 0 10px}.z-install-steps{padding:0;list-style:none;margin:10px 0}",
    ".z-install-step{background:#ffffff0b;border:1px solid #5467824a;border-radius:12px;padding:10px 12px;margin:7px 0}",
    ".z-install-step strong{display:inline-grid;place-items:center;min-width:23px;margin-right:8px;color:#c9dfff}",
    ".z-install-note{font-size:12px;color:#9fb4d3;margin:12px 0 18px}",
    ".z-install-actions{display:flex;gap:9px}.z-install-actions button{flex:1;min-height:45px;border-radius:12px;border:1px solid #5c7697;padding:10px;font:700 14px system-ui;cursor:pointer}",
    ".z-install-ok{background:#c0d8ff;color:#0c192c}.z-install-later{background:#263e5d;color:#edf5ff}",
    ".z-install-guide button:focus-visible{outline:3px solid #fff;outline-offset:2px}",
    "@media(min-width:650px){.z-install-guide{place-items:center}}",
    "@media(prefers-reduced-motion:no-preference){.z-install-sheet{animation:z-install-enter .25s ease-out both}@keyframes z-install-enter{from{transform:translateY(12px);opacity:.3}to{transform:translateY(0);opacity:1}}}",
  ].join("\n");
  document.head.append(style);
  const start = () => {
    if (mobile && !installed() && !dismissed()) setTimeout(() => show(), 1600);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
