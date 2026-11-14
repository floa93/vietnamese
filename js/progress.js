// @ts-check
// Learning progress, stored in localStorage and keyed by word id.
// Words that are added later simply have no entry yet, so existing progress is never affected.

import { today, addDays } from './util.js';

const KEY = 'vt.progress.v1';
const STREAK_KEY = 'vt.streak.v1';

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

/** @typedef {{ last: string, count: number, best: number }} Streak */

/** @type {Record<string, WordProgress>} */
let state = readJSON(KEY, {});
/** @type {Streak} */
let streak = readJSON(STREAK_KEY, { last: '', count: 0, best: 0 });

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
  writeJSON(KEY, state);
  touchStreak(t);
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

export function studiedCount() {
  return Object.keys(state).length;
}

/* ---------- daily streak ---------- */

/** @param {string} t today */
function touchStreak(t) {
  if (streak.last === t) return;
  streak.count = streak.last === addDays(t, -1) ? streak.count + 1 : 1;
  streak.last = t;
  streak.best = Math.max(streak.best || 0, streak.count);
  writeJSON(STREAK_KEY, streak);
}

/** Current streak: days in a row with at least one rating, ending today or yesterday. */
export function getStreak() {
  const t = today();
  const alive = streak.last === t || streak.last === addDays(t, -1);
  return { count: alive ? streak.count : 0, best: streak.best || 0, practicedToday: streak.last === t };
}

/* ---------- export / import / reset ---------- */

export function exportData() {
  return { app: 'vietnamese-trainer', version: 1, exported: new Date().toISOString(), progress: state, streak };
}

/**
 * Validate an imported file. Returns the cleaned data or throws a readable error.
 * @param {any} data
 */
export function parseImport(data) {
  if (!data || typeof data !== 'object' || data.app !== 'vietnamese-trainer' || typeof data.progress !== 'object') {
    throw new Error('This is not a progress file from this app.');
  }
  /** @type {Record<string, WordProgress>} */
  const progress = {};
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  for (const [id, p] of Object.entries(data.progress)) {
    if (!p || !Number.isInteger(p.box) || p.box < 0 || p.box > MAX_BOX || !isDate(p.due) || !isDate(p.last)) {
      throw new Error(`Invalid entry for word "${id}".`);
    }
    progress[id] = { box: p.box, last: p.last, due: p.due, reviews: Number(p.reviews) || 0, correct: Number(p.correct) || 0 };
  }
  const s = data.streak;
  const cleanStreak =
    s && isDate(s.last) ? { last: s.last, count: Number(s.count) || 0, best: Number(s.best) || 0 } : { last: '', count: 0, best: 0 };
  return { progress, streak: cleanStreak };
}

/** Replace all progress with imported data (already validated by parseImport). */
export function importData({ progress, streak: s }) {
  state = progress;
  streak = s;
  writeJSON(KEY, state);
  writeJSON(STREAK_KEY, streak);
}

export function resetAll() {
  state = {};
  streak = { last: '', count: 0, best: 0 };
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(STREAK_KEY);
  } catch {
    /* ignore */
  }
}
