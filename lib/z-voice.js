/** Turn-taking voice: never listen while speaking; late events cannot restart a stopped session. */
export function createVoiceConversation({ createRecognition, synth, createUtterance, ready, send, dictate, onState, onError }) {
  let epoch = 0, recognition, timer, active = false;
  const state = value => onState(value, active);
  function stop() {
    epoch++;
    active = false;
    clearTimeout(timer);
    const previous = recognition;
    recognition = null;
    previous?.abort();
    synth?.cancel();
    state('idle');
  }
  function fail(message) { stop(); onError(message); }
  function speak(text, token, resume) {
    if (token !== epoch) return;
    if (!text?.trim()) { fail('No completed reply to read. You can continue by typing.'); return; }
    const utterance = createUtterance(text);
    state('speaking');
    timer = setTimeout(() => { if (token === epoch) fail('Voice paused. Tap Talk to Z to continue.'); }, 120000);
    utterance.onend = () => {
      if (token !== epoch) return;
      clearTimeout(timer);
      if (resume) listen(token, true); else stop();
    };
    utterance.onerror = () => { if (token === epoch) fail('Speech playback failed. The reply is still in chat.'); };
    synth.speak(utterance);
  }
  function listen(token, conversational) {
    if (token !== epoch) return;
    if (!ready()) { fail('Load the chat model and wait until it is ready.'); return; }
    let transcript = '';
    recognition = createRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      if (token !== epoch) return;
      transcript = Array.from(event.results).filter(r => r.isFinal !== false).map(r => r[0].transcript).join(' ').trim();
    };
    recognition.onerror = event => {
      if (token === epoch) fail(`Microphone stopped (${event.error || 'unavailable'}). Tap to retry or type instead.`);
    };
    recognition.onend = async () => {
      if (token !== epoch) return;
      clearTimeout(timer);
      recognition = null;
      if (!transcript) { fail('No speech heard. Tap to try again.'); return; }
      if (!conversational) { dictate(transcript); stop(); return; }
      state('thinking');
      try {
        const reply = await send(transcript);
        if (token === epoch) speak(reply, token, true);
      } catch { if (token === epoch) fail('Could not complete this voice turn. Check the chat and try again.'); }
    };
    state('listening');
    timer = setTimeout(() => { if (token === epoch) fail('Microphone timed out. Tap to continue.'); }, 30000);
    try { recognition.start(); } catch { fail('Microphone could not start. Check browser permissions.'); }
  }
  return {
    stop,
    start(conversational = true) { stop(); active = conversational; listen(epoch, conversational); },
    read(text) { stop(); speak(text, epoch, false); },
    get active() { return active; },
  };
}
