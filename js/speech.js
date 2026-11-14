// @ts-check
// Read Vietnamese aloud with the browser's built-in speech synthesis (Web Speech API).
// Speaker buttons are hidden by CSS until a Vietnamese voice is found
// (<html class="has-vi-voice">), so devices without one never see a broken button.

import { esc } from './util.js';

/** @type {SpeechSynthesisVoice | null} */
let voice = null;

export function initSpeech() {
  if (!('speechSynthesis' in window)) return;
  const pick = () => {
    const voices = speechSynthesis.getVoices();
    voice = voices.find((v) => /^vi([-_]|$)/i.test(v.lang)) || null;
    document.documentElement.classList.toggle('has-vi-voice', !!voice);
  };
  pick();
  speechSynthesis.addEventListener?.('voiceschanged', pick);
  // Some browsers (notably Safari) fill the voice list late without firing the event.
  setTimeout(pick, 300);
  setTimeout(pick, 1500);

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-speak]') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    speak(btn.getAttribute('data-speak') || '');
  });
}

/** @param {string} text */
export function speak(text) {
  if (!voice || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

/** HTML for a speaker button that reads `text` aloud. */
export function speakButton(text, label = 'Listen') {
  return `<button type="button" class="speak" data-speak="${esc(text)}" aria-label="${esc(label)}" title="${esc(label)}"><span aria-hidden="true">🔊</span></button>`;
}
