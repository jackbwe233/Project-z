import { RESEARCH_DRAFT_KEY } from './z-research.js';
import { createVoiceConversation } from './z-voice.js';
import { readMemory, writeMemory, rememberFromMessage, normalizeMemory, parseMemoryBackup } from './project-z.js';

export function initProjectZ({ input, notify, send, ready }) {
  if (window.location.hash === '#research') {
    try {
      const draft = sessionStorage.getItem(RESEARCH_DRAFT_KEY);
      if (draft && !input.value.trim()) {
        input.value = draft.slice(0, 12000);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        sessionStorage.removeItem(RESEARCH_DRAFT_KEY);
        notify('Research draft ready. Load a model, review the text, then send.');
      }
    } catch { notify('Research draft could not be restored.'); }
  }
  const notes = document.getElementById('z-memory');
  const status = document.getElementById('z-status');
  const avatar = document.getElementById('z-avatar');
  let storage;
  try { storage = window.localStorage; } catch { /* Storage may be blocked. */ }
  let memory = readMemory(storage);
  notes.value = memory;
  const save = value => {
    memory = normalizeMemory(value);
    status.textContent = writeMemory(storage, memory) ? 'Memory saved on this device' : 'Memory could not be saved — export a backup';
  };
  notes.addEventListener('input', () => save(notes.value));
  document.getElementById('z-clear').onclick = () => { notes.value = ''; save(''); };
  document.getElementById('z-backup').onclick = () => {
    const url = URL.createObjectURL(new Blob([memory], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'project-z-memory.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Restore a manually exported memory text file, without cloud storage or model changes.
  const backupButton = document.getElementById('z-backup');
  const restoreButton = document.createElement('button');
  restoreButton.type = 'button';
  restoreButton.textContent = 'Restore memory';
  restoreButton.setAttribute('aria-label', 'Restore memory from a text backup');
  const restoreInput = document.createElement('input');
  restoreInput.type = 'file';
  restoreInput.accept = '.txt,text/plain';
  restoreInput.hidden = true;
  backupButton.insertAdjacentElement('afterend', restoreButton);
  restoreButton.insertAdjacentElement('afterend', restoreInput);
  restoreButton.onclick = () => restoreInput.click();
  restoreInput.onchange = async () => {
    try {
      const file = restoreInput.files?.[0];
      if (!file) return;
      if (file.size > 16000) throw new Error('Memory backup is too large.');
      const restored = parseMemoryBackup(await file.text());
      if (!window.confirm('Replace Z\'s current memory notes with this backup? Export existing notes first if you want to keep them.')) return;
      if (!writeMemory(storage, restored)) throw new Error('Browser storage is unavailable; current memory was not replaced.');
      memory = restored;
      notes.value = restored;
      status.textContent = 'Memory restored on this device';
    } catch (error) {
      status.textContent = `Restore failed: ${error.message}`;
    } finally {
      restoreInput.value = '';
    }
  };
  document.getElementById('z-persist').onclick = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      status.textContent = granted ? 'Persistent storage granted' : 'Browser controls storage retention. Keep backups.';
    } catch { status.textContent = 'Storage request unavailable. Keep backups.'; }
  };
  const mic = document.getElementById('z-mic');
  const talk = document.getElementById('z-talk');
  const speak = document.getElementById('z-speak');
  const voiceStatus = document.getElementById('z-voice-status');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let lastReply = '';
  const voice = createVoiceConversation({
    createRecognition: () => { const r = new Recognition(); r.lang = navigator.language || 'en-US'; return r; },
    synth: window.speechSynthesis,
    createUtterance: text => new SpeechSynthesisUtterance(text),
    ready,
    send: async text => {
      if (input.value.trim()) throw new Error('Draft already exists');
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return send();
    },
    dictate: text => {
      if (input.disabled) return;
      input.value = [input.value, text].filter(Boolean).join(' ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    onState: (value, active) => {
      avatar.dataset.state = value;
      talk.textContent = active ? 'End conversation' : 'Talk to Z';
      talk.setAttribute('aria-pressed', String(active));
      voiceStatus.textContent = value === 'idle' ? 'Voice off' : `Voice: ${value}`;
    },
    onError: message => { voiceStatus.textContent = message; notify(message); },
  });
  input.addEventListener('keydown', () => voice.stop());
  for (const id of ['load-model-btn', 'load-model-btn-hero', 'model-picker']) document.getElementById(id)?.addEventListener('click', () => voice.stop());
  mic.disabled = !Recognition;
  talk.disabled = !Recognition || !window.speechSynthesis;
  speak.disabled = !window.speechSynthesis;
  mic.onclick = () => voice.start(false);
  talk.onclick = () => {
    if (voice.active) { voice.stop(); return; }
    if (input.value.trim()) { notify('Send or clear your typed draft before starting voice conversation.'); return; }
    voice.start();
  };
  speak.onclick = () => lastReply ? voice.read(lastReply) : notify('Send a message first, then tap Read reply.');
  document.getElementById('z-quiet').onclick = () => voice.stop();
  document.addEventListener('visibilitychange', () => { if (document.hidden) voice.stop(); });
  window.addEventListener('pagehide', () => voice.stop());
  return {
    stopVoice: () => voice.stop(),
    memory: () => memory,
    remember(text) {
      const next = rememberFromMessage(memory, text);
      if (next !== memory) { notes.value = next; save(next); }
    },
    busy(value) { avatar.dataset.state = value ? 'thinking' : 'idle'; if (value) window.speechSynthesis?.cancel(); },
    reply(text) { lastReply = String(text || ''); },
  };
}
