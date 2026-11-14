// @ts-check
// Entry point: loads data and routes between screens using the URL hash
// (#/, #/words, #/words/<id>, #/train, #/train/session). Hash routing works on
// GitHub Pages without any server configuration.

import { loadData } from './data.js';
import { initSpeech } from './speech.js';
import { esc } from './util.js';
import * as home from './views/home.js';
import * as words from './views/words.js';
import * as train from './views/train.js';
import * as settings from './views/settings.js';

/** @type {[RegExp, (root: HTMLElement, data: any, match: RegExpMatchArray) => string, string][]} */
const routes = [
  [/^#?\/?$/, home.render, 'home'],
  [/^#\/words$/, words.renderList, 'words'],
  [/^#\/words\/([^/]+)$/, words.renderDetail, 'words'],
  [/^#\/train$/, train.renderSetup, 'train'],
  [/^#\/train\/session$/, train.renderSession, 'train'],
  [/^#\/settings$/, settings.render, 'settings'],
];

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const titleEl = /** @type {HTMLElement} */ (document.getElementById('page-title'));

async function route() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    root.innerHTML = `<div class="panel center"><p><strong>Could not load the word list.</strong></p>
      <p class="muted">${esc(err instanceof Error ? err.message : err)}</p>
      <button class="btn" type="button" onclick="location.reload()">Try again</button></div>`;
    return;
  }

  const hash = location.hash || '#/';
  const found = routes.find(([re]) => re.test(hash));
  if (!found) {
    location.replace('#/');
    return;
  }
  const [re, render, tab] = found;
  const match = /** @type {RegExpMatchArray} */ (hash.match(re));

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const active = a.getAttribute('data-tab') === tab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const title = render(root, data, match);
  titleEl.textContent = title;
  document.title = title === 'Vietnamese' ? 'Vietnamese Trainer' : `${title} · Vietnamese Trainer`;
}

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0);
});
initSpeech();
route();
