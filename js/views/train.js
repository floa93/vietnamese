// @ts-check
import * as progress from '../progress.js';
import { speakButton } from '../speech.js';
import { esc, shuffle } from '../util.js';
import { checkAnswer, highlightDiacritics, applyTone, TONES, LETTERS } from '../vietnamese.js';
import { exampleHTML } from './words.js';

const SETTINGS_KEY = 'vt.settings.v1';
/** How many cards later an "Again" / wrong card comes back. */
const AGAIN_GAP = 3;
/** Horizontal distance (px) that counts as a swipe on a flashcard. */
const SWIPE_DISTANCE = 90;

/** @typedef {import('../data.js').Word} Word */
/** @typedef {'en-vi' | 'vi-en' | 'mixed'} Direction */
/** @typedef {'flash' | 'type'} Mode */
/** @typedef {{ word: Word, dir: 'en-vi' | 'vi-en' }} Card */

/**
 * @typedef {Object} Feedback  result shown after answering in typing mode
 * @property {'exact' | 'almost' | 'wrong'} result
 * @property {string} [typed]   typing: what the user typed
 */

/**
 * @typedef {Object} Session
 * @property {Mode} mode
 * @property {Direction} dir
 * @property {Card[]} queue       cards still to answer; queue[0] is the current card
 * @property {Card[]} all         every card in the session (for "practice again")
 * @property {number} total
 * @property {number} cleared     cards answered correctly
 * @property {Set<string>} known  ids correct on the first try
 * @property {Set<string>} missed ids wrong / "Again" at least once
 * @property {boolean} revealed   flashcards: answer visible
 * @property {Feedback | null} feedback typing: answer checked
 */

/** @type {Session | null} */
let session = null;

/* ---------- settings ---------- */

function loadSettings() {
  const defaults = { mode: 'flash', pool: 'all', topics: /** @type {string[]|null} */ (null), dir: 'en-vi', length: '20' };
  try {
    const s = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    if (s.mode !== 'flash' && s.mode !== 'type') s.mode = 'flash'; // e.g. the removed multiple-choice mode
    return s;
  } catch {
    return defaults;
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/* ---------- session lifecycle ---------- */

/**
 * Start a new session and go to the session screen.
 * @param {Word[]} words   the words to practise
 * @param {{ dir: Direction, mode: Mode }} opts
 */
export function startSession(words, { dir, mode }) {
  if (mode === 'type') dir = 'en-vi'; // typing is always English → Vietnamese
  const cards = shuffle(words).map((word) => ({
    word,
    dir: /** @type {'en-vi'|'vi-en'} */ (dir === 'mixed' ? (Math.random() < 0.5 ? 'en-vi' : 'vi-en') : dir),
  }));
  session = {
    mode,
    dir,
    queue: cards.slice(),
    all: cards,
    total: cards.length,
    cleared: 0,
    known: new Set(),
    missed: new Set(),
    revealed: false,
    feedback: null,
  };
  if (location.hash === '#/train/session') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/train/session';
}

/* ---------- setup screen ---------- */

/** @param {HTMLElement} root @param {any} data */
export function renderSetup(root, data) {
  const { words, topics } = data;
  const s = loadSettings();
  const selected = new Set(s.topics && s.topics.length ? s.topics.filter((t) => topics.includes(t)) : topics);
  const resumable = session && session.queue.length > 0;

  const radio = (name, value, label, checked) =>
    `<label class="choice"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${label}</span></label>`;

  root.innerHTML = `
    ${resumable ? `<a class="btn btn-block" href="#/train/session">Resume current session (${session?.cleared} / ${session?.total})</a>` : ''}
    <form id="setup" class="setup">
      <fieldset>
        <legend>Mode</legend>
        <div class="choices choices-2">
          ${radio('mode', 'flash', 'Flashcards', s.mode === 'flash')}
          ${radio('mode', 'type', 'Typing', s.mode === 'type')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Words</legend>
        <div class="choices">
          ${radio('pool', 'all', 'All', s.pool === 'all')}
          ${radio('pool', 'due', 'Due', s.pool === 'due')}
          ${radio('pool', 'new', 'New', s.pool === 'new')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Topics</legend>
        <div class="topic-checks">
          <label class="check check-all"><input type="checkbox" id="all-topics"><span>All topics</span></label>
          ${topics
            .map(
              (t) =>
                `<label class="check"><input type="checkbox" name="topic" value="${esc(t)}"${selected.has(t) ? ' checked' : ''}><span>${esc(t)}</span><span class="muted small" data-count="${esc(t)}"></span></label>`,
            )
            .join('')}
        </div>
      </fieldset>

      <fieldset id="dir-set">
        <legend>Direction</legend>
        <div class="choices">
          ${radio('dir', 'en-vi', 'EN → VI', s.dir === 'en-vi')}
          ${radio('dir', 'vi-en', 'VI → EN', s.dir === 'vi-en')}
          ${radio('dir', 'mixed', 'Mixed', s.dir === 'mixed')}
        </div>
        <p class="muted small hint" id="dir-hint" hidden>Typing is always English → Vietnamese.</p>
      </fieldset>

      <fieldset>
        <legend>Session length</legend>
        <div class="choices">
          ${radio('length', '10', '10', s.length === '10')}
          ${radio('length', '20', '20', s.length === '20')}
          ${radio('length', 'all', 'All', s.length === 'all')}
        </div>
      </fieldset>

      <button class="btn btn-primary btn-block" type="submit" id="start">Start</button>
    </form>
  `;

  const form = /** @type {HTMLFormElement} */ (root.querySelector('#setup'));
  const allBox = /** @type {HTMLInputElement} */ (root.querySelector('#all-topics'));
  const startBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#start'));
  const dirSet = /** @type {HTMLFieldSetElement} */ (root.querySelector('#dir-set'));
  const dirHint = /** @type {HTMLElement} */ (root.querySelector('#dir-hint'));
  const topicBoxes = /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll('input[name="topic"]')]);

  const read = () => {
    const fd = new FormData(form);
    return {
      mode: /** @type {Mode} */ (String(fd.get('mode') || 'flash')),
      pool: String(fd.get('pool') || 'all'),
      topics: topicBoxes.filter((b) => b.checked).map((b) => b.value),
      dir: /** @type {Direction} */ (String(fd.get('dir') || 'en-vi')),
      length: String(fd.get('length') || '20'),
    };
  };

  /** @param {string} pool */
  const inPool = (pool) => (w) =>
    pool === 'due' ? progress.isDue(w.id) : pool === 'new' ? progress.isNew(w.id) : true;

  const pick = () => {
    const r = read();
    const chosen = new Set(r.topics);
    const candidates = words.filter((w) => chosen.has(w.topic) && inPool(r.pool)(w));
    const n = r.length === 'all' ? candidates.length : Math.min(Number(r.length), candidates.length);
    return { r, candidates, n };
  };

  const refresh = () => {
    const { r, n } = pick();
    allBox.checked = topicBoxes.every((b) => b.checked);
    allBox.indeterminate = !allBox.checked && topicBoxes.some((b) => b.checked);
    dirSet.disabled = r.mode === 'type';
    dirHint.hidden = r.mode !== 'type';
    for (const t of topics) {
      const el = root.querySelector(`[data-count="${CSS.escape(t)}"]`);
      if (el) el.textContent = String(words.filter((w) => w.topic === t && inPool(r.pool)(w)).length);
    }
    startBtn.disabled = n === 0;
    startBtn.textContent =
      n === 0 ? (r.topics.length ? 'No words match' : 'Choose a topic') : `Start · ${n} ${n === 1 ? 'card' : 'cards'}`;
    saveSettings(r);
  };

  allBox.addEventListener('change', () => {
    topicBoxes.forEach((b) => (b.checked = allBox.checked));
    refresh();
  });
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { r, candidates, n } = pick();
    if (!n) return;
    startSession(shuffle(candidates).slice(0, n), { dir: r.dir, mode: r.mode });
  });

  refresh();
  return 'Train';
}

/* ---------- session screen ---------- */

const promptText = (/** @type {Card} */ c) => (c.dir === 'en-vi' ? c.word.english : c.word.vietnamese);

/** @param {HTMLElement} root @param {any} data */
export function renderSession(root, data) {
  if (!session) {
    location.replace('#/train');
    return 'Train';
  }
  const s = session;
  if (s.queue.length === 0) {
    renderSummary(root, s, data);
    return 'Done';
  }

  const card = s.queue[0];
  const pct = Math.round((s.cleared / s.total) * 100);
  const head = `
    <div class="session-head">
      <span class="session-count" aria-live="polite">${s.cleared} / ${s.total}</span>
      <div class="bar bar-grow" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <button class="btn btn-ghost btn-small" type="button" id="end">End</button>
    </div>`;

  const rerender = () => renderSession(root, data);
  if (s.mode === 'type') renderTyping(root, s, card, head, rerender);
  else renderFlash(root, s, card, head, rerender);

  root.querySelector('#end')?.addEventListener('click', () => {
    // Unanswered cards are dropped; ratings given so far are already saved.
    s.queue = [];
    rerender();
  });
  return 'Train';
}

const label = (/** @type {Card} */ c) =>
  `<p class="card-label">${c.dir === 'en-vi' ? 'English → Vietnamese' : 'Vietnamese → English'}</p>`;

const promptHTML = (/** @type {Card} */ c) =>
  c.dir === 'en-vi'
    ? `<p class="card-prompt">${esc(c.word.english)}</p>`
    : `<div class="with-speak center-row"><p class="card-prompt" lang="vi">${esc(c.word.vietnamese)}</p>${speakButton(c.word.vietnamese)}</div>`;

/** Answer details shared by all modes: Vietnamese with speaker, type, example, note. */
function detailsHTML(/** @type {Card} */ c, showSolution = true) {
  const w = c.word;
  const solution = c.dir === 'en-vi'
    ? `<div class="with-speak center-row"><p class="card-solution" lang="vi">${esc(w.vietnamese)}</p>${speakButton(w.vietnamese)}</div>`
    : `<p class="card-solution">${esc(w.english)}</p>`;
  return `
    ${showSolution ? solution : ''}
    ${w.type ? `<p class="muted small">${esc(w.type)}</p>` : ''}
    ${exampleHTML(w)}
    ${w.note ? `<p class="note"><span aria-hidden="true">💡</span> ${esc(w.note)}</p>` : ''}`;
}

/* ----- flashcards ----- */

function renderFlash(root, s, card, head, rerender) {
  root.innerHTML = s.revealed
    ? `${head}
      <div class="card revealed" id="card" tabindex="-1" aria-label="Answer. Swipe right if you knew it, left for again.">
        ${label(card)}${promptHTML(card)}
        <div class="card-answer">${detailsHTML(card)}</div>
      </div>
      <div class="rate">
        <button class="btn btn-again" type="button" id="again"><span aria-hidden="true">↻</span> Again</button>
        <button class="btn btn-knew" type="button" id="knew"><span aria-hidden="true">✓</span> I knew it</button>
      </div>
      <p class="muted small center swipe-hint" aria-hidden="true">or swipe ← again · knew it →</p>`
    : `${head}
      <button class="card" type="button" id="card" aria-expanded="false">
        ${label(card)}<p class="card-prompt"${card.dir === 'vi-en' ? ' lang="vi"' : ''}>${esc(promptText(card))}</p>
        <p class="card-hint muted">Tap to show answer</p>
      </button>
      <div class="rate rate-hidden" aria-hidden="true">
        <button class="btn btn-again" type="button" disabled tabindex="-1">↻ Again</button>
        <button class="btn btn-knew" type="button" disabled tabindex="-1">✓ I knew it</button>
      </div>`;

  const cardEl = /** @type {HTMLElement} */ (root.querySelector('#card'));
  if (!s.revealed) {
    cardEl.addEventListener('click', () => {
      s.revealed = true;
      rerender();
    });
  } else {
    root.querySelector('#knew')?.addEventListener('click', () => answer(true, rerender));
    root.querySelector('#again')?.addEventListener('click', () => answer(false, rerender));
    enableSwipe(cardEl, (knew) => answer(knew, rerender));
  }
  cardEl.focus({ preventScroll: true });
}

/**
 * Swipe right = knew it, left = again. Vertical movement still scrolls the page (touch-action: pan-y).
 * @param {HTMLElement} el
 * @param {(knew: boolean) => void} onSwipe
 */
function enableSwipe(el, onSwipe) {
  /** @type {{ x: number, y: number, id: number, active: boolean } | null} */
  let start = null;
  let dx = 0;
  const reset = () => {
    el.style.transform = '';
    el.removeAttribute('data-swipe');
    start = null;
    dx = 0;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button')) return; // speaker buttons
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  });
  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return reset(); // vertical scroll
      if (Math.abs(dx) < 12) return;
      start.active = true;
      try {
        el.setPointerCapture(e.pointerId); // keep receiving moves when the finger leaves the card
      } catch {
        /* pointer already gone – the swipe still works without capture */
      }
    }
    el.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    if (Math.abs(dx) > SWIPE_DISTANCE) el.dataset.swipe = dx > 0 ? 'knew' : 'again';
    else el.removeAttribute('data-swipe');
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const done = start.active && Math.abs(dx) > SWIPE_DISTANCE;
    const knew = dx > 0;
    reset();
    if (done) onSwipe(knew);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', reset);
}

/* ----- typing ----- */

function renderTyping(root, s, card, head, rerender) {
  const fb = s.feedback;
  root.innerHTML = `${head}
    <div class="card quiz-card" id="card">${label(card)}<p class="card-prompt">${esc(card.word.english)}</p></div>
    <form id="type-form" class="type-form" autocomplete="off">
      <label class="visually-hidden" for="answer">Your answer in Vietnamese</label>
      <input id="answer" class="input input-answer" type="text" lang="vi" placeholder="Type in Vietnamese"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"
        ${fb ? `value="${esc(fb.typed)}" readonly` : ''}>
      ${
        fb
          ? ''
          : `<div class="vi-keys" role="group" aria-label="Vietnamese letters and tones">
              ${TONES.map((t) => `<button type="button" class="key key-tone" data-tone="${t.mark}" aria-label="Tone ${t.name}">${t.label}</button>`).join('')}
              ${LETTERS.map((l) => `<button type="button" class="key" data-char="${l}" aria-label="Insert ${l}">${l}</button>`).join('')}
            </div>
            <p class="muted small hint">Tone buttons put the mark on the right vowel of the word you're typing.</p>
            <button class="btn btn-primary btn-block" type="submit">Check</button>`
      }
    </form>
    ${fb ? feedbackHTML(card, fb) : ''}`;

  const input = /** @type {HTMLInputElement} */ (root.querySelector('#answer'));
  if (!fb) {
    root.querySelector('#type-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return input.focus();
      const result = checkAnswer(input.value, card.word.vietnamese);
      record(result !== 'wrong');
      s.feedback = { result, typed: input.value };
      rerender();
    });
    const keys = /** @type {HTMLElement} */ (root.querySelector('.vi-keys'));
    // Keep the focus (and the phone keyboard) in the input while tapping helper keys.
    keys.addEventListener('mousedown', (e) => e.preventDefault());
    keys.addEventListener('click', (e) => {
      const btn = e.target instanceof Element ? e.target.closest('button') : null;
      if (!btn) return;
      const pos = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? pos;
      const tone = btn.getAttribute('data-tone');
      if (tone) {
        const r = applyTone(input.value, pos, tone);
        if (r) {
          input.value = r.value;
          input.setSelectionRange(r.cursor, r.cursor);
        }
      } else {
        const ch = btn.getAttribute('data-char') || '';
        input.setRangeText(ch, pos, end, 'end');
      }
      input.focus();
    });
    input.focus({ preventScroll: true });
  }
  bindNext(root, rerender);
}

/* ----- typing feedback ----- */

function feedbackHTML(/** @type {Card} */ card, /** @type {Feedback} */ fb) {
  const w = card.word;
  let title;
  let body = '';
  if (fb.result === 'exact') title = '<span aria-hidden="true">✓</span> Correct';
  else if (fb.result === 'almost') {
    title = '<span aria-hidden="true">✓</span> Almost – check the tones';
    body = `<p>Correct spelling: <strong class="answer-hl" lang="vi">${highlightDiacritics(fb.typed || '', w.vietnamese)}</strong></p>
      <p class="muted small">Highlighted letters have different marks from what you typed.</p>`;
  } else {
    title = '<span aria-hidden="true">✗</span> Wrong';
    body = `${fb.typed ? `<p class="muted small">You typed: <span lang="vi">${esc(fb.typed)}</span></p>` : ''}
      <p class="muted small">Right answer:</p>`;
  }
  return `<section class="feedback feedback-${fb.result === 'wrong' ? 'wrong' : 'right'}" role="status">
      <p class="feedback-title">${title}</p>
      ${body}
      <div class="feedback-details">${detailsHTML(card, fb.result !== 'almost')}</div>
    </section>
    <button class="btn btn-primary btn-block" type="button" id="next">Next</button>`;
}

function bindNext(root, rerender) {
  const next = /** @type {HTMLButtonElement | null} */ (root.querySelector('#next'));
  if (!next) return;
  next.addEventListener('click', () => {
    const s = session;
    if (!s || !s.feedback) return;
    const correct = s.feedback.result !== 'wrong';
    s.feedback = null;
    advance(correct);
    rerender();
  });
  next.focus({ preventScroll: true });
}

/* ---------- scoring ---------- */

/** Save the rating. Only the first rating of a word in a session changes its long-term level. */
function record(/** @type {boolean} */ knew) {
  const s = session;
  if (!s) return;
  const id = s.queue[0].word.id;
  const first = !s.known.has(id) && !s.missed.has(id);
  if (first) progress.rate(id, knew);
  if (!knew) s.missed.add(id);
  else if (first) s.known.add(id);
}

/** Move to the next card; a wrong card comes back a few cards later. */
function advance(/** @type {boolean} */ knew) {
  const s = session;
  if (!s) return;
  const card = /** @type {Card} */ (s.queue.shift());
  if (knew) s.cleared++;
  else s.queue.splice(Math.min(AGAIN_GAP, s.queue.length), 0, card);
  s.revealed = false;
}

/** Flashcard rating: record + advance. */
function answer(/** @type {boolean} */ knew, /** @type {() => void} */ rerender) {
  if (!session || !session.revealed) return;
  record(knew);
  advance(knew);
  rerender();
}

/* ---------- summary ---------- */

/** @param {HTMLElement} root @param {Session} s @param {any} data */
function renderSummary(root, s, data) {
  const answered = s.known.size + s.missed.size;
  const missedCards = s.all.filter((c) => s.missed.has(c.word.id));
  const streak = progress.getStreak();

  root.innerHTML = `
    <section class="panel center">
      <h2 class="summary-title">Session complete</h2>
      <div class="stats stats-2">
        <div class="stat"><span class="stat-num"><span aria-hidden="true">✓ </span>${s.known.size}</span><span class="stat-label">known</span></div>
        <div class="stat"><span class="stat-num"><span aria-hidden="true">↻ </span>${s.missed.size}</span><span class="stat-label">need practice</span></div>
      </div>
      ${answered < s.total ? `<p class="muted small">${s.total - answered} cards skipped</p>` : ''}
      ${streak.count ? `<p><span aria-hidden="true">🔥</span> ${streak.count}-day streak</p>` : ''}
    </section>
    ${
      missedCards.length
        ? `<h2 class="section-title">Need practice</h2>
           <ul class="word-list">${missedCards
             .map(
               (c) => `<li><a class="word-row" href="#/words/${encodeURIComponent(c.word.id)}">
                 <span class="vi" lang="vi">${esc(c.word.vietnamese)}</span><span class="en">${esc(c.word.english)}</span><span></span></a></li>`,
             )
             .join('')}</ul>
           <button class="btn btn-primary btn-block" type="button" id="retry">Practice these again</button>`
        : ''
    }
    <a class="btn btn-block${missedCards.length ? '' : ' btn-primary'}" href="#/train" id="new">New session</a>
  `;

  root.querySelector('#retry')?.addEventListener('click', () => {
    startSession(
      missedCards.map((c) => c.word),
      { dir: s.dir, mode: s.mode },
    );
  });
  root.querySelector('#new')?.addEventListener('click', () => {
    session = null;
  });
}

/* Keyboard shortcuts on desktop:
   flashcards: Space/Enter flips (native button), → = I knew it, ← = Again
   typing: Enter = Next (focused button) */
document.addEventListener('keydown', (e) => {
  if (location.hash !== '#/train/session' || !session || !session.queue.length) return;
  if (e.target instanceof HTMLElement && e.target.matches('input, select, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const click = (sel) => /** @type {HTMLElement|null} */ (document.querySelector(sel))?.click();
  if (session.mode === 'flash' && session.revealed && e.key === 'ArrowRight') click('#knew');
  else if (session.mode === 'flash' && session.revealed && e.key === 'ArrowLeft') click('#again');
  else return;
  e.preventDefault();
});
