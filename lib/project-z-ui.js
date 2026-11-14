import { readMemory, writeMemory, rememberFromMessage, normalizeMemory } from './project-z.js';

export function initProjectZ({ input, notify }) {
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
  document.getElementById('z-persist').onclick = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      status.textContent = granted ? 'Persistent storage granted' : 'Browser controls storage retention. Keep backups.';
    } catch { status.textContent = 'Storage request unavailable. Keep backups.'; }
  };
  const mic = document.getElementById('z-mic');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  let listening = false;
  if (Recognition) {
    recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.onstart = () => { listening = true; mic.textContent = 'Stop mic'; avatar.dataset.state = 'listening'; };
    recognition.onend = () => { listening = false; mic.textContent = 'Dictate'; avatar.dataset.state = 'idle'; };
    recognition.onerror = () => notify('Dictation is unavailable or microphone access was denied. You can still type.');
    recognition.onresult = event => {
      if (input.disabled) return;
      input.value = [input.value, event.results[0][0].transcript].filter(Boolean).join(' ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    mic.onclick = () => {
      if (listening) { recognition.stop(); return; }
      if (input.disabled) { notify('Load the model and wait for it to be ready first.'); return; }
      window.speechSynthesis?.cancel();
      try { recognition.start(); } catch { notify('Microphone is already starting.'); }
    };
  } else { mic.disabled = true; mic.textContent = 'Use keyboard dictation'; }
  const speak = document.getElementById('z-speak');
  let lastReply = '';
  speak.disabled = !('speechSynthesis' in window);
  speak.onclick = () => {
    if (!lastReply) { notify('Send a message first, then tap Read reply.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastReply);
    utterance.onstart = () => { avatar.dataset.state = 'speaking'; };
    utterance.onend = utterance.onerror = () => { avatar.dataset.state = 'idle'; };
    window.speechSynthesis.speak(utterance);
  };
  document.getElementById('z-quiet').onclick = () => { window.speechSynthesis?.cancel(); recognition?.stop(); avatar.dataset.state = 'idle'; };
  return {
    memory: () => memory,
    remember(text) {
      const next = rememberFromMessage(memory, text);
      if (next !== memory) { notes.value = next; save(next); }
    },
    busy(value) { avatar.dataset.state = value ? 'thinking' : 'idle'; if (value) window.speechSynthesis?.cancel(); },
    reply(text) { lastReply = String(text || ''); },
  };
}
