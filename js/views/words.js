// @ts-check
import * as progress from '../progress.js';
import { speakButton } from '../speech.js';
import { esc, fold, isRecent } from '../util.js';

// Filter state lives at module level so it survives opening a word and coming back.
let query = '';
let topicFilter = '';
let sortBy = 'topic';
let savedScroll = 0;

const SORTS = {
  topic: 'By topic',
  az: 'A–Z (Vietnamese)',
  newest: 'Newest added',
};

const collator = new Intl.Collator('vi', { sensitivity: 'base' });
const idOrder = new Intl.Collator('en', { numeric: true });

/** @param {any[]} list @param {string[]} topics */
function sortWords(list, topics) {
  const order = new Map(topics.map((t, i) => [t, i]));
  const byFile = (a, b) => a.__i - b.__i;
  const copy = list.slice();
  if (sortBy === 'az') return copy.sort((a, b) => collator.compare(a.vietnamese, b.vietnamese) || byFile(a, b));
  // Same date → higher id first (ids are assigned in the order words are added).
  if (sortBy === 'newest') return copy.sort((a, b) => (b.added || '').localeCompare(a.added || '') || idOrder.compare(b.id, a.id));
  return copy.sort((a, b) => (order.get(a.topic) ?? 99) - (order.get(b.topic) ?? 99) || byFile(a, b));
}

/** @param {HTMLElement} root @param {any} data */
export function renderList(root, data) {
  const { words, topics } = data;
  words.forEach((w, i) => (w.__i ??= i));

  root.innerHTML = `
    <div class="filters">
      <label class="visually-hidden" for="search">Search words</label>
      <input id="search" class="input filters-search" type="search" placeholder="Search English or Vietnamese"
        autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(query)}">
      <label class="visually-hidden" for="topic">Topic</label>
      <select id="topic" class="input">
        <option value="">All topics</option>
        ${topics.map((t) => `<option value="${esc(t)}"${t === topicFilter ? ' selected' : ''}>${esc(t)}</option>`).join('')}
      </select>
      <label class="visually-hidden" for="sort">Sort</label>
      <select id="sort" class="input">
        ${Object.entries(SORTS)
          .map(([k, label]) => `<option value="${k}"${k === sortBy ? ' selected' : ''}>${label}</option>`)
          .join('')}
      </select>
    </div>
    <p class="muted small" id="count" aria-live="polite"></p>
    <ul class="word-list" id="list"></ul>
  `;

  const search = /** @type {HTMLInputElement} */ (root.querySelector('#search'));
  const topicSel = /** @type {HTMLSelectElement} */ (root.querySelector('#topic'));
  const sortSel = /** @type {HTMLSelectElement} */ (root.querySelector('#sort'));
  const list = /** @type {HTMLElement} */ (root.querySelector('#list'));
  const count = /** @type {HTMLElement} */ (root.querySelector('#count'));

  const update = () => {
    const q = fold(query);
    const shown = sortWords(
      words.filter(
        (w) =>
          (!topicFilter || w.topic === topicFilter) &&
          (!q || fold(w.vietnamese).includes(q) || fold(w.english).includes(q)),
      ),
      topics,
    );
    count.textContent = `${shown.length} ${shown.length === 1 ? 'word' : 'words'}`;
    list.innerHTML = shown.length
      ? shown
          .map(
            (w) => `<li><a class="word-row" href="#/words/${encodeURIComponent(w.id)}">
              <span class="vi" lang="vi">${esc(w.vietnamese)}${isRecent(w.added) ? ' <span class="badge-new">new</span>' : ''}</span>
              <span class="en">${esc(w.english)}</span>
              ${progress.isLearned(w.id) ? '<span class="tick" title="Learned" aria-label="learned">✓</span>' : '<span></span>'}
            </a></li>`,
          )
          .join('')
      : '<li class="muted center empty">No words found.</li>';
  };

  search.addEventListener('input', () => {
    query = search.value;
    update();
  });
  topicSel.addEventListener('change', () => {
    topicFilter = topicSel.value;
    update();
  });
  sortSel.addEventListener('change', () => {
    sortBy = sortSel.value;
    update();
  });
  list.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('.word-row')) savedScroll = window.scrollY;
  });

  update();
  window.scrollTo(0, savedScroll);
  savedScroll = 0;
  return 'Words';
}

/** @param {HTMLElement} root @param {any} data @param {RegExpMatchArray} match */
export function renderDetail(root, data, match) {
  const word = data.byId.get(decodeURIComponent(match[1]));
  if (!word) {
    root.innerHTML = `<div class="panel center"><p>Word not found.</p><a class="btn" href="#/words">Back to list</a></div>`;
    return 'Words';
  }
  const p = progress.get(word.id);
  const status = !p
    ? 'Not studied yet'
    : p.box >= 1
      ? `Learned · level ${p.box} of ${progress.MAX_BOX} · next review ${p.due}`
      : 'Needs practice';

  root.innerHTML = `
    <a class="back" href="#/words">‹ All words</a>
    <article class="panel detail">
      <div class="with-speak">
        <p class="detail-vi" lang="vi">${esc(word.vietnamese)}</p>
        ${speakButton(word.vietnamese, 'Listen to the word')}
      </div>
      <p class="detail-en">${esc(word.english)}</p>
      <p class="tags">
        ${isRecent(word.added) ? '<span class="badge-new">new</span>' : ''}
        ${word.type ? `<span class="tag">${esc(word.type)}</span>` : ''}
        <span class="tag">${esc(word.topic)}</span>
      </p>
      ${exampleHTML(word)}
      ${word.note ? `<p class="note"><span aria-hidden="true">💡</span> ${esc(word.note)}</p>` : ''}
      <p class="muted small">${esc(status)}${word.added ? ` · added ${esc(word.added)}` : ''}</p>
    </article>
  `;
  return 'Words';
}

/** Example sentence block (Vietnamese + English) with a speaker button, or ''. */
export function exampleHTML(word) {
  if (!word.example_vi) return '';
  return `<div class="example">
    <div class="with-speak"><p lang="vi">${esc(word.example_vi)}</p>${speakButton(word.example_vi, 'Listen to the example')}</div>
    ${word.example_en ? `<p class="muted">${esc(word.example_en)}</p>` : ''}
  </div>`;
}
