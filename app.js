Warning: truncated output (original token count: 31098)
Total output lines: 3577

import { withMemory } from "./lib/project-z.js";
import { initProjectZ } from "./lib/project-z-ui.js";
import {
  PREFS_KEY,
  THEME_KEY,
  ASSISTANT_LABEL,
  APP_VERSION,
  DEFAULT_MODEL_ID,
  DEFAULT_SYSTEM_PROMPT,
  BROWSER_LABELS,
} from "./lib/constants.js";
import {
  MODELS,
  activeModelDef as pickActiveModel,
  loadedModelDef as pickLoadedModel,
  sessionModelId,
  resolveModelIdForSession,
  modelLabel,
  modelSupportsThinking as modelHasThinking,
  isValidModelId,
} from "./lib/models.js";
import {
  esc,
  formatTime,
  thinkLabel,
  statsLine,
  sessionDownloadFilename,
} from "./lib/format.js";
import {
  applyAgentPolicy,
  buildMessages as buildMessagesForModel,
  buildAgentMessages,
  exportSessionOpenAI,
  exportSessionTrace,
  splitModelThinking,
} from "./lib/messages.js";
import { runAgentTurn } from "./lib/agent-loop.js";
import { getRuntimeAdapter } from "./lib/runtime-registry.js";
import { fitMessagesToContext, effectiveMaxNewTokens } from "./lib/context-window.js";
import {
  activeToolNames,
  createActiveTools,
  localFileReferencesAvailable,
  resolveToolAvailability,
} from "./lib/tool-registry.js";
import { agentMessagesToSteps } from "./lib/agent-ui.js";
import { looksLikeToolCallSyntax, stripToolCallSyntax, hasUnclosedThoughtChannel } from "./lib/tool-parser.js";
import { sanitizeExternalText } from "./lib/sanitize.js";
import { defaultSearchProvider } from "./lib/exa-search.js";
import { GenerationTracker } from "./lib/generation-tracker.js";
import { isPrefillChunk } from "./lib/gemma-generate.js";
import { formatActivePhaseStatus, formatThinkPanelLabel } from "./lib/phase-status.js";
import { configureMarkdownParser, renderMarkdownHtml } from "./lib/markdown-render.js";
import { isPinnedToBottom, scrollToBottomIfPinned } from "./lib/chat-scroll.js";
import { focusComposerInput } from "./lib/input-focus.js";
import {
  sessionDateGroup,
  filterSessions,
  upsertSessionInList,
  createSessionRecord,
  normalizeSessionRecord,
  firstMessageTitle,
  normalizeSessionTitle,
  SESSION_GROUP_ORDER,
  canSendToModel,
  canRegenerateFromUserMessage,
  lastUserMessageContent,
  truncateSessionMessagesAfterIndex,
  updateUserMessageAtIndex,
  normalizeToolPreferences,
} from "./lib/sessions.js";
import { generationErrorFallback } from "./lib/generation.js";
import { detectBrowser } from "./lib/browser.js";
import { computeLoadProgress } from "./lib/progress.js";
import {
  loadButtonLabel,
  formatAllModelsCacheStatus,
  isCacheCapable,
  clampMaxNewTokens,
} from "./lib/ui-state.js";
import { buildPrefsPayload, parsePrefsJson } from "./lib/prefs.js";
import { openSessionDB, dbGetAll, dbPut, dbDelete } from "./lib/session-storage.js";
import {
  dbCleanupOrphanAttachments,
  dbDeleteAttachment,
  dbGetSessionAttachments,
  dbPutAttachment,
} from "./lib/attachment-storage.js";
import {
  acceptedFileInputValue,
  formatBytes,
  ingestAttachmentFile,
  workspaceUsage,
} from "./lib/attachments.js";
import {
  findAtFileQuery,
  fuzzyMatchAttachments,
  reconcileSelectedFileRefs,
  replaceAtFileQuery,
  resolveDraftFileRefs,
} from "./lib/file-reference.js";
import { createDebouncer } from "./lib/debounce.js";
import {
  createCacheEnv,
  getAllModelsCacheStats,
  checkModelCached as isModelCached,
  repairBrokenModelCache,
  repairPoisonedGgufCache,
  deleteModelCacheDatabases,
  deleteAllModelCaches,
} from "./lib/cache.js";

"use strict";

import("https://esm.sh/marked@17")
  .then((m) => {
    m.marked.use({ gfm: true, breaks: true });
    configureMarkdownParser(m.marked);
  })
  .catch(() => {});

function activeModelDef() {
  return pickActiveModel(state.selectedModelId);
}

function loadedModelDef() {
  return pickLoadedModel(state.loadedModelId);
}

function modelSupportsThinking() {
  return modelHasThinking(state.loadedModelId, state.selectedModelId);
}

function shouldShowThinkingPanel(displayThinking, { streamPhase = "generating" } = {}) {
  if (!modelSupportsThinking()) return false;
  if (displayThinking) return true;
  return streamPhase === "searching"
    || streamPhase === "prefill"
    || streamPhase === "generating";
}

function splitRawThinking(raw) {
  const def = loadedModelDef() || activeModelDef();
  return splitModelThinking(raw, def?.runtime);
}

function webSearchEffective() {
  return toolAvailability().some(tool => tool.id === "web_search" && tool.active);
}

function toolAvailability({
  attachments = state.attachments,
  preferences = state.toolPreferences,
  runtimeReady = !!state.model,
  grammarMode = state.grammarMode,
  modelDef = loadedModelDef() || activeModelDef(),
} = {}) {
  return resolveToolAvailability({
    attachments,
    preferences,
    modelSupportsTools: !!modelDef?.supportsTools,
    grammarMode,
    runtimeReady,
  });
}

function localReferencesEnabled() {
  return localFileReferencesAvailable(toolAvailability({ runtimeReady: false }));
}

function agentModeEffective() {
  return toolAvailability().some(tool => tool.active);
}

function grammarConfig() {
  return {
    grammarMode: state.grammarMode,
    jsonSchema: $("grammar-json-schema")?.value || "",
    ebnf: $("grammar-custom")?.value || "",
  };
}

function buildMessages(session) {
  return buildMessagesForModel(withMemory(session, projectZ.memory()), grammarConfig());
}

function cacheEnv() {
  return createCacheEnv({ fileOrigin: state.fileOrigin });
}

async function checkModelCached(def = activeModelDef()) {
  return isModelCached(def, cacheEnv());
}

async function getAllModelsCacheStatsLocal() {
  return getAllModelsCacheStats(cacheEnv());
}

async function deleteAllModelCacheDatabases() {
  return deleteAllModelCaches(cacheEnv());
}

/* ── IndexedDB ── */

function disableSessionPersistence(err) {
  if (state.db?.close) {
    try { state.db.close(); } catch { /* ignore */ }
  }
  state.db = null;
  if (state.storageAvailable) {
    state.storageAvailable = false;
    console.warn("Session persistence unavailable; continuing in memory.", err);
    if (!state.storageWarningShown) {
      state.storageWarningShown = true;
      toast("Session storage is unavailable. This chat will remain only in memory.");
    }
  }
}

async function patchSessionFields(session, fields) {
  Object.assign(session, fields);
  const idx = state.sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) state.sessions[idx] = session;
  if (!state.db) return;
  try {
    await dbPut(state.db, session);
  } catch (err) {
    disableSessionPersistence(err);
  }
}

const ICONS = {
  webllm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.75 8 7.25 12l2.5 4"/><path d="M14.25 8 16.75 12l-2.5 4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 5.75v1.5M12 16.75v1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0 1 12 0v1"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/><path d="M3 12a9 9 0 1 1 2.64 6.36"/><path d="M3 21v-6h6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v10"/><path d="m8 11 4 4 4-4"/><path d="M5 21h14"/></svg>',
  brain: '<svg viewBox="0 0 24 24"><path d="M9 4a3 3 0 0 0-3 3v1a2 2 0 0 0-2 2 2 2 0 0 0 0 4 2 2 0 0 0 2 2v1a3 3 0 0 0 3 3"/><path d="M15 4a3 3 0 0 1 3 3v1a2 2 0 0 1 2 2 2 2 0 0 1 0 4 2 2 0 0 1-2 2v1a3 3 0 0 1-3 3"/><path d="M9 7h6M9 17h6"/></svg>',
  wrench: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24"><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
};

function icon(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = ICONS[name] || "";
  return span;
}

function setIcon(el, name) {
  el.replaceChildren(icon(name));
}

const state = {
  model: null,
  loading: false,
  busy: false,
  abort: null,
  webgpuOk: false,
  webgpuBrowser: "other",
  webgpuChecking: true,
  storageChecking: true,
  // file:// is an opaque origin — IndexedDB unavailable — cache disabled intentionally.
  // Production is static GitHub Pages (https://) — no server. Local dev: python3 -m http.server 8080
  fileOrigin: typeof location !== "undefined" && location.protocol === "file:",
  progress: { target: 0, shown: 0, raf: 0, label: "" },
  sessions: [],
  activeSessionId: null,
  grammarMode: "off",
  maxNewTokens: 4096,
  db: null,
  storageAvailable: true,
  storageWarningShown: false,
  renamingSessionId: null,
  sessionSearch: "",
  okBannerTimer: null,
  modelCached: false,
  webgpuLabel: "",
  modelLoadSecs: null,
  selectedModelId: DEFAULT_MODEL_ID,
  loadedModelId: null,
  toolPreferences: normalizeToolPreferences(),
  attachments: [],
  attachmentsBySession: new Map(),
  pendingFileRefs: new Set(),
  runtimeTracesBySession: new Map(),
  fileAutocompleteIndex: 0,
  fileAutocompleteMatches: [],
};

const $ = id => document.getElementById(id);

const STEP_LABELS = {
  thinking: "Thinking",
  tool_call: "Tool call",
  tool_result: "Tool result",
  answer: ASSISTANT_LABEL,
};

function chatScrollEl() {
  return $("chat-scroll");
}

function scrollChatToBottom(force = false, pinned) {
  scrollToBottomIfPinned(chatScrollEl(), { force, pinned });
}

/* ── Toast ── */

function toast(message, { duration = 3000 } = {}) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${esc(message)}</span>`;
  $("toast-stack").appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/* ── IndexedDB ── */

async function openDB() {
  return openSessionDB();
}

function uid() {
  return crypto.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function activeSession() {
  return state.sessions.find(s => s.id === state.activeSessionId) || null;
}

function setActiveAttachments(attachments) {
  const sessionId = state.activeSessionId;
  state.attachments = attachments || [];
  if (sessionId) state.attachmentsBySession.set(sessionId, state.attachments);
}

async function loadAttachmentsForSession(sessionId) {
  if (!sessionId) {
    setActiveAttachments([]);
    return [];
  }
  if (state.attachmentsBySession.has(sessionId)) {
    const cached = state.attachmentsBySession.get(sessionId);
    if (state.activeSessionId === sessionId) setActiveAttachments(cached);
    return cached;
  }
  let attachments = [];
  if (state.db) {
    try {
      attachments = await dbGetSessionAttachments(state.db, sessionId);
    } catch (err) {
      disableSessionPersistence(err);
    }
  }
  state.attachmentsBySession.set(sessionId, attachments);
  if (state.activeSessionId === sessionId) setActiveAttachments(attachments);
  return attachments;
}

function isEmptyStateVisible() {
  const session = activeSession();
  return $("empty-state").style.display !== "none" && !session?.messages?.length;
}

async function persistSession(session) {
  session.updatedAt = Date.now();
  state.sessions = upsertSessionInList(state.sessions, session);
  savePrefs();
  renderSessionList();
  updateChatTitle();
  mountWebGpuBanner();
  updateEmptyLoader();
  if (!state.db) return;
  try {
    await dbPut(state.db, session);
  } catch (err) {
    disableSessionPersistence(err);
  }
}

function inheritedSessionSettings() {
  const modelId = isValidModelId(state.selectedModelId)
    ? state.selectedModelId
    : resolveModelIdForSession(activeSession(), DEFAULT_MODEL_ID);
  return {
    modelId,
    toolPreferences: {
      read: false,
      grep: false,
      web_search: state.toolPreferences.web_search === true,
    },
  };
}

async function createSession(title = "New chat") {
  if (state.busy || state.loading) {
    toast("Wait until the current operation finishes.");
    return null;
  }
  const inherited = inheritedSessionSettings();
  const session = createSessionRecord({
    id: uid(),
    title,
    modelId: inherited.modelId,
    toolPreferences: inherited.toolPreferences,
    models: MODELS,
  });
  state.activeSessionId = session.id;
  state.toolPreferences = { ...session.toolPreferences };
  state.pendingFileRefs.clear();
  setActiveAttachments([]);
  await persistSession(session);
  return session;
}

async function deleteSession(id) {
  if (state.busy || state.loading) {
    toast("Wait until the current operation finishes.");
    return false;
  }
  if (state.db) {
    try {
      await dbDelete(state.db, id);
    } catch (err) {
      disableSessionPersistence(err);
    }
  }
  const deletingActive = state.activeSessionId === id;
  state.sessions = state.sessions.filter(s => s.id !== id);
  state.attachmentsBySession.delete(id);
  state.runtimeTracesBySession.delete(id);
  if (deletingActive) {
    state.activeSessionId = state.sessions[0]?.id || null;
    if (!state.activeSessionId) await createSession();
    else await loadAttachmentsForSession(state.activeSessionId);
    state.pendingFileRefs.clear();
  }
  syncUIFromSession();
  savePrefs();
  renderSessionList();
  renderFilesWorkspace();
  renderPendingFileRefs();
  renderChat();
  mountWebGpuBanner();
  return true;
}

async function renameSession(id, newTitle) {
  if (state.busy || state.loading) {
    toast("Wait until the current operation finishes.");
    return false;
  }
  const session = state.sessions.find(s => s.id === id);
  if (!session) return false;
  session.title = normalizeSessionTitle(newTitle);
  await persistSession(session);
  return true;
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(buildPrefsPayload({
      activeSessionId: state.activeSessionId,
      selectedModelId: state.selectedModelId,
      grammarMode: state.grammarMode,
      maxNewTokens: state.maxNewTokens,
      grammarJsonSchema: $("grammar-json-schema")?.value || "",
      grammarEbnf: $("grammar-custom")?.value || "",
      sessionSearch: state.sessionSearch,
      sidebarOpen: {
        conversations: $("conversations-block")?.open,
        files: $("files-block")?.open,
        system: $("system-block")?.open,
        model: $("model-block")?.open,
        tools: $("tools-block")?.open,
        settings: $("settings-block")?.open,
        storage: $("storage-block")?.open,
      },
      webSearchPreferred: state.toolPreferences.web_search,
    })));
  } catch { /* ignore */ }
}

function loadPrefs() {
  try {
    const p = parsePrefsJson(localStorage.getItem(PREFS_KEY));
    if (p.activeSessionId) state.activeSessionId = p.activeSessionId;
    if (p.grammarMode) state.grammarMode = p.grammarMode;
    if (MODELS[p.selectedModelId]) state.selectedModelId = p.selectedModelId;
    if (typeof p.maxNewTokens === "number") state.maxNewTokens = clampMaxNewTokens(p.maxNewTokens);
    state.maxNewTokens = effectiveMaxNewTokens(
      state.maxNewTokens,
      activeModelDef(),
    );
    if (p.grammarJsonSchema) $("grammar-json-schema").value = p.grammarJsonSchema;
    if (p.grammarEbnf) $("grammar-custom").value = p.grammarEbnf;
    if (p.sessionSearch) {
      state.sessionSearch = p.sessionSearch;
      $("session-search").value = p.sessionSearch;
    }
    state.toolPreferences.web_search = p.webSearchPreferred === true;
    if (p.sidebarOpen) {
      if (typeof p.sidebarOpen.conversations === "boolean") $("conversations-block").open = p.sidebarOpen.conversations;
      if (typeof p.sidebarOpen.files === "boolean") $("files-block").open = p.sidebarOpen.files;
      if (typeof p.sidebarOpen.system === "boolean") $("system-block").open = p.sidebarOpen.system;
      if (typeof p.sidebarOpen.model === "boolean") $("model-block").open = p.sidebarOpen.model;
      if (typeof p.sidebarOpen.tools === "boolean") $("tools-block").open = p.sidebarOpen.tools;
      if (typeof p.sidebarOpen.settings === "boolean") $("settings-block").open = p.sidebarOpen.settings;
      if (typeof p.sidebarOpen.storage === "boolean") $("storage-block").open = p.sidebarOpen.storage;
    }
  } catch {
    // Private browsing and enterprise policies can deny localStorage reads.
  }
}

/* ── Theme ── */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setIcon($("theme-icon"), theme === "dark" ? "sun" : "moon");
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  applyTheme(saved === "dark" || saved === "light"
    ? saved
    : "light");
}

/* ── Banner mounting (P0-4) ── */

function mountWebGpuBanner() {
  const banner = $("webgpu-banner");
  if (!banner.classList.contains("show")) return;
  const inline = isEmptyStateVisible();
  const mount = inline ? $("empty-banner-mount") : $("banner-top-mount");
  mount.appendChild(banner);
  banner.classList.toggle("inline", inline);
}

/* ── WebGPU ── */

function showWebGpuBanner(html, level = "error") {
  if (state.okBannerTimer) { clearTimeout(state.okBannerTimer); state.okBannerTimer = null; }
  const banner = $("webgpu-banner");
  banner.classList.add("show");
  banner.dataset.level = level;
  banner.innerHTML = html;
  mountWebGpuBanner();
  if (level === "ok") {
    state.okBannerTimer = setTimeout(hideWebGpuBanner, 5000);
  }
}

function hideWebGpuBanner() {
  if (state.okBannerTimer) { clearTimeout(state.okBannerTimer); state.okBannerTimer = null; }
  const banner = $("webgpu-banner");
  banner.classList.remove("show", "inline");
  delete banner.dataset.level;
  banner.innerHTML = "";
}

async function probeWebGPU() {
  state.webgpuChecking = true;
  state.webgpuBrowser = detectBrowser(navigator.userAgent);
  setModelStatus("loading", "Checking WebGPU…");
  updateComposerState();

  const browserLabel = BROWSER_LABELS[state.webgpuBrowser] || "this browser";

  if (!navigator.gpu) {
    state.webgpuOk = false;
    const extra = state.webgpuBrowser === "firefox"
      ? " Firefox exposes WebGPU only behind <code>dom.webgpu.enabled</code> in <code>about:config</code>."
      : " Use Chrome 113+, Edge 113+, or Safari 18+.";
    showWebGpuBanner(`<strong>WebGPU API not found.</strong> ${browserLabel} does not expose WebGPU.${extra}`, "error");
    state.webgpuChecking = false;
    setModelStatus("error", "WebGPU unavailable");
    updateComposerState();
    return;
  }

  if (state.webgpuBrowser === "firefox") {
    state.webgpuOk = false;
    showWebGpuBanner("<strong>Firefox is not supported.</strong> This WebGPU runtime is known to fail in Firefox. Use Chrome, Edge, or Safari 18+.", "warn");
    state.webgpuChecking = false;
    setModelStatus("error", "Use Chrome / Safari");
    updateComposerState();
    return;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      state.webgpuOk = false;
      showWebGpuBanner(`<strong>No WebGPU adapter found.</strong> ${browserLabel} reported WebGPU but no compatible GPU is available.`, "error");
      state.webgpuChecking = false;
      setModelStatus("error", "No GPU adapter");
      updateComposerState();
      return;
    }

    let adapterLabel = "";
    try {
      const info = adapter.info;
      adapterLabel = info?.description || info?.device || "";
    } catch { /* ignore */ }

    state.webgpuOk = true;
    hideWebGpuBanner();

    if (state.webgpuBrowser === "safari") {
      showWebGpuBanner(`<strong>WebGPU ready on Safari.</strong>${adapterLabel ? ` GPU: ${esc(adapterLabel)}.` : ""} Safari 18+ is supported.`, "ok");
    } else if (state.webgpuBrowser === "other") {
      showWebGpuBanner(`<strong>WebGPU detected.</strong>${adapterLabel ? ` GPU: ${esc(adapterLabel)}.` : ""} Chrome, Edge, and Safari work best.`, "warn");
    }

    state.webgpuChecking = false;
    state.webgpuLabel = adapterLabel ? `WebGPU · ${adapterLabel}` : `WebGPU · ${browserLabel}`;
    setModelStatus("", state.webgpuLabel);
  } catch (err) {
    state.webgpuOk = false;
    showWebGpuBanner(`<strong>WebGPU check failed.</strong> ${esc(err?.message || err)}`, "error");
    state.webgpuChecking = false;
    setModelStatus("error", "WebGPU check failed");
  }
  updateComposerState();
}

/* ── Model loading (P0-4) ── */

function updateProgressUI(pct, label) {
  const w = (pct * 100).toFixed(1) + "%";
  $("load-bar").style.width = w;
  $("loader-bar-fill").style.width = w;
  if (label) {
    $("loader-status").textContent = label;
    state.progress.label = label;
  }
}

function setProgressTarget(v) {
  if (!Number.isFinite(v)) return;
  state.progress.target = Math.min(1, Math.max(0, Math.max(v, state.progress.target)));
  if (!state.progress.raf) state.progress.raf = requestAnimationFrame(stepBar);
}

function stepBar() {
  const p = state.progress;
  p.shown += Math.abs(p.target - p.shown) < 0.0015 ? (p.target - p.shown) : (p.target - p.shown) * 0.3;
  updateProgressUI(p.shown, p.label);
  p.raf = p.shown < p.target ? requestAnimationFrame(stepBar) : 0;
}

function setProgressImmediate(v, label) {
  if (state.progress.raf) { cancelAnimationFrame(state.progress.raf); state.progress.raf = 0; }
  state.progress.target = state.progress.shown = Math.min(1, Math.max(0, v));
  updateProgressUI(state.progress.shown, label);
}

/* ── Model cache (IndexedDB + Cache Storage via runtime) ── */

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}

async function repairBrokenModelCacheLocal() {
  const env = cacheEnv();
  const repaired = await Promise.all(Object.values(MODELS).map(def => repairBrokenModelCache(
    def,
    env,
    modelDef => deleteModelCacheDatabases(modelDef, env).catch(() => {}),
  )));
  if (repaired.some(Boolean)) {
    console.warn("Removed incomplete model cache database (missing object stores).");
  }
}

async function clearModelCache() {
  if (state.loading || state.busy) {
    toast("Wait until the model finishes loading.");
    return false;
  }
  const hadLoadedModel = !!state.model;
  if (hadLoadedModel) await unloadModel();
  try {
    await deleteAllModelCacheDatabases();
  } catch (err) {
    toast(err?.message || "Could not clear model cache");
    return false;
  }
  state.modelCached = await checkModelCached(activeModelDef());
  await refreshStorageUI();
  toast("All model caches cleared.");
  if (hadLoadedModel) {
    toast("Model unloaded. Load again to re-download weights.");
  }
  return true;
}

function updateStorageButtons() {
  const clearBtn = $("clear-model-cache-btn");
  if (!clearBtn) return;
  const busy = state.loading || state.busy;
  const cacheCapable = isCacheCapable({
    fileOrigin: state.fileOrigin,
    caches: globalThis.caches,
    indexedDB: globalThis.indexedDB,
    models: MODELS,
  });
  clearBtn.disabled = !cacheCapable || busy;
  clearBtn.title = state.fileOrigin
    ? "Caching unavailable on file://"
    : (!cacheCapable ? "Caching not supported in this browser context" : "Clear cached weights for all models");
}

function updateEmptyCacheHint() {
  const hint = $("empty-cache-hint");
  if (!hint) return;
  const def = activeModelDef();
  if (state.fileOrigin) {
    hint.textContent = "";
    return;
  }
  if (state.modelCached) {
    hint.textContent = `${def.name} cached locally · loads in seconds.`;
  } else {
    hint.textContent = `First load downloads ${def.downloadHint} (one-time).`;
  }
}

function resetLoadedModel() {
  if (!state.model || typeof state.model.reset !== "function") return;
  try { state.model.reset(); } catch { /* ignore */ }
}

async function unloadModel() {
  if (state.busy || state.loading) return false;
  if (!state.model) {
    state.loadedModelId = null;
    return true;
  }
  try {
    if (typeof state.model.reset === "function") await state.model.reset();
    if (typeof state.model.dispose === "function") await state.model.dispose();
  } catch { /* ignore */ }
  state.model = null;
  state.loadedModelId = null;
  state.modelLoadSecs = null;
  restoreIdleStatus();
  updateComposerState();
  renderModelPicker();
  return true;
}

function renderModelPicker() {
  const picker = $("model-picker");
  if (!picker) return;
  const busy = state.loading || state.busy;
  picker.innerHTML = Object.values(MODELS).map(def => {
    const active = def.id === state.selectedModelId;
    const loaded = state.loadedModelId === def.id && !!state.model;
    return `
      <label class="model-option${active ? " active" : ""}${busy ? " disabled" : ""}">
        <input type="radio" name="model-id" value="${esc(def.id)}"${active ? " checked" : ""}${busy ? " disabled" : ""}>
        <span class="model-option-name">${esc(def.name)}</span>
        <span class="model-option-meta">${esc(def.subtitle)}</span>
        ${loaded ? '<span class="model-option-badge">Loaded</span>' : ""}
      </label>`;
  }).join("");
}

async function applyModelSelection(modelId, { silent = false, persistToSession = true } = {}) {
  if (!MODELS[modelId]) modelId = DEFAULT_MODEL_ID;
  const needsUnload = state.model && state.loadedModelId && state.loadedModelId !== modelId;
  if (modelId === state.selectedModelId && !needsUnload) {
    if (persistToSession) {
      const session = activeSession();
      if (session && session.modelId !== modelId) {
        await patchSessionFields(session, { modelId });
        renderSessionList();
      }
    }
    renderModelPicker();
    return;
  }
  if (state.busy || state.loading) {
    if (!silent) {
      toast("Can't switch models while loading or generating.");
      renderModelPicker();
    }
    return;
  }
  if (state.model && state.loadedModelId && state.loadedModelId !== modelId) {
    await unloadModel();
    if (!silent) toast(`Switched to ${MODELS[modelId].name}. Load the model when ready.`);
  }
  state.selectedModelId = modelId;
  const modelDef = MODELS[modelId];
  const cappedMaxNewTokens = effectiveMaxNewTokens(
    state.maxNewTokens,
    modelDef,
  );
  if (cappedMaxNewTokens !== state.maxNewTokens) {
    state.maxNewTokens = cappedMaxNewTokens;
    if ($("max-tokens")) $("max-tokens").value = cappedMaxNewTokens;
  }
  if (persistToSession) {
    const session = activeSession();
    if (session && session.modelId !== modelId) {
      await patchSessionFields(session, { modelId });
      renderSessionList();
    }
  }
  savePrefs();
  renderModelPicker();
  updateWebSearchUI();
  updateLocalFileToolsUI();
  await refreshStorageUI();
  updateEmptyCacheHint();
}

async function selectModel(modelId) {
  await applyModelSelection(modelId, { silent: false, persistToSession: true });
}

function syncModelFromSession(session = activeSession()) {
  if (!session) return;
  state.selectedModelId = resolveModelIdForSession(session, state.selectedModelId);
  renderModelPicker();
}

async function refreshStorageUI() {
  const def = activeModelDef();
  state.modelCached = await checkModelCached(def);
  const statusText = $("storage-status-text");
  if (statusText) {
    if (state.fileOrigin) {
      statusText.hidden = true;
    } else {
      statusText.hidden = false;
      const cacheOk = isCacheCapable({
        fileOrigin: state.fileOrigin,
        caches: globalThis.caches,
        indexedDB: globalThis.indexedDB,
        models: MODELS,
      });
      if (!cacheOk) {
        statusText.textContent = "Caching not available";
      } else {
        const stats = await getAllModelsCacheStatsLocal();
        statusText.textContent = formatAllModelsCacheStatus(stats);
      }
    }
  }
  updateStorageButtons();
  updateEmptyCacheHint();
  updateComposerState();
}

function updateStorageUIAfterLoad(def) {
  const statusText = $("storage-status-text");
  if (statusText && !state.fileOrigin) {
    statusText.hidden = false;
    statusText.textContent = state.modelCached
      ? `Cached for offline use · ${def.name}`
      : "Offline cache not detected";
  }
  updateStorageButtons();
  updateEmptyCacheHint();
  updateComposerState();
}

function restoreIdleStatus() {
  if (state.busy || state.loading) return;
  if (state.model && state.webgpuLabel) setModelStatus("ready", state.webgpuLabel);
  else if (state.webgpuLabel) setModelStatus("", state.webgpuLabel);
  else if (!state.webgpuOk) setModelStatus("error", "WebGPU unavailable");
  else setModelStatus("", "Not loaded");
}

function onLoadProgress(event) {
  const { target, label } = computeLoadProgress(event, activeModelDef());
  if (target != null) setProgressTarget(target);
  state.progress.label = label;
  setModelStatus("loading", label);
}

function setModelStatus(kind, text) {
  const full = text || "Not loaded";
  $("model-status").className = "status-chip" + (kind ? ` ${kind}` : "");
  $("model-status").title = full;
  $("model-status-text").textContent = full;
  if (isEmptyStateVisible() && state.loading && $("empty-loader-progress").hidden === false) {
    $("loader-status").textContent = full;
  }
}

function updateEmptyLoader() {
  const empty = isEmptyStateVisible();
  const showHero = empty && !state.model;
  $("empty-loader").style.display = showHero ? "" : "none";
  if (!showHero) return;

  if (state.loading) {
    $("empty-loader-idle").hidden = true;
    $("empty-loader-progress").hidden = false;
  } else {
    $("empty-loader-idle").hidden = false;
    $("empty-loader-progress").hidden = true;
  }
  mountWebGpuBanner();
}

function bindAttachmentDeleteConfirm(button, row, attachment) {
  button.addEventListener("click", event => {
    event.stopPropagation();
    const actions = row.querySelector(".file-workspace-actions");
    row.classList.add("confirming");
    actions.innerHTML = `
      <span class="confirm-label">Remove?</span>
      <button type="button" class="icon-btn" data-cancel aria-label="Cancel"></button>
      <button type="button" class="icon-btn danger" data-confirm aria-label="Confirm removal"></button>`;
    setIcon(actions.querySelector("[data-cancel]"), "close");
    setIcon(actions.querySelector("[data-confirm]"), "trash");
    const revert = () => renderFilesWorkspace();
    const timer = setTimeout(revert, 4000);
    actions.querySelector("[data-cancel]").addEventListener("click", cancelEvent => {
      cancelEvent.stopPropagation();
      clearTimeout(timer);
      revert();
    });
    actions.querySelector("[data-confirm]").addEventListener("click", async confirmEvent => {
      confirmEvent.stopPropagation();
      clearTimeout(timer);
      await removeAttachment(attachment.id);
    });
  });
}

function renderFilesWorkspace() {
  const list = $("files-list");
  if (!list) return;
  const usage = workspaceUsage(state.attachments);
  const referencesEnabled = localReferencesEnabled();
  $("files-count").textContent = usage.count ? `(${usage.count})` : "";
  $("files-usage").textContent = `${usage.count} / 10 · ${formatBytes(usage.bytes)} / 5 MB`;
  $("add-files-btn").disabled = state.busy || state.loading || usage.count >= 10;
  $("attach-files-btn").disabled = state.busy || state.loading || usage.count >= 10;

  if (!state.attachments.length) {
    list.innerHTML = '<div class="file-workspace-empty">Add Markdown, JSON, CSV, source, or other supported text files.</div>';
    return;
  }

  list.replaceChildren(...state.attachments.map(attachment => {
    const row = document.createElement("div");
    row.className = "file-workspace-item";
    row.append(icon("file"));
    const main = document.createElement("button");
    main.type = "button";
    main.className = "file-workspace-main";
    main.disabled = !referencesEnabled;
    main.title = main.disabled
      ? "Enable Read or Grep to reference this file"
      : `Reference @${attachment.virtualPath}`;
    main.innerHTML = `
      <span class="file-workspace-name">${esc(attachment.virtualPath)}</span>
      <span class="file-workspace-meta">${attachment.lineCount} lines · ${esc(formatBytes(attachment.storedBytes))}</span>`;
    main.addEventListener("click", () => addFileReference(attachment));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn danger";
    remove.setAttribute("aria-label", `Remove ${attachment.virtualPath}`);
    remove.title = "Remove file";
    remove.disabled = state.busy || state.loading;
    setIcon(remove, "close");
    const actions = document.createElement("div");
    actions.className = "file-workspace-actions";
    actions.appendChild(remove);
    bindAttachmentDeleteConfirm(remove, row, attachment);
    row.append(main, actions);
    return row;
  }));
}

function renderPendingFileRefs() {
  const container = $("composer-file-chips");
  if (!container) return;
  if (!localReferencesEnabled()) state.pendingFileRefs.clear();
  const attachmentsById = new Map(state.attachments.map(item => [String(item.id), item]));
  const validIds = [...state.pendingFileRefs].filter(id => attachmentsById.has(String(id)));
  state.pendingFileRefs = new Set(validIds);
  container.classList.toggle("show", validIds.length > 0);
  container.replaceChildren(...validIds.map(id => {
    const attachment = attachmentsById.get(String(id));
    const chip = document.createElement("span");
    chip.className = "file-chip";
    chip.append(icon("file"));
    const name = document.createElement("span");
    name.className = "file-chip-name";
    name.textContent = attachment.virtualPath;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "file-chip-remove";
    remove.setAttribute("aria-label", `Remove ${attachment.virtualPath} from this message`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      state.pendingFileRefs.delete(String(id));
      renderPendingFileRefs();
    });
    chip.append(name, remove);
    return chip;
  }));
}

function hideFileAutocomplete() {
  state.fileAutocompleteMatches = [];
  state.fileAutocompleteIndex = 0;
  $("file-autocomplete")?.classList.remove("show");
  $("file-autocomplete")?.replaceChildren();
}

function updateFileAutocomplete() {
  const input = $("user-input");
  const menu = $("file-autocomplete");
  const range = findAtFileQuery(input.value, input.selectionStart);
  if (!range || !state.attachments.length || input.disabled || !localReferencesEnabled()) {
    hideFileAutocomplete();
    return;
…13098 tokens truncated…sages");
  const empty = $("empty-state");
  const wasPinned = isPinnedToBottom(chatScrollEl());
  container.replaceChildren();

  if (!session?.messages.length) {
    empty.style.display = "";
    mountWebGpuBanner();
    updateEmptyLoader();
    return;
  }
  empty.style.display = "none";
  const hasAgentMessages = session.messages.some(
    message => message.role === "tool" || message.tool_calls?.length,
  );
  const appendRendered = (node, messageIndex) => {
    if (!animateLast || messageIndex !== session.messages.length - 1) {
      node.classList.add("no-entry-animation");
    }
    container.appendChild(node);
  };

  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i];
    if (msg.role === "user") {
      appendRendered(buildUserMessage(msg, i), i);
    } else if (hasAgentMessages) {
      for (const step of agentMessagesToSteps([msg])) {
        appendRendered(buildAgentStepMessage(step), i);
      }
    } else if (msg.role === "assistant") {
      appendRendered(buildAssistantMessage(msg), i);
    }
  }
  mountWebGpuBanner();
  scrollChatToBottom(scrollForce, wasPinned);
}

/* ── Streaming ── */

let renderScheduled = false;
/** @type {object|null} */
let renderState = null;
/** @type {object|null} */
let activeStreamCtx = null;
let phasePulseTimer = null;

function stopPhasePulse() {
  if (phasePulseTimer) {
    clearInterval(phasePulseTimer);
    phasePulseTimer = null;
  }
}

function startPhasePulse() {
  stopPhasePulse();
  phasePulseTimer = setInterval(() => {
    if (renderState && (renderState.streamPhase === "searching" || renderState.prefillActive)) {
      scheduleStreamRender();
    } else if (
      activeStreamCtx &&
      (activeStreamCtx.streamPhase === "searching"
        || activeStreamCtx.prefillActive
        || activeStreamCtx.streamPhase === "generating")
    ) {
      scheduleAgentStepsRender(activeStreamCtx);
    } else {
      stopPhasePulse();
    }
  }, 250);
}

function createStreamingMessage() {
  $("empty-state").style.display = "none";
  $("chat-messages").appendChild(buildAssistantMessage(null, { streaming: true }));
  mountWebGpuBanner();
  scrollChatToBottom(true);
}

function scheduleStreamRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    if (renderState) renderStreamFrame(renderState);
  });
}

/**
 * @param {object} state
 */
function renderStreamFrame(state) {
  const {
    raw = "",
    streamPhase = "generating",
    tracker = null,
    prefillActive = false,
    tokCount = 0,
    tps = 0,
  } = state;

  const msgEl = $("streaming-msg");
  if (!msgEl) return;
  const wasPinned = isPinnedToBottom(chatScrollEl());

  const { thinking, output } = splitRawThinking(raw);
  const displayThinking = thinking;
  const snap = tracker?.snapshot?.() || {};
  const phaseOpts = {
    streamPhase,
    prefillActive,
    prefillTokens: snap.prefillTokens,
    prefillSec: snap.prefillSec,
    cachedTokens: snap.cachedTokens,
    tokCount,
    tps,
    ttft: snap.ttft,
    displayThinking,
  };
  const activeStatus = formatActivePhaseStatus(phaseOpts);
  const thinkPanelLabel = formatThinkPanelLabel(phaseOpts);

  const disclosure = msgEl.querySelector(".think-disclosure");
  const thinkContent = msgEl.querySelector(".think-content");
  const thinkLabelEl = msgEl.querySelector(".think-label");
  const response = msgEl.querySelector(".response-content");
  const footer = msgEl.querySelector(".stream-footer");
  let stats = msgEl.querySelector(".msg-stats-inline");

  const showThinkPanel = shouldShowThinkingPanel(displayThinking, { streamPhase });
  if (showThinkPanel) {
    if (!disclosure) {
      const card = msgEl.querySelector(".msg-card");
      const disc = buildThinkingDisclosure(displayThinking, null, { streaming: true, open: true });
      if (disc) card.insertBefore(disc, response);
    }
    if (thinkContent) {
      if (streamPhase === "searching") {
        if (displayThinking) {
          if (thinkContent.textContent !== displayThinking) {
            thinkContent.textContent = displayThinking;
          }
        } else if (!thinkContent.querySelector(".thinking-dots")) {
          thinkContent.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
        }
      } else if (displayThinking) {
        if (thinkContent.textContent !== displayThinking) {
          thinkContent.textContent = displayThinking;
        }
      } else if (streamPhase === "prefill" || streamPhase === "generating") {
        if (!thinkContent.querySelector(".thinking-dots")) {
          thinkContent.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
        }
      } else if (!thinkContent.querySelector(".thinking-dots")) {
        thinkContent.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
      }
    }
    if (thinkLabelEl) {
      thinkLabelEl.textContent = thinkPanelLabel;
    }
    const discEl = msgEl.querySelector(".think-disclosure");
    if (discEl) discEl.open = true;
  } else if (disclosure) {
    disclosure.remove();
  }

  if (response) {
    setResponseContent(response, output, { streaming: streamPhase === "generating" && !!output });
  }

  if (footer) {
    if (!stats) {
      stats = document.createElement("span");
      stats.className = "msg-stats-inline";
      footer.appendChild(stats);
    }
    stats.textContent = activeStatus;
  }

  msgEl.querySelector(".response-stream-meta")?.remove();

  if (state.busy) setModelStatus("busy", activeStatus);

  scrollChatToBottom(false, wasPinned);
}

function finalizeStreamingMessage(message) {
  stopPhasePulse();
  const next = buildAssistantMessage(message);
  next.classList.add("no-entry-animation");
  const current = $("streaming-msg");
  if (current) current.replaceWith(next);
  else $("chat-messages").appendChild(next);
  renderState = null;
}

/**
 * @param {object} chunk
 * @param {object} ctx
 * @param {{ trackMetrics?: boolean }} [opts]
 */
function handleGenerationChunk(chunk, ctx, { trackMetrics = true } = {}) {
  if (ctx.stopRequested) return;
  if (isPrefillChunk(chunk)) {
    if (trackMetrics) {
      if (chunk.status === "start") ctx.tracker.onPrefillStart(chunk);
      if (chunk.status === "done") ctx.tracker.onPrefillDone(chunk);
    }
    if (chunk.status === "done") {
      ctx.prefillActive = false;
    } else {
      ctx.prefillActive = true;
    }
    ctx.streamPhase = "prefill";
    startPhasePulse();
    return;
  }

  ctx.streamPhase = "generating";
  ctx.prefillActive = false;
  if (trackMetrics) ctx.tracker.onToken();
  ctx.raw = chunk.rawText ?? chunk.text ?? ctx.raw;
  ctx.generatedTokens = trackMetrics
    ? ctx.tracker.generatedTokens
    : Math.max(ctx.generatedTokens + 1, ctx.tracker.generatedTokens);
  const snap = ctx.tracker.snapshot();
  ctx.tps = snap.tps ? Number(snap.tps) : 0;
  startPhasePulse();
}

function initStreamContext() {
  const tracker = new GenerationTracker();
  return {
    tracker,
    raw: "",
    streamPhase: "prefill",
    prefillActive: true,
    searchStartedAt: 0,
    generatedTokens: 0,
    tps: 0,
    stopRequested: false,
    toolCallPending: false,
  };
}

function publishStreamContext(ctx) {
  renderState = {
    raw: ctx.raw,
    streamPhase: ctx.streamPhase,
    tracker: ctx.tracker,
    prefillActive: ctx.prefillActive,
    tokCount: ctx.generatedTokens,
    tps: ctx.tps,
    busy: true,
  };
  scheduleStreamRender();
}

let activeAgentMessages = [];
let streamingAgentMessage = null;
const activeToolCallIds = new Set();
/** @type {HTMLElement[]} */
let agentStepEls = [];
let agentStepsRenderScheduled = false;

function clearAgentStepsUI() {
  activeAgentMessages = [];
  streamingAgentMessage = null;
  activeToolCallIds.clear();
  agentStepEls = [];
  agentStepsRenderScheduled = false;
}

function buildLiveAgentStepElement(step, streamStatus) {
  const el = buildAgentStepMessage(step, {
    streamStatus: step.streaming ? streamStatus : "",
  });
  el.dataset.agentStepKey = step.key;
  el.classList.add("no-entry-animation");
  return el;
}

function runtimeStatusCopy(label) {
  if (label === "Tool call") return "Preparing tool call…";
  if (label === "Stopping") return "Stopping…";
  if (label === "Generating") return "Preparing response…";
  return "Preparing model context…";
}

function reconcileAgentStepElements(steps, container, streamStatus) {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const current = agentStepEls[index];
    if (current?.dataset.agentStepKey === step.key) continue;

    const existingIndex = agentStepEls.findIndex(
      (el, candidateIndex) =>
        candidateIndex > index && el.dataset.agentStepKey === step.key,
    );
    if (existingIndex >= 0) {
      const [existing] = agentStepEls.splice(existingIndex, 1);
      container.insertBefore(existing, current || null);
      agentStepEls.splice(index, 0, existing);
      continue;
    }

    const next = buildLiveAgentStepElement(step, streamStatus);
    container.insertBefore(next, current || null);
    agentStepEls.splice(index, 0, next);
  }

  for (const stale of agentStepEls.splice(steps.length)) stale.remove();
}

function streamStatusFromContext(ctx) {
  const snap = ctx.tracker?.snapshot?.() || {};
  const { thinking, output } = splitRawThinking(ctx.raw || "");
  const displayThinking = thinking;
  return formatActivePhaseStatus({
    streamPhase: ctx.streamPhase,
    prefillActive: ctx.prefillActive,
    prefillTokens: snap.prefillTokens,
    prefillSec: snap.prefillSec,
    cachedTokens: snap.cachedTokens,
    searchStartedAt: ctx.searchStartedAt,
    tokCount: ctx.generatedTokens,
    tps: ctx.tps,
    ttft: snap.ttft,
    displayThinking: output
      ? ""
      : (shouldShowThinkingPanel(displayThinking, { streamPhase: ctx.streamPhase })
        ? displayThinking
        : ""),
  });
}

function syncActiveAgentSteps(ctx) {
  const awaitingVisibleOutput =
    ctx.streamPhase === "generating"
    && !!streamingAgentMessage
    && !streamingAgentMessage.thinking
    && !streamingAgentMessage.content;
  const runtimeLabel = ctx.streamPhase === "stopping"
    ? "Stopping"
    : (ctx.toolCallPending
      ? "Tool call"
      : (awaitingVisibleOutput ? "Generating" : "Prefill"));
  const steps = agentMessagesToSteps(activeAgentMessages, {
    streamingMessage: streamingAgentMessage,
    activeToolCallIds,
    runtimeStatus: {
      active: ctx.streamPhase === "prefill"
        || ctx.streamPhase === "stopping"
        || ctx.prefillActive
        || awaitingVisibleOutput,
      label: runtimeLabel,
    },
  });
  const container = $("chat-messages");
  const wasPinned = isPinnedToBottom(chatScrollEl());
  const streamStatus = streamStatusFromContext(ctx);
  reconcileAgentStepElements(steps, container, streamStatus);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!agentStepEls[i]) continue;
    const status = step.streaming ? streamStatus : "";
    if (ctx.busy || step.streaming || agentStepEls[i].classList.contains("streaming")) {
      updateAgentStepElement(agentStepEls[i], step, status);
    }
  }

  scrollChatToBottom(false, wasPinned);
  if (ctx.busy) setModelStatus("busy", streamStatus);
}

function visibleStreamAnswer(raw, output) {
  if (hasUnclosedThoughtChannel(raw)) return "";
  return sanitizeExternalText(output);
}

function shouldStreamAnswer(raw, output) {
  const visible = visibleStreamAnswer(raw, output);
  if (!visible) return false;
  if (looksLikeToolCallSyntax(visible)) return false;
  return true;
}

function couldBeThinkingControlPrefix(value) {
  const trimmed = String(value || "").trimStart();
  return !!trimmed
    && ["<think>", "<analysis>"].some(marker => marker.startsWith(trimmed));
}

function updateStreamingAgentMessage(ctx) {
  const raw = ctx.raw || "";
  const split = splitRawThinking(raw);
  const output = split.output || "";
  const toolish = looksLikeToolCallSyntax(output) || looksLikeToolCallSyntax(raw);
  ctx.toolCallPending = toolish
    && !couldBeThinkingControlPrefix(output || raw);
  streamingAgentMessage = {
    role: "assistant",
    content: !toolish && shouldStreamAnswer(raw, output)
      ? visibleStreamAnswer(raw, output)
      : null,
    thinking: split.thinking || "",
  };
  publishAgentStreamContext(ctx);
}

function scheduleAgentStepsRender(ctx) {
  if (agentStepsRenderScheduled) return;
  agentStepsRenderScheduled = true;
  requestAnimationFrame(() => {
    agentStepsRenderScheduled = false;
    syncActiveAgentSteps(ctx);
  });
}

function publishAgentStreamContext(ctx) {
  ctx.busy = true;
  scheduleAgentStepsRender(ctx);
}

function stopActiveGeneration() {
  if (!state.abort || state.abort.signal.aborted) return;
  state.abort.abort();
  if (activeStreamCtx) {
    activeStreamCtx.stopRequested = true;
    activeStreamCtx.streamPhase = "stopping";
    activeStreamCtx.prefillActive = false;
    activeStreamCtx.busy = true;
    if (agentStepEls.length || agentModeEffective()) {
      publishAgentStreamContext(activeStreamCtx);
    } else {
      publishStreamContext(activeStreamCtx);
    }
  }
  setModelStatus("busy", "Stopping…");
  updateComposerState();
}

/* ── Copy handler: wired on each button via createCopyButton / performCopy ── */

/* ── Send ── */

async function switchSession(id) {
  if (state.busy || state.loading) {
    toast("Wait until the current operation finishes.");
    return;
  }
  if (id === state.activeSessionId) {
    $("sidebar").classList.remove("open");
    focusComposerInput($("user-input"));
    return;
  }
  const session = state.sessions.find(s => s.id === id);
  if (!session) return;
  projectZ.stopVoice();
  state.activeSessionId = id;
  state.pendingFileRefs.clear();
  hideFileAutocomplete();
  await loadAttachmentsForSession(id);
  syncUIFromSession();
  savePrefs();
  renderSessionList();
  renderFilesWorkspace();
  renderPendingFileRefs();
  renderChat();
  focusComposerInput($("user-input"));
  const modelId = resolveModelIdForSession(session, state.selectedModelId);
  if (!session.modelId) await patchSessionFields(session, { modelId });
  await applyModelSelection(modelId, { silent: true, persistToSession: false });
  resetLoadedModel();
  $("sidebar").classList.remove("open");
  focusComposerInput($("user-input"));
}

async function runAssistantGeneration(session) {
  state.busy = true;
  state.runtimeTracesBySession.delete(String(session.id));
  chatScrollEl().classList.add("streaming-scroll");
  projectZ.busy(true);
  state.abort = new AbortController();
  updateComposerState();
  setModelStatus("busy", "Starting…");

  const useAgent = agentModeEffective();
  /** @type {ReturnType<typeof initStreamContext>} */
  let streamCtx = initStreamContext();
  activeStreamCtx = streamCtx;

  if (useAgent) {
    $("empty-state").style.display = "none";
    clearAgentStepsUI();
    mountWebGpuBanner();
  } else {
    createStreamingMessage();
    publishStreamContext(streamCtx);
  }

  let raw = "";
  let thinking = "";
  let output = "";
  /** @type {object|null} */
  let finalMetrics = null;
  let result = null;
  let generationError = null;
  let turnTools = [];
  const requestTrace = [];
  let executionModelId = session.modelId || null;

  try {
    const modelDef = loadedModelDef();
    executionModelId = modelDef?.id || executionModelId;
    const runtime = getRuntimeAdapter(modelDef.runtime);
    if (useAgent) {
      const availability = toolAvailability({ modelDef });
      turnTools = createActiveTools({
        attachments: state.attachments,
        modelId: modelDef.id,
        availability,
        searchProvider: defaultSearchProvider,
      });
      const baseMessages = buildAgentMessages(withMemory(session, projectZ.memory()), [], {
        attachments: localReferencesEnabled() ? state.attachments : [],
        modelId: modelDef.id,
      });
      result = await runAgentTurn({
        model: state.model,
        messages: baseMessages,
        tools: turnTools,
        generateFn: runtime.generateAgent,
        prepareMessages: (messages, activeTools) =>
          applyAgentPolicy(messages, activeTools, {
            toolProtocol: runtime.toolProtocol,
          }),
        maxNewTokens: effectiveMaxNewTokens(state.maxNewTokens, modelDef),
        contextWindowTokens: modelDef?.contextWindowTokens,
        signal: state.abort.signal,
        callIdPrefix: `${session.id || "session"}_${session.messages.length - 1}`,
        getTracker: () => streamCtx.tracker,
        onStream: (chunk) => {
          handleGenerationChunk(chunk, streamCtx, { trackMetrics: false });
          updateStreamingAgentMessage(streamCtx);
        },
        onEvent: (event) => {
          if (event.type === "generation_start") {
            streamingAgentMessage = null;
            streamCtx.tracker = new GenerationTracker();
            streamCtx.streamPhase = "prefill";
            streamCtx.prefillActive = true;
            streamCtx.toolCallPending = false;
            streamCtx.raw = "";
            streamCtx.generatedTokens = 0;
            publishAgentStreamContext(streamCtx);
          } else if (event.type === "message_end") {
            streamingAgentMessage = null;
            streamCtx.toolCallPending = false;
            activeAgentMessages.push(event.message);
            publishAgentStreamContext(streamCtx);
          } else if (event.type === "tool_start") {
            activeToolCallIds.add(event.toolCall.id);
            streamCtx.streamPhase = "searching";
            streamCtx.searchStartedAt = performance.now();
            streamCtx.prefillActive = false;
            streamCtx.toolCallPending = false;
            startPhasePulse();
            publishAgentStreamContext(streamCtx);
          } else if (event.type === "tool_end") {
            activeToolCallIds.delete(event.toolCall.id);
            activeAgentMessages.push(event.message);
            streamCtx.streamPhase = "prefill";
            streamCtx.prefillActive = true;
            streamCtx.toolCallPending = false;
            streamCtx.raw = "";
            publishAgentStreamContext(streamCtx);
          }
        },
        onRequestPrepared: request => requestTrace.push(structuredClone(request)),
      });
      raw = result.raw || streamCtx.raw;
      output = result.content || "";
      finalMetrics = result.metrics || streamCtx.tracker.snapshot();
      if (result.aborted) {
        const split = splitRawThinking(raw);
        thinking = split.thinking || result.thinking || "";
        output = split.output || output;
      }
    } else {
      const enableThinking = modelSupportsThinking();
      const runtimeMessages = buildMessages(session);
      const boundedMaxNewTokens = effectiveMaxNewTokens(
        state.maxNewTokens,
        modelDef,
      );
      const fittedMessages = fitMessagesToContext(runtimeMessages, {
        contextWindowTokens: modelDef?.contextWindowTokens,
        maxNewTokens: boundedMaxNewTokens,
        countTokens: messages => runtime.countPromptTokens(
          state.model,
          messages,
          { enableThinking },
        ),
      });
      requestTrace.push({
        generation: 1,
        runtime: modelDef.runtime,
        messages: structuredClone(fittedMessages),
        tools: [],
        maxNewTokens: boundedMaxNewTokens,
      });
      runtime.applyChatTemplate?.(state.model, { enableThinking });
      const stream = state.model.generate(fittedMessages, runtime.chatOptions({
        maxNewTokens: boundedMaxNewTokens,
        enableThinking,
        signal: state.abort.signal,
      }));
      for await (const chunk of stream) {
        handleGenerationChunk(chunk, streamCtx);
        publishStreamContext(streamCtx);
      }
      raw = streamCtx.raw;
      finalMetrics = streamCtx.tracker.snapshot();
      const split = splitRawThinking(raw);
      thinking = split.thinking;
      output = split.output;
    }
  } catch (err) {
    console.error(err);
    generationError = err instanceof Error ? err.message : String(err);
    const fallback = generationErrorFallback(err, { raw: streamCtx.raw || raw });
    raw = fallback.raw;
    if (fallback.toast) toast(fallback.toast);
    const split = splitRawThinking(raw);
    thinking = split.thinking;
    output = split.output;
  } finally {
    stopPhasePulse();
    finalMetrics = finalMetrics || streamCtx.tracker.snapshot();
    const meta = {
      tokens: finalMetrics?.tokens ?? streamCtx.generatedTokens,
      tps: finalMetrics?.tps ?? "0",
      ttft: finalMetrics?.ttft ?? "0",
      prefillSec: finalMetrics?.prefillSec ?? null,
      prefillTokens: finalMetrics?.prefillTokens ?? 0,
      cachedTokens: finalMetrics?.cachedTokens ?? 0,
    };
    if (!useAgent) {
      const split = splitRawThinking(raw);
      thinking = split.thinking;
      output = split.output;
      if (looksLikeToolCallSyntax(output || raw)) {
        const cleaned = stripToolCallSyntax(output || raw);
        toast("Enable the relevant tools before asking the model to run tool calls.");
        if (cleaned) output = cleaned;
        else {
          output = "The model tried to run a tool that is not currently available.";
        }
      }
    }
    let finalAssistantMessage = null;
    const wasAborted = !!(state.abort?.signal.aborted || result?.aborted);
    if (useAgent && result?.newMessages?.length) {
      session.messages.push(...result.newMessages);
    } else {
      finalAssistantMessage = {
        role: "assistant",
        content: output || raw || (wasAborted ? "(stopped)" : "(no output)"),
        ...(generationError ? { generationError } : {}),
        thinking: thinking || "",
        meta,
      };
      session.messages.push(finalAssistantMessage);
      if (useAgent) activeAgentMessages.push(finalAssistantMessage);
    }
    session.lastExecution = {
      mode: useAgent ? "agent" : "chat",
      tools: useAgent ? activeToolNames(turnTools) : [],
      generations: result?.generations ?? 1,
      toolCalls: result?.toolCalls ?? 0,
      aborted: wasAborted,
      error: generationError,
      tokenDiagnostics: state.model?.lastGenerationDiagnostics ? structuredClone(state.model.lastGenerationDiagnostics) : null,
      completedAt: Date.now(),
    };
    if (requestTrace.length) {
      state.runtimeTracesBySession.set(String(session.id), {
        provenance: "exact",
        capturedAt: Date.now(),
        modelId: executionModelId,
        requests: requestTrace,
        attachments: state.attachments.map(attachment => ({
          id: attachment.id,
          virtualPath: attachment.virtualPath,
          originalName: attachment.originalName,
          category: attachment.category,
          mime: attachment.mime,
          storedBytes: attachment.storedBytes,
          lineCount: attachment.lineCount,
        })),
      });
    }
    try {
      await persistSession(session);
    } catch (err) {
      console.error(err);
      toast("The reply could not be persisted, but it remains visible in this chat.");
    } finally {
      state.busy = false;
      projectZ.busy(false);
      projectZ.reply(finalAssistantMessage?.content);
      state.abort = null;
      streamCtx.busy = false;
      streamCtx.streamPhase = "done";
      streamCtx.prefillActive = false;
      if (useAgent) {
        syncActiveAgentSteps(streamCtx);
        clearAgentStepsUI();
      } else {
        finalizeStreamingMessage(finalAssistantMessage);
      }
      activeStreamCtx = null;
      renderState = null;
      chatScrollEl().classList.remove("streaming-scroll");
      restoreIdleStatus();
      updateComposerState();
      flushQueuedDownload();
    }
  }
}

async function sendMessage() {
  const input = $("user-input");
  const text = input.value.trim();
  const session = activeSession();
  const expectedModelId = resolveModelIdForSession(session, state.selectedModelId);
  const sendCheck = canSendToModel({
    text,
    model: state.model,
    busy: state.busy,
    loadedModelId: state.loadedModelId,
    expectedModelId,
  });
  if (!sendCheck.ok) {
    if (sendCheck.reason === "model_mismatch") {
      toast(`Load ${modelLabel(expectedModelId)} before sending in this chat.`);
    }
    return;
  }
  if (!session) return;
  state.busy = true;
  updateComposerState();
  session.systemPrompt = $("system-prompt").value;
  if (!session.modelId) session.modelId = state.selectedModelId;
  const fileRefs = localReferencesEnabled()
    ? resolveDraftFileRefs({
      pendingRefs: state.pendingFileRefs,
      text,
      attachments: state.attachments,
    })
    : [];
  projectZ.remember(text);
  const userMessage = { role: "user", content: text };
  if (fileRefs.length) userMessage.fileRefs = fileRefs;
  session.messages.push(userMessage);
  if (session.messages.length === 1) session.title = firstMessageTitle(text);
  try {
    await persistSession(session);
  } catch (err) {
    console.error(err);
    state.busy = false;
    updateComposerState();
    flushQueuedDownload();
    toast("Could not save the message.");
    return;
  }

  input.value = "";
  input.style.height = "auto";
  state.pendingFileRefs.clear();
  hideFileAutocomplete();
  renderPendingFileRefs();
  renderChat({ scrollForce: true, animateLast: true });

  await runAssistantGeneration(session);
  if (session.lastExecution?.error || session.lastExecution?.aborted) return '';
  return [...session.messages].reverse().find(m => m.role === 'assistant')?.content || '';
}

/* ── Init ── */

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

function initStaticIcons() {
  setIcon($("brand-icon"), "webllm");
  setIcon($("empty-icon"), "webllm");
  setIcon($("sidebar-toggle"), "menu");
  setIcon($("chat-title-edit"), "edit");
  setIcon($("send-btn"), "send");
  setIcon($("attach-files-btn"), "paperclip");
  setIcon($("credits-dialog-close"), "close");
  setIcon($("download-dialog-close"), "close");
  const newBtn = $("new-chat-btn");
  newBtn.append(icon("plus"), document.createTextNode(" New conversation"));
  const versionEl = $("app-version");
  if (versionEl) {
    versionEl.setAttribute("aria-label", `App version ${APP_VERSION}`);
    versionEl.innerHTML = `<span class="version-label">Version</span><span class="version-num">${APP_VERSION}</span>`;
  }
  $("file-picker").accept = acceptedFileInputValue();
}

async function init() {
  initStaticIcons();
  initTheme();

  try {
    state.db = await openDB();
    await dbCleanupOrphanAttachments(state.db);
    state.sessions = (await dbGetAll(state.db))
      .map(record => normalizeSessionRecord(record, MODELS))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error(err);
    disableSessionPersistence(err);
    state.sessions = [];
  }

  loadPrefs();
  updateGrammarUI();
  updateWebSearchUI();
  if (!state.sessions.length) await createSession();
  else if (!state.activeSessionId || !state.sessions.find(s => s.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0].id;
  }
  await loadAttachmentsForSession(state.activeSessionId);
  syncUIFromSession();
  savePrefs();

  renderSessionList();
  renderFilesWorkspace();
  renderPendingFileRefs();
  renderChat();
  const bootSession = activeSession();
  if (bootSession && !sessionModelId(bootSession)) {
    await patchSessionFields(bootSession, { modelId: state.selectedModelId });
  }
  updateComposerState();

  if (state.fileOrigin) $("file-origin-note").hidden = false;

  await probeWebGPU();
  try {
    await repairBrokenModelCacheLocal();
    await refreshStorageUI();
  } finally {
    state.storageChecking = false;
    updateComposerState();
  }

  // The model itself cannot survive a page close, but its downloaded weights
  // are cached. Restore the user's selected model automatically on return so
  // a cached visit does not require another Start/Load tap.
  if (state.modelCached && state.webgpuOk) void loadModel();
}

$("theme-toggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
$("load-model-btn").addEventListener("click", loadModel);
$("load-model-btn-hero").addEventListener("click", loadModel);
$("new-chat-btn").addEventListener("click", async () => {
  projectZ.stopVoice();
  focusComposerInput($("user-input"));
  const inherited = inheritedSessionSettings();
  const session = await createSession();
  if (!session) return;
  syncUIFromSession();
  renderFilesWorkspace();
  renderPendingFileRefs();
  renderChat();
  await applyModelSelection(inherited.modelId, { silent: true, persistToSession: false });
  resetLoadedModel();
  focusComposerInput($("user-input"));
});
$("model-picker").addEventListener("change", e => {
  const input = e.target.closest('input[name="model-id"]');
  if (input?.checked) selectModel(input.value);
});
$("sidebar-toggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("chat-title").addEventListener("dblclick", startRenameActiveChat);
$("chat-title-edit").addEventListener("click", startRenameActiveChat);
$("session-search").addEventListener("input", () => {
  state.sessionSearch = $("session-search").value;
  renderSessionList();
  savePrefs();
});

document.querySelectorAll("#grammar-modes .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const preferredTools = toolAvailability({ runtimeReady: false, grammarMode: "off" })
      .filter(tool => tool.preferred && tool.available && tool.conflictsWithGrammar);
    const localToolsOn = preferredTools.some(tool => tool.scope === "local_file");
    if (preferredTools.length) {
      if (btn.dataset.mode !== "off") {
        toast(localToolsOn
          ? "Disable read and grep to use grammar mode."
          : "Disable web search to use grammar mode.");
        return;
      }
    }
    state.grammarMode = btn.dataset.mode;
    savePrefs();
    updateGrammarUI();
  });
});

$("web-search-toggle")?.addEventListener("change", async () => {
  state.toolPreferences.web_search = $("web-search-toggle").checked;
  if (state.toolPreferences.web_search && state.grammarMode !== "off") {
    state.grammarMode = "off";
    toast("Grammar mode disabled while web search is on.");
  }
  const session = activeSession();
  if (session) {
    session.toolPreferences = { ...state.toolPreferences };
    await persistSession(session);
  } else {
    savePrefs();
  }
  updateGrammarUI();
});

$("read-tool-toggle")?.addEventListener("change", () => {
  setLocalFileToolPreference("read", $("read-tool-toggle").checked);
});

$("grep-tool-toggle")?.addEventListener("change", () => {
  setLocalFileToolPreference("grep", $("grep-tool-toggle").checked);
});

const debounce = createDebouncer();

$("system-prompt").addEventListener("input", () => debounce("system-prompt", async () => {
  const s = activeSession(); if (!s) return;
  s.systemPrompt = $("system-prompt").value;
  await persistSession(s);
}));

for (const id of ["grammar-json-schema", "grammar-custom"]) {
  $(id).addEventListener("input", () => debounce(id, savePrefs));
}

$("max-tokens").addEventListener("change", () => {
  state.maxNewTokens = effectiveMaxNewTokens(
    clampMaxNewTokens($("max-tokens").value),
    activeModelDef(),
  );
  $("max-tokens").value = state.maxNewTokens;
  savePrefs();
});

$("clear-model-cache-btn").addEventListener("click", () => clearModelCache());

for (const id of ["conversations-block", "files-block", "model-block", "system-block", "settings-block", "storage-block"]) {
  $(id).addEventListener("toggle", savePrefs);
}

$("credits-btn").addEventListener("click", () => $("credits-dialog").showModal());
$("credits-dialog-close").addEventListener("click", () => $("credits-dialog").close());
$("credits-dialog").addEventListener("click", e => {
  if (e.target === $("credits-dialog")) $("credits-dialog").close();
});
$("download-dialog-close").addEventListener("click", closeDownloadDialog);
$("download-cancel-btn").addEventListener("click", closeDownloadDialog);
$("download-confirm-btn").addEventListener("click", confirmDownload);
$("download-dialog").addEventListener("click", e => {
  if (e.target === $("download-dialog")) closeDownloadDialog();
});
$("download-dialog").addEventListener("close", () => {
  pendingDownloadSessionId = null;
});

$("send-btn").addEventListener("click", () => { projectZ.stopVoice(); sendMessage(); });
$("stop-btn").addEventListener("click", stopActiveGeneration);
$("add-files-btn").addEventListener("click", () => $("file-picker").click());
$("attach-files-btn").addEventListener("click", () => $("file-picker").click());
$("file-picker").addEventListener("change", async () => {
  await addSelectedFiles($("file-picker").files);
  $("file-picker").value = "";
});

function bindFileDropTarget(target, { openOnDrag = false } = {}) {
  let dragDepth = 0;
  target.addEventListener("dragenter", event => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    dragDepth++;
    if (openOnDrag && "open" in target) target.open = true;
    event.dataTransfer.dropEffect = "copy";
    target.classList.add("file-drag-over");
  });
  target.addEventListener("dragover", event => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  target.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) target.classList.remove("file-drag-over");
  });
  target.addEventListener("drop", event => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    dragDepth = 0;
    target.classList.remove("file-drag-over");
    addSelectedFiles(event.dataTransfer?.files);
  });
}

bindFileDropTarget($("composer-shell"));
bindFileDropTarget($("files-block"), { openOnDrag: true });

$("user-input").addEventListener("input", () => {
  autoResizeTextarea($("user-input"));
  const reconciledRefs = new Set(reconcileSelectedFileRefs(
    state.pendingFileRefs,
    $("user-input").value,
    state.attachments,
  ));
  const refsChanged = reconciledRefs.size !== state.pendingFileRefs.size;
  state.pendingFileRefs = reconciledRefs;
  if (refsChanged) renderPendingFileRefs();
  state.fileAutocompleteIndex = 0;
  updateFileAutocomplete();
});
$("user-input").addEventListener("click", updateFileAutocomplete);
$("user-input").addEventListener("keydown", e => {
  if ($("file-autocomplete").classList.contains("show")) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const direction = e.key === "ArrowDown" ? 1 : -1;
      const count = state.fileAutocompleteMatches.length;
      state.fileAutocompleteIndex = (state.fileAutocompleteIndex + direction + count) % count;
      updateFileAutocomplete();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectFileAutocomplete();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hideFileAutocomplete();
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.addEventListener("click", event => {
  if (!event.target.closest("#composer-wrap")) hideFileAutocomplete();
});

const projectZ = initProjectZ({ input: $("user-input"), notify: toast, send: sendMessage, ready: () => !$("user-input").disabled && !state.busy && !!state.model });

init().catch(err => {
  console.error("WebLLM initialization failed.", err);
  state.loading = false;
  state.busy = false;
  updateComposerState();
  toast("The app could not finish initializing. You can still retry loading the model.");
});
