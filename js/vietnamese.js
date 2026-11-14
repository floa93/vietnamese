// @ts-check
// Vietnamese text helpers: answer checking for typing mode and tone-mark input.

import { esc, fold } from './util.js';

const PUNCT = /[.,!?;:…"“”'‘’()\-–—]/g;

/** NFC, lowercase, no punctuation, single spaces. */
function clean(text) {
  return String(text).normalize('NFC').toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Compare a typed answer with the expected Vietnamese.
 * "exact": identical incl. diacritics; "almost": only diacritics differ; "wrong" otherwise.
 * Case, punctuation and extra spaces are ignored.
 * @param {string} typed
 * @param {string} expected
 * @returns {'exact' | 'almost' | 'wrong'}
 */
export function checkAnswer(typed, expected) {
  const a = clean(typed);
  const b = clean(expected);
  if (!a) return 'wrong';
  if (a === b) return 'exact';
  if (fold(a) === fold(b)) return 'almost';
  return 'wrong';
}

/**
 * HTML of the expected answer with every letter whose diacritics differ from the typed one wrapped in <mark>.
 * Only meaningful when checkAnswer returned "almost" (same letters, different marks).
 * @param {string} typed
 * @param {string} expected
 */
export function highlightDiacritics(typed, expected) {
  // Both sides are NFC, and every Vietnamese letter has a single precomposed code point,
  // so after removing punctuation/spaces the letters line up one to one.
  const typedLetters = [...clean(typed).replace(/ /g, '')];
  let j = 0;
  let html = '';
  for (const ch of expected.normalize('NFC')) {
    if (/\s/.test(ch) || /[.,!?;:…"“”'‘’()\-–—]/.test(ch)) {
      html += esc(ch);
      continue;
    }
    const t = typedLetters[j++] || '';
    html += t === ch.toLowerCase() ? esc(ch) : `<mark>${esc(ch)}</mark>`;
  }
  return html;
}

/* ---------- tone input for the helper keyboard ---------- */

export const TONES = [
  { mark: '̀', label: 'à', name: 'huyền (falling)' },
  { mark: '́', label: 'á', name: 'sắc (rising)' },
  { mark: '̉', label: 'ả', name: 'hỏi (dipping)' },
  { mark: '̃', label: 'ã', name: 'ngã (broken)' },
  { mark: '̣', label: 'ạ', name: 'nặng (heavy)' },
];
export const LETTERS = ['ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư'];

const TONE_RE = /[̣̀́̃̉]/g;
const SHAPE_RE = /[̛̂̆]/; // circumflex, breve, horn  (â ê ô, ă, ơ ư)
const isVowel = (ch) => 'aeiouy'.includes(fold(ch));

/**
 * Index (within `syllable`) of the vowel that should carry the tone, or -1.
 * Rules (traditional Northern placement):
 *  - a vowel with a shape mark (ă â ê ô ơ ư) takes the tone (last one for ươ → ơ);
 *  - "qu"/"gi" + vowel: the u / i belongs to the consonant;
 *  - vowel cluster at the end of the syllable (mái, của, hòa): second-to-last vowel;
 *  - otherwise (cluster followed by a consonant: hoàng, toán): last vowel of the cluster.
 * @param {string[]} syllable letters, NFC
 */
export function toneIndex(syllable) {
  let vowels = syllable.map((ch, i) => (isVowel(ch) ? i : -1)).filter((i) => i >= 0);
  if (!vowels.length) return -1;
  const word = fold(syllable.join(''));
  if ((word.startsWith('qu') || word.startsWith('gi')) && vowels.length > 1 && vowels[0] === 1) vowels = vowels.slice(1);
  const shaped = vowels.filter((i) => SHAPE_RE.test(syllable[i].normalize('NFD')));
  if (shaped.length) return shaped[shaped.length - 1];
  if (vowels.length === 1) return vowels[0];
  const last = vowels[vowels.length - 1];
  const endsWithVowel = last === syllable.length - 1;
  return endsWithVowel ? vowels[vowels.length - 2] : last;
}

/**
 * Apply a tone to the syllable just before the cursor. Pressing the same tone again removes it.
 * @param {string} value
 * @param {number} cursor
 * @param {string} mark combining tone mark
 * @returns {{ value: string, cursor: number } | null} null if there is no vowel to put it on
 */
export function applyTone(value, cursor, mark) {
  const before = value.slice(0, cursor).normalize('NFC');
  const after = value.slice(cursor);
  const start = before.search(/[^\s.,!?]*$/);
  const syllable = [...before.slice(start)];
  const idx = toneIndex(syllable);
  if (idx < 0) return null;
  const hadSame = syllable.some((ch) => ch.normalize('NFD').includes(mark));
  const stripped = syllable.map((ch) => ch.normalize('NFD').replace(TONE_RE, '').normalize('NFC'));
  if (!hadSame) stripped[idx] = (stripped[idx].normalize('NFD') + mark).normalize('NFC');
  const newBefore = before.slice(0, start) + stripped.join('');
  return { value: newBefore + after, cursor: newBefore.length };
}
