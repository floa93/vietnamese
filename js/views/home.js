// @ts-check
import * as progress from '../progress.js';
import { esc } from '../util.js';
import { startSession } from './train.js';

/** @param {HTMLElement} root @param {any} data */
export function render(root, data) {
  const { words, topics } = data;
  const learned = words.filter((w) => progress.isLearned(w.id)).length;
  const due = words.filter((w) => progress.isDue(w.id));
  const fresh = words.filter((w) => progress.isNew(w.id)).length;
  const streak = progress.getStreak();

  const primary = due.length
    ? `<button class="btn btn-primary btn-block" type="button" id="review-due">Review due words (${due.length})</button>`
    : `<a class="btn btn-primary btn-block" href="#/train">${fresh === words.length ? 'Start learning' : 'Train'}</a>`;

  const streakText = streak.count
    ? `<span aria-hidden="true">🔥</span> <strong>${streak.count}-day streak</strong>${
        streak.practicedToday ? '' : ' · practise today to keep it'
      }${streak.best > streak.count ? ` · best ${streak.best}` : ''}`
    : `<span aria-hidden="true">🔥</span> No streak yet – practise today to start one${streak.best ? ` · best ${streak.best}` : ''}`;

  const topicRows = topics
    .map((t) => {
      const inTopic = words.filter((w) => w.topic === t);
      const n = inTopic.filter((w) => progress.isLearned(w.id)).length;
      const pct = inTopic.length ? Math.round((n / inTopic.length) * 100) : 0;
      return `<li class="topic-row">
        <div class="topic-row-head"><span>${esc(t)}</span><span class="muted">${n} / ${inTopic.length} learned</span></div>
        <div class="bar" role="progressbar" aria-label="${esc(t)}" aria-valuemin="0" aria-valuemax="${inTopic.length}" aria-valuenow="${n}"><span style="width:${pct}%"></span></div>
      </li>`;
    })
    .join('');

  root.innerHTML = `
    <section class="stats" aria-label="Overview">
      <div class="stat"><span class="stat-num">${words.length}</span><span class="stat-label">words</span></div>
      <div class="stat"><span class="stat-num">${learned}</span><span class="stat-label">learned</span></div>
      <div class="stat"><span class="stat-num">${due.length}</span><span class="stat-label">due today</span></div>
    </section>
    <p class="streak">${streakText}</p>
    ${primary}
    <h2 class="section-title">Topics</h2>
    <ul class="topic-list">${topicRows}</ul>
    <a class="btn btn-ghost btn-block" href="#/settings">Backup &amp; settings</a>
  `;

  root.querySelector('#review-due')?.addEventListener('click', () => {
    startSession(due, { dir: 'mixed', mode: 'flash', pool: words });
  });

  return 'Vietnamese';
}
