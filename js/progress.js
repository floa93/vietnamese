// @ts-check
// Learning progress, stored in localStorage and keyed by word id.
// Words that are added later simply have no entry yet, so existing progress is never affected.

import { today, addDays } from './util.js';

const KEY = 'vt.progress.v1';

/** Leitner box → days until the word is due again. */
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = INTERVALS.length - 1;

/**
 * @typedef {Object} WordProgress
 * @property {number} box      Leitner box 0–5
 * @property {string} last     date of the last review (YYYY-MM-DD)
 * @property {string} due      date the word is due again (YYYY-MM-DD)
 * @property {number} reviews  total ratings
 * @property {number} correct  "I knew it" ratings
 */

/** @type {Record<string, WordProgress>} */
let state = read();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (e.g. some private modes) – the session still works in memory.
  }
}

/** @param {string} id */
export function get(id) {
  return state[id] || null;
}

/**
 * Record a rating. "I knew it" moves the word up one box, "Again" sends it back to box 0.
 * @param {string} id
 * @param {boolean} knew
 */
export function rate(id, knew) {
  const prev = state[id];
  const box = knew ? Math.min((prev ? prev.box : 0) + 1, MAX_BOX) : 0;
  const t = today();
  state[id] = {
    box,
    last: t,
    due: addDays(t, INTERVALS[box]),
    reviews: (prev ? prev.reviews : 0) + 1,
    correct: (prev ? prev.correct : 0) + (knew ? 1 : 0),
  };
  write();
}

/** A word counts as learned once it has left box 0. */
export function isLearned(id) {
  const p = state[id];
  return !!p && p.box >= 1;
}

/** Due = already studied and its review date has arrived (box 0 is always due). */
export function isDue(id) {
  const p = state[id];
  return !!p && p.due <= today();
}

export function isNew(id) {
  return !state[id];
}
