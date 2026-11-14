// @ts-check
import * as progress from '../progress.js';
import { esc, shuffle } from '../util.js';

const SETTINGS_KEY = 'vt.settings.v1';
/** How many cards later an "Again" card comes back. */
const AGAIN_GAP = 3;

/** @typedef {'en-vi' | 'vi-en' | 'mixed'} Direction */
/** @typedef {{ word: import('../data.js').Word, dir: 'en-vi' | 'vi-en' }} Card */

/**
 * @typedef {Object} Session
 * @property {Card[]} queue       cards still to answer; queue[0] is the current card
 * @property {number} total
 * @property {number} cleared     cards answered "I knew it"
 * @property {Set<string>} known  ids known on the first try
 * @property {Set<string>} missed ids rated "Again" at least once
 * @property {Card[]} all         every card in the session (for "practice again")
 * @property {boolean} revealed
 */

/** @type {Session | null} */
let session = null;

/* ---------- settings ---------- */

function loadSettings() {
  const defaults = { pool: 'all', topics: /** @type {string[]|null} */ (null), dir: 'en-vi', length: '20' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
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
 * Start a new session with the given words and go to the session screen.
 * @param {import('../data.js').Word[]} words
 * @param {Direction} dir
 */
export function startSession(words, dir) {
  const cards = shuffle(words).map((word) => ({
    word,
    dir: /** @type {'en-vi'|'vi-en'} */ (dir === 'mixed' ? (Math.random() < 0.5 ? 'en-vi' : 'vi-en') : dir),
  }));
  session = {
    queue: cards.slice(),
    all: cards,
    total: cards.length,
    cleared: 0,
    known: new Set(),
    missed: new Set(),
    revealed: false,
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

      <fieldset>
        <legend>Direction</legend>
        <div class="choices">
          ${radio('dir', 'en-vi', 'EN → VI', s.dir === 'en-vi')}
          ${radio('dir', 'vi-en', 'VI → EN', s.dir === 'vi-en')}
          ${radio('dir', 'mixed', 'Mixed', s.dir === 'mixed')}
        </div>
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
  const topicBoxes = /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll('input[name="topic"]')]);

  const read = () => {
    const fd = new FormData(form);
    return {
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
    for (const t of topics) {
      const el = root.querySelector(`[data-count="${CSS.escape(t)}"]`);
      if (el) el.textContent = String(words.filter((w) => w.topic === t && inPool(r.pool)(w)).length);
    }
    startBtn.disabled = n === 0;
    startBtn.textContent = n === 0 ? (r.topics.length ? 'No words match' : 'Choose a topic') : `Start · ${n} ${n === 1 ? 'card' : 'cards'}`;
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
    startSession(shuffle(candidates).slice(0, n), r.dir);
  });

  refresh();
  return 'Train';
}

/* ---------- session screen ---------- */

/** @param {HTMLElement} root @param {any} data */
export function renderSession(root, data) {
  if (!session) {
    location.replace('#/train');
    return 'Train';
  }
  const s = session;

  if (s.queue.length === 0) {
    renderSummary(root, s);
    return 'Done';
  }

  const card = s.queue[0];
  const w = card.word;
  const toVi = card.dir === 'en-vi';
  const pct = Math.round((s.cleared / s.total) * 100);

  const prompt = toVi
    ? `<p class="card-label">English → Vietnamese</p><p class="card-prompt">${esc(w.english)}</p>`
    : `<p class="card-label">Vietnamese → English</p><p class="card-prompt" lang="vi">${esc(w.vietnamese)}</p>`;

  const answer = s.revealed
    ? `<div class="card-answer">
        <p class="card-solution"${toVi ? ' lang="vi"' : ''}>${esc(toVi ? w.vietnamese : w.english)}</p>
        ${w.type ? `<p class="muted small">${esc(w.type)}</p>` : ''}
        ${w.example_vi ? `<div class="example"><p lang="vi">${esc(w.example_vi)}</p>${w.example_en ? `<p class="muted">${esc(w.example_en)}</p>` : ''}</div>` : ''}
        ${w.note ? `<p class="note"><span aria-hidden="true">💡</span> ${esc(w.note)}</p>` : ''}
      </div>`
    : `<p class="card-hint muted">Tap to show answer</p>`;

  root.innerHTML = `
    <div class="session-head">
      <span class="session-count" aria-live="polite">${s.cleared} / ${s.total}</span>
      <div class="bar bar-grow" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <button class="btn btn-ghost btn-small" type="button" id="end">End</button>
    </div>
    <button class="card${s.revealed ? ' revealed' : ''}" type="button" id="card" aria-expanded="${s.revealed}">
      ${prompt}
      ${answer}
    </button>
    <div class="rate${s.revealed ? '' : ' rate-hidden'}">
      <button class="btn btn-again" type="button" id="again"${s.revealed ? '' : ' disabled'}><span aria-hidden="true">↻</span> Again</button>
      <button class="btn btn-knew" type="button" id="knew"${s.revealed ? '' : ' disabled'}><span aria-hidden="true">✓</span> I knew it</button>
    </div>
  `;

  const rerender = () => renderSession(root, data);

  root.querySelector('#card')?.addEventListener('click', () => {
    s.revealed = !s.revealed;
    rerender();
  });
  root.querySelector('#knew')?.addEventListener('click', () => answerCard(true, rerender));
  root.querySelector('#again')?.addEventListener('click', () => answerCard(false, rerender));
  root.querySelector('#end')?.addEventListener('click', () => {
    // Unanswered cards are simply dropped; ratings given so far are already saved.
    s.queue = [];
    rerender();
  });

  // Keep focus on the card so a double key press can't accidentally rate it.
  /** @type {HTMLElement|null} */ (root.querySelector('#card'))?.focus({ preventScroll: true });
  return 'Train';
}

/**
 * @param {boolean} knew
 * @param {() => void} rerender
 */
function answerCard(knew, rerender) {
  const s = session;
  if (!s || !s.revealed) return;
  const card = /** @type {Card} */ (s.queue.shift());
  const id = card.word.id;
  const firstRating = !s.known.has(id) && !s.missed.has(id);

  // Only the first rating in a session changes the long-term level.
  if (firstRating) progress.rate(id, knew);

  if (knew) {
    s.cleared++;
    if (firstRating) s.known.add(id);
  } else {
    s.missed.add(id);
    s.queue.splice(Math.min(AGAIN_GAP, s.queue.length), 0, card);
  }
  s.revealed = false;
  rerender();
}

/** @param {HTMLElement} root @param {Session} s */
function renderSummary(root, s) {
  const answered = s.known.size + s.missed.size;
  const missedCards = s.all.filter((c) => s.missed.has(c.word.id));

  root.innerHTML = `
    <section class="panel center">
      <h2 class="summary-title">Session complete</h2>
      <div class="stats stats-2">
        <div class="stat"><span class="stat-num"><span aria-hidden="true">✓ </span>${s.known.size}</span><span class="stat-label">known</span></div>
        <div class="stat"><span class="stat-num"><span aria-hidden="true">↻ </span>${s.missed.size}</span><span class="stat-label">need practice</span></div>
      </div>
      ${answered < s.total ? `<p class="muted small">${s.total - answered} cards skipped</p>` : ''}
    </section>
    ${
      missedCards.length
        ? `<h2 class="section-title">Need practice</h2>
           <ul class="word-list">${missedCards
             .map(
               (c) => `<li><a class="word-row" href="#/words/${encodeURIComponent(c.word.id)}">
                 <span class="vi" lang="vi">${esc(c.word.vietnamese)}</span><span class="en">${esc(c.word.english)}</span></a></li>`,
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
      /** @type {Direction} */ (loadSettings().dir),
    );
  });
  root.querySelector('#new')?.addEventListener('click', () => {
    session = null;
  });
}

/* Keyboard shortcuts on desktop: Space/Enter flips, → = I knew it, ← = Again. */
document.addEventListener('keydown', (e) => {
  if (location.hash !== '#/train/session' || !session || !session.queue.length) return;
  if (e.target instanceof HTMLElement && e.target.matches('input, select, textarea')) return;
  const click = (id) => /** @type {HTMLElement|null} */ (document.getElementById(id))?.click();
  if (e.key === 'ArrowRight' && session.revealed) click('knew');
  else if (e.key === 'ArrowLeft' && session.revealed) click('again');
  else return;
  e.preventDefault();
});
