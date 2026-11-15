// @ts-check
// Speech recognition (Web Speech API, language "vi-VN") for the speaking mode.
// Chrome (Android / desktop) sends the audio to Google's recognizer; Safari (iOS / macOS)
// uses Apple's dictation, which needs "Siri & Dictation" enabled on the device.
// Firefox and Chrome on iOS have no speech recognition, so the mode is disabled there.

/** @returns {any} the SpeechRecognition constructor, or null */
function Recognition() {
  const w = /** @type {any} */ (window);
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function canListen() {
  return !!Recognition();
}

/** @type {any} */
let active = null;
/** @type {((error: string) => void) | null} */
let activeOnError = null;

/** Stop listening without a result (e.g. when leaving the screen); reports the error "aborted". */
export function abortListening() {
  if (!active) return;
  const r = active;
  const onError = activeOnError;
  active = activeOnError = null;
  r.onresult = r.onerror = r.onend = null;
  onError?.('aborted');
  try {
    r.abort();
  } catch {
    /* already stopped */
  }
}

/** Stop listening and evaluate what was heard so far. */
export function stopListening() {
  try {
    active?.stop();
  } catch {
    /* already stopped */
  }
}

/**
 * Listen for one utterance in Vietnamese.
 * @param {Object} cb
 * @param {(text: string) => void} [cb.onInterim]      live transcript while speaking
 * @param {(alternatives: string[]) => void} cb.onResult  possible transcripts, best first
 * @param {(error: string) => void} cb.onError  "no-speech", "not-allowed", "network", …
 */
export function listen({ onInterim, onResult, onError }) {
  const R = Recognition();
  if (!R) return onError('unsupported');
  abortListening();
  // Our own text-to-speech would be picked up by the microphone.
  if ('speechSynthesis' in window) speechSynthesis.cancel();

  const r = new R();
  r.lang = 'vi-VN';
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 5;

  let finals = /** @type {string[]} */ ([]);
  let interim = '';
  let failed = false;

  r.onresult = (e) => {
    const results = [...e.results];
    const done = results.filter((res) => res.isFinal);
    interim = results.map((res) => res[0].transcript).join(' ').trim();
    onInterim?.(interim);
    if (done.length && done.length === results.length) {
      // One segment: use all its alternatives. Several segments: join the best of each.
      finals =
        done.length === 1
          ? [...done[0]].map((alt) => alt.transcript.trim()).filter(Boolean)
          : [done.map((res) => res[0].transcript).join(' ').trim()];
    }
  };
  r.onerror = (e) => {
    if (e.error === 'aborted') return;
    failed = true;
    active = null;
    onError(e.error || 'unknown');
  };
  r.onend = () => {
    if (active !== r) return; // aborted, or an error was already reported
    active = null;
    if (failed) return;
    // Safari sometimes ends without marking the last result final.
    const heard = finals.length ? finals : interim ? [interim] : [];
    if (heard.length) onResult(heard);
    else onError('no-speech');
  };

  active = r;
  activeOnError = onError;
  try {
    r.start();
  } catch (err) {
    active = null;
    onError('start-failed');
  }
}

window.addEventListener('hashchange', abortListening);
