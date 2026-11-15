import { RESEARCH_DRAFT_KEY } from './z-research.js';
import { createVoiceConversation } from './z-voice.js';
import { readMemory, writeMemory, normalizeMemory } from './project-z.js';
import {
  readLearningStore, writeLearningStore, learnFromUserMessage,
  setLearningEnabled, setAutoSave, approveLearning, forgetLearning, editLearning, emptyLearningStore,
  buildPersonalMemoryContext, exportLearningBundle, importLearningBundle,
} from './z-learning.js?v=memory-0.2.1-20261114';
import { emptyStyle, readStyle, writeStyle, updateStyle, learnCommunicationStyle, effectiveStyle, buildStyleContext } from './z-style.js';
import { resolvePersonalScope } from './z-account-scope.js';

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
  const toggle = document.getElementById('z-learning-toggle');
  const savedList = document.getElementById('z-learning-saved');
  const pendingList = document.getElementById('z-learning-suggestions');
  const counts = document.getElementById('z-knowledge-count');
  const filterInput = document.getElementById('z-memory-filter');
  const showing = document.getElementById('z-memory-showing');
  let storage;
  try { storage = window.localStorage; } catch { /* Storage may be blocked. */ }
  // Don't read or write personal memory until we know which signed-in account owns it.
  let memory = '';
  let learning = emptyLearningStore();
  let style = emptyStyle();
  let personalReady = false;
  const styleToggle = document.getElementById('z-style-learning-toggle');
  const autoSaveToggle = document.getElementById('z-memory-auto-save');
  const tone = document.getElementById('z-style-tone');
  const length = document.getElementById('z-style-length');
  const explanation = document.getElementById('z-style-explanation');
  const stylePreview = document.getElementById('z-style-preview');
  const scopeLabel = document.getElementById('z-personalization-scope');
  const personalInputs = [notes, toggle, autoSaveToggle, styleToggle, tone, length, explanation,
    document.getElementById('z-style-reset'), document.getElementById('z-clear'),
    document.getElementById('z-backup'), document.getElementById('z-import')];
  for (const control of personalInputs) control.disabled = true;
  notes.value = '';
  status.textContent = 'Loading your private Z personalization…';

  const saveNotes = value => {
    memory = normalizeMemory(value);
    status.textContent = writeMemory(storage, memory)
      ? 'Manual memory saved on this device.'
      : 'Could not save. Export a backup to preserve your notes.';
  };
  const persistLearning = () => {
    if (!writeLearningStore(storage, learning)) {
      status.textContent = 'Could not save learned memories. Check browser storage and export a backup.';
    }
  };
  const createAction = (text, handler) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', handler);
    return button;
  };
  const renderList = (container, entries, pending) => {
    container.replaceChildren();
    if (!entries.length) {
      const message = document.createElement('p');
      message.className = 'z-learning-empty';
      message.textContent = pending
        ? 'No suggestions to review.'
        : 'Nothing approved yet. Tell Z “Remember that …” or approve a suggestion.';
      container.appendChild(message);
      return;
    }
    for (const entry of [...entries].reverse()) {
      const row = document.createElement('div');
      row.className = 'z-learning-row';
      const info = document.createElement('div');
      info.className = 'z-learning-row-content';
      const category = document.createElement('span');
      category.className = 'z-learning-kind';
      category.textContent = entry.kind + (entry.source === 'explicit' ? ' · saved by request' : '');
      const text = document.createElement('span');
      text.className = 'z-learning-text';
      text.textContent = entry.text; // Never treat memory text as HTML.
      info.append(category, text);
      const actions = document.createElement('div');
      actions.className = 'z-learning-actions';
      if (pending) {
        actions.appendChild(createAction('Save', () => {
          learning = approveLearning(learning, entry.id);
          persistLearning();
          renderMemory();
          status.textContent = 'Suggestion approved. Z can now recall it when relevant.';
        }));
      } else {
        actions.appendChild(createAction('Edit', () => {
          const replacement = window.prompt('Edit this approved memory:', entry.text);
          if (replacement === null) return;
          const revised = editLearning(learning, entry.id, replacement);
          if (revised.saved.some(x => x.id === entry.id && x.text === entry.text)) {
            status.textContent = 'No change saved. Keep memories descriptive and avoid private or sensitive details.';
            return;
          }
          learning = revised;
          persistLearning();
          renderMemory();
          status.textContent = 'Approved memory updated.';
        }));
      }
      actions.appendChild(createAction(pending ? 'Dismiss' : 'Forget', () => {
        learning = forgetLearning(learning, entry.id);
        persistLearning();
        renderMemory();
        status.textContent = pending ? 'Suggestion dismissed.' : 'Learned memory deleted from this device.';
      }));
      row.append(info, actions);
      container.appendChild(row);
    }
  };
  function renderMemory() {
    toggle.checked = learning.learnEnabled;
    autoSaveToggle.checked = learning.autoSave;
    autoSaveToggle.disabled = !personalReady || !learning.learnEnabled;
    counts.textContent = learning.saved.length + ' saved · ' + learning.pending.length + ' to review';
    const term = filterInput.value.trim().toLowerCase();
    const matching = term
      ? learning.saved.filter(item => (item.text + ' ' + item.kind).toLowerCase().includes(term))
      : learning.saved;
    renderList(savedList, matching.slice(-40), false);
    showing.textContent = matching.length > 40
      ? 'Showing the 40 newest matches out of ' + matching.length + '. Search for an older memory.'
      : matching.length + ' matching saved memories';
    renderList(pendingList, learning.pending, true);
  }

  function renderStyle() {
    styleToggle.checked = style.learnEnabled;
    tone.value = style.tone;
    length.value = style.length;
    explanation.value = style.explanation;
    const effective = effectiveStyle(style);
    stylePreview.textContent = 'Z will reply: ' + effective.tone + ' · ' + effective.length +
      ' · ' + effective.explanation + '. ' + (style.learnEnabled
        ? 'Learned from ' + style.samples + ' messages (only style counts saved).'
        : 'Automatic style learning is off.');
  }
  function saveStyle(patch) {
    if (!personalReady) return;
    style = updateStyle(style, patch);
    if (!writeStyle(storage, style)) {
      status.textContent = 'Could not save your communication preferences. Check browser storage.';
    } else {
      status.textContent = 'Z communication style saved for this account on this device.';
    }
    renderStyle();
  }
  styleToggle.addEventListener('change', () => saveStyle({ learnEnabled: styleToggle.checked }));
  tone.addEventListener('change', () => saveStyle({ tone: tone.value }));
  length.addEventListener('change', () => saveStyle({ length: length.value }));
  explanation.addEventListener('change', () => saveStyle({ explanation: explanation.value }));
  document.getElementById('z-style-reset').addEventListener('click', () => {
    if (!personalReady || !window.confirm('Reset Z communication style and learned writing patterns?')) return;
    style = emptyStyle();
    writeStyle(storage, style);
    renderStyle();
    status.textContent = 'Communication style reset. Your approved memories were not changed.';
  });
  document.getElementById('z-open-personalization')?.addEventListener('click', () => {
    const drawer = document.querySelector('.z-voice-drawer');
    const memoryPanel = document.querySelector('.z-memory-panel');
    if (drawer) drawer.open = true;
    if (memoryPanel) memoryPanel.open = true;
    document.getElementById('z-style-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  filterInput.addEventListener('input', renderMemory);
  notes.addEventListener('input', () => saveNotes(notes.value));
  toggle.addEventListener('change', () => {
    learning = setLearningEnabled(learning, toggle.checked);
    persistLearning();
    renderMemory();
    status.textContent = learning.learnEnabled
      ? 'Learning enabled. Suggestions need approval unless you also enable automatic safe memories.'
      : 'Learning off. Previously approved memories remain available.';
  });
  autoSaveToggle.addEventListener('change', () => {
    if (!personalReady) return;
    learning = setAutoSave(learning, autoSaveToggle.checked);
    persistLearning();
    renderMemory();
    status.textContent = learning.autoSave
      ? 'Automatic safe memories on. Review and delete them anytime below.'
      : 'Automatic saving off. New facts will require your approval.';
  });
  document.getElementById('z-clear').onclick = () => {
    if (!window.confirm('Delete ALL saved and suggested memories on this device? This cannot be undone without a backup.')) return;
    notes.value = '';
    memory = '';
    learning = emptyLearningStore();
    writeMemory(storage, '');
    persistLearning();
    renderMemory();
    status.textContent = 'All Project Z memories cleared on this device.';
  };
  document.getElementById('z-backup').onclick = () => {
    const backup = exportLearningBundle(memory, learning, style);
    const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-z-personal-memory.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Backup exported. Store it privately; it contains your personal notes.';
  };
  const importInput = document.getElementById('z-memory-import-file');
  document.getElementById('z-import').onclick = () => importInput.click();
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    if (file.size > 256 * 1024) {
      status.textContent = 'Memory backup is too large (256 KB maximum).';
      return;
    }
    try {
      const imported = importLearningBundle(await file.text());
      if (!window.confirm('Replace current memories with the imported backup on this device?')) return;
      memory = normalizeMemory(imported.manualNotes);
      learning = imported.learning;
      style = imported.communicationStyle;
      notes.value = memory;
      writeMemory(storage, memory);
      persistLearning();
      writeStyle(storage, style);
      renderMemory();
      renderStyle();
      status.textContent = 'Memories and communication style imported on this device. Review your preferences.';
    } catch (err) {
      status.textContent = err?.message || 'Could not import this backup.';
    }
  });
  document.getElementById('z-persist').onclick = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      status.textContent = granted ? 'Persistent storage granted.' : 'Browser controls storage retention. Keep backups.';
    } catch { status.textContent = 'Storage request unavailable. Keep backups.'; }
  };
  // Verify identity before loading personal data; account A never sees account B's vault.
  const baseStorage = storage;
  void resolvePersonalScope(baseStorage).then(scope => {
    storage = scope.storage;
    memory = readMemory(storage);
    learning = readLearningStore(storage);
    style = readStyle(storage);
    personalReady = true;
    notes.value = memory;
    scopeLabel.textContent = scope.label + ' · Memories and communication style are saved locally, not synced to other devices.';
    for (const control of personalInputs) control.disabled = false;
    renderMemory();
    renderStyle();
    status.textContent = 'Z is ready to learn with your permission. Memories stay on this device.';
  }).catch(() => {
    personalReady = false;
    scopeLabel.textContent = 'Could not verify your account. Personal memory is locked to protect your data.';
    status.textContent = 'Please check your connection or sign in again. Your existing memories have not been deleted.';
  });
  window.addEventListener('storage', event => {
    // Supabase session changes in another tab require a fresh, verified account scope.
    if (event.key?.startsWith('sb-') && event.key.endsWith('-auth-token')) {
      personalReady = false;
      for (const control of personalInputs) control.disabled = true;
      window.location.reload();
    }
  });
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
    context(session) {
      const latest = [...(session?.messages || [])].reverse().find(msg => msg.role === 'user')?.content || '';
      if (!personalReady) return '';
      return [buildStyleContext(style), buildPersonalMemoryContext(memory, learning, latest)]
        .filter(Boolean).join('\n\n');
    },
    remember(text) {
      if (!personalReady) return;
      const adapted = learnCommunicationStyle(style, text);
      if (adapted.samples !== style.samples) {
        style = adapted;
        writeStyle(storage, style);
        renderStyle();
      }
      const result = learnFromUserMessage(learning, text);
      if (result.change !== 'saved' && result.change !== 'suggested') return;
      learning = result.store;
      persistLearning();
      renderMemory();
      if (result.change === 'saved') {
        status.textContent = 'Memory saved. Z will use it in relevant conversations.';
        notify('Saved to Z memory.');
      } else {
        status.textContent = 'Z has a new memory suggestion. Review it below before saving.';
      }
    },
    busy(value) { avatar.dataset.state = value ? 'thinking' : 'idle'; if (value) window.speechSynthesis?.cancel(); },
    reply(text) { lastReply = String(text || ''); },
  };
}
