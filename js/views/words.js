// @ts-check
import * as progress from '../progress.js';
import { esc, fold } from '../util.js';

// Filter state lives at module level so it survives opening a word and coming back.
let query = '';
let topicFilter = '';
let savedScroll = 0;

/** @param {HTMLElement} root @param {any} data */
export function renderList(root, data) {
  const { words, topics } = data;

  root.innerHTML = `
    <div class="filters">
      <label class="visually-hidden" for="search">Search words</label>
      <input id="search" class="input" type="search" placeholder="Search English or Vietnamese"
        autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(query)}">
      <label class="visually-hidden" for="topic">Topic</label>
      <select id="topic" class="input">
        <option value="">All topics</option>
        ${topics.map((t) => `<option value="${esc(t)}"${t === topicFilter ? ' selected' : ''}>${esc(t)}</option>`).join('')}
      </select>
    </div>
    <p class="muted small" id="count" aria-live="polite"></p>
    <ul class="word-list" id="list"></ul>
  `;

  const search = /** @type {HTMLInputElement} */ (root.querySelector('#search'));
  const select = /** @type {HTMLSelectElement} */ (root.querySelector('#topic'));
  const list = /** @type {HTMLElement} */ (root.querySelector('#list'));
  const count = /** @type {HTMLElement} */ (root.querySelector('#count'));

  const update = () => {
    const q = fold(query);
    const shown = words.filter(
      (w) =>
        (!topicFilter || w.topic === topicFilter) &&
        (!q || fold(w.vietnamese).includes(q) || fold(w.english).includes(q)),
    );
    count.textContent = `${shown.length} ${shown.length === 1 ? 'word' : 'words'}`;
    list.innerHTML = shown.length
      ? shown
          .map(
            (w) => `<li><a class="word-row" href="#/words/${encodeURIComponent(w.id)}">
              <span class="vi" lang="vi">${esc(w.vietnamese)}</span>
              <span class="en">${esc(w.english)}</span>
              ${progress.isLearned(w.id) ? '<span class="tick" title="Learned" aria-label="learned">✓</span>' : ''}
            </a></li>`,
          )
          .join('')
      : '<li class="muted center empty">No words found.</li>';
  };

  search.addEventListener('input', () => {
    query = search.value;
    update();
  });
  select.addEventListener('change', () => {
    topicFilter = select.value;
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
  const status = !p ? 'Not studied yet' : p.box >= 1 ? `Learned · level ${p.box} of ${progress.MAX_BOX} · next review ${p.due}` : 'Needs practice';

  root.innerHTML = `
    <a class="back" href="#/words">‹ All words</a>
    <article class="panel detail">
      <p class="detail-vi" lang="vi">${esc(word.vietnamese)}</p>
      <p class="detail-en">${esc(word.english)}</p>
      <p class="tags">
        ${word.type ? `<span class="tag">${esc(word.type)}</span>` : ''}
        <span class="tag">${esc(word.topic)}</span>
      </p>
      ${
        word.example_vi
          ? `<div class="example"><p lang="vi">${esc(word.example_vi)}</p>${word.example_en ? `<p class="muted">${esc(word.example_en)}</p>` : ''}</div>`
          : ''
      }
      ${word.note ? `<p class="note"><span aria-hidden="true">💡</span> ${esc(word.note)}</p>` : ''}
      <p class="muted small">${esc(status)}</p>
    </article>
  `;

  return 'Words';
}
