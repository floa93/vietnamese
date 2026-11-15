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

/* ---------- speaking: compare what the recognizer heard with the sentence ---------- */

/**
 * One spelling per syllable, so old- and new-style tone placement compare equal
 * ("hoà" = "hòa", "thuỷ" = "thủy"): strip the tone and put it back by the rules above.
 * @param {string} syllable lowercase, NFC
 */
function canonSyllable(syllable) {
  const nfd = syllable.normalize('NFD');
  const tone = (nfd.match(TONE_RE) || [])[0];
  const base = [...nfd.replace(TONE_RE, '').normalize('NFC')];
  if (!tone) return base.join('');
  const idx = toneIndex(base);
  if (idx >= 0) base[idx] = (base[idx].normalize('NFD') + tone).normalize('NFC');
  return base.join('');
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** 0–999 in Northern Vietnamese; `full` adds "không trăm" / "linh" inside bigger numbers. */
function below1000(n, full) {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out = [];
  if (h || full) out.push(DIGITS[h], 'trăm');
  if (t === 0) {
    if (u && (h || full)) out.push('linh');
    if (u || !out.length) out.push(DIGITS[u]);
  } else {
    out.push(t === 1 ? 'mười' : `${DIGITS[t]} mươi`);
    if (u === 1) out.push(t === 1 ? 'một' : 'mốt');
    else if (u === 4) out.push(t === 1 ? 'bốn' : 'tư');
    else if (u === 5) out.push('lăm');
    else if (u) out.push(DIGITS[u]);
  }
  return out.join(' ');
}

/** Spell out a whole number (up to billions) the Northern way, e.g. 25000 → "hai mươi lăm nghìn". */
export function numberToWords(n) {
  if (!Number.isSafeInteger(n) || n < 0) return String(n);
  if (n < 1000) return below1000(n, false);
  const groups = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000);
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const out = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    out.push(below1000(groups[i], i < groups.length - 1), units[i] || '');
  }
  return out.join(' ').trim();
}

/** Recognizers often write numbers as digits ("50.000", "2"): spell them out. */
function spellNumbers(text) {
  return text.replace(/\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+/g, (m) => numberToWords(Number(m.replace(/[.,]/g, ''))));
}

/** Other spellings recognizers use for loanwords, mapped to the spelling in the word list. */
const ALIASES = { cafe: 'cà phê', café: 'cà phê', coffee: 'cà phê', 'wi fi': 'wifi', bus: 'buýt', ok: 'ô kê', okay: 'ô kê', oke: 'ô kê' };
const ALIAS_RE = new RegExp(`(^|\\s)(${Object.keys(ALIASES).join('|')})(?=\\s|$)`, 'g');

/** @param {string} text */
const syllables = (text) =>
  clean(text)
    .replace(ALIAS_RE, (_, sp, w) => sp + ALIASES[w])
    .split(' ')
    .filter(Boolean)
    .map(canonSyllable);

/**
 * Indices of `expected` that are matched, in order, by `heard` (longest common subsequence).
 * @param {string[]} expected
 * @param {string[]} heard
 */
function matchedIndices(expected, heard) {
  const n = expected.length;
  const m = heard.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = expected[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Set();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (expected[i] === heard[j]) {
      hit.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return hit;
}

/**
 * Check a spoken sentence word by word. Tones count: "ba" is not "bà".
 * @param {string} expected        the Vietnamese sentence
 * @param {string[]} alternatives  transcripts from the recognizer
 * @returns {{ parts: { text: string, ok: boolean | null }[], passed: boolean, heard: string }}
 *   parts: the sentence split at spaces (spaces kept, ok = null), each word marked heard or not
 */
export function checkSpoken(expected, alternatives) {
  const pieces = expected.normalize('NFC').split(/(\s+)/);
  /** @type {{ syl: string, piece: number }[]} */
  const exp = [];
  pieces.forEach((p, i) => {
    if (!/\s/.test(p)) for (const syl of syllables(p)) exp.push({ syl, piece: i });
  });
  const target = exp.map((e) => e.syl);

  let best = { hit: new Set(), heard: alternatives[0] || '' };
  for (const alt of alternatives) {
    const hit = matchedIndices(target, syllables(spellNumbers(alt)));
    if (hit.size > best.hit.size) best = { hit, heard: alt };
  }

  const missing = new Set(exp.filter((_, i) => !best.hit.has(i)).map((e) => e.piece));
  return {
    parts: pieces.map((text, i) => ({ text, ok: /\s/.test(text) || text === '' ? null : !missing.has(i) })),
    passed: best.hit.size === target.length && target.length > 0,
    heard: best.heard,
  };
}
