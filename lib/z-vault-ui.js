/** @file Connect an Obsidian vault folder, keep a snapshot in IndexedDB, and supply prompt context. */

import { memoryQueryFromMessages } from "./z-learning.js?v=personalize-0.3.0-20261114";
import {
  buildVaultContext,
  buildVaultSnapshot,
  describeVault,
  isVaultNotePath,
  readVaultSnapshot,
} from "./z-vault.js?v=vault-1";

const DB_NAME = "project-z-vault";
const STORE = "kv";
const SNAPSHOT_KEY = "snapshot";
export const VAULT_ENABLED_KEY = "project-z:vault-enabled:v1";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbRequest(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const loadStoredVault = async () =>
  readVaultSnapshot(await dbRequest("readonly", store => store.get(SNAPSHOT_KEY)));
export const saveStoredVault = snapshot =>
  dbRequest("readwrite", store => store.put(snapshot, SNAPSHOT_KEY));
export const clearStoredVault = () =>
  dbRequest("readwrite", store => store.delete(SNAPSHOT_KEY));

/** Walk a File System Access directory handle (Chrome/Edge desktop). */
export async function readDirectoryHandle(handle, prefix = "") {
  const files = [];
  for await (const entry of handle.values()) {
    if (entry.name.startsWith(".")) continue;
    const path = prefix + entry.name;
    if (entry.kind === "directory") {
      files.push(...await readDirectoryHandle(entry, path + "/"));
    } else if (isVaultNotePath(path)) {
      files.push({ path, text: await (await entry.getFile()).text() });
    }
  }
  return files;
}

/** Read files from an <input type="file" webkitdirectory> (or plain multi-select) list. */
export async function readFileList(fileList) {
  const files = [];
  let name = "";
  for (const file of Array.from(fileList || [])) {
    const relative = file.webkitRelativePath || file.name;
    const parts = relative.split("/");
    if (parts.length > 1) {
      name ||= parts[0];
      parts.shift();
    }
    const path = parts.join("/");
    if (isVaultNotePath(path)) files.push({ path, text: await file.text() });
  }
  return { name, files };
}

export function initVault({ notify = () => {}, storage = window.localStorage } = {}) {
  const status = document.getElementById("z-vault-status");
  const connect = document.getElementById("z-vault-connect");
  const disconnect = document.getElementById("z-vault-disconnect");
  const toggle = document.getElementById("z-vault-toggle");
  const picker = document.getElementById("z-vault-picker");
  let snapshot = null;
  let enabled = true;
  try { enabled = storage.getItem(VAULT_ENABLED_KEY) !== "off"; } catch { /* storage blocked */ }

  const render = () => {
    if (status) status.textContent = describeVault(snapshot);
    if (toggle) {
      toggle.checked = enabled;
      toggle.disabled = !snapshot;
    }
    if (disconnect) disconnect.disabled = !snapshot;
    if (connect) connect.textContent = snapshot ? "Reload vault" : "Connect vault folder";
  };

  const accept = async (files, name) => {
    const next = buildVaultSnapshot(files, { name });
    if (!next.notes.length) {
      notify("No Markdown notes found in that folder.");
      return;
    }
    snapshot = next;
    try {
      await saveStoredVault(snapshot);
    } catch {
      notify("Vault loaded for this visit, but the browser would not save it for next time.");
    }
    render();
    notify(describeVault(snapshot));
  };

  connect?.addEventListener("click", async () => {
    if (typeof window.showDirectoryPicker === "function") {
      try {
        const handle = await window.showDirectoryPicker({ mode: "read" });
        if (status) status.textContent = "Reading notes…";
        await accept(await readDirectoryHandle(handle), handle.name);
      } catch (error) {
        if (error?.name !== "AbortError") notify("Couldn't read that folder.");
        render();
      }
      return;
    }
    picker?.click();
  });

  picker?.addEventListener("change", async () => {
    if (status) status.textContent = "Reading notes…";
    const { name, files } = await readFileList(picker.files);
    picker.value = "";
    await accept(files, name);
  });

  disconnect?.addEventListener("click", async () => {
    snapshot = null;
    try { await clearStoredVault(); } catch { /* nothing stored */ }
    render();
    notify("Vault disconnected. Its notes were removed from this browser.");
  });

  toggle?.addEventListener("change", () => {
    enabled = toggle.checked;
    try { storage.setItem(VAULT_ENABLED_KEY, enabled ? "on" : "off"); } catch { /* storage blocked */ }
  });

  loadStoredVault()
    .then(stored => { snapshot = stored; })
    .catch(() => { snapshot = null; })
    .finally(render);
  render();

  return {
    /** Relevant vault excerpts for the latest turns, sized to the model's budget. */
    context(session, maxChars) {
      if (!enabled || !snapshot) return "";
      return buildVaultContext(snapshot, memoryQueryFromMessages(session?.messages), { maxChars });
    },
  };
}
