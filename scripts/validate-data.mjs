#!/usr/bin/env node
// Validates data/words.json. Exits with code 1 and lists all problems if anything is wrong.
// Usage: node scripts/validate-data.mjs [path/to/words.json]

import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'data/words.json';
const REQUIRED = ['id', 'vietnamese', 'english', 'topic'];
const OPTIONAL = ['example_vi', 'example_en', 'type', 'note', 'added'];
const errors = [];

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`✗ ${file} is not valid JSON:\n  ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data.words)) {
  console.error(`✗ ${file}: top-level "words" must be an array`);
  process.exit(1);
}
const topics = Array.isArray(data.topics) ? data.topics : null;
if (!topics) errors.push('top-level "topics" must be an array of topic names');

const ids = new Map();
const viByTopic = new Map();

data.words.forEach((w, i) => {
  const where = `words[${i}]${w && typeof w.id === 'string' ? ` (${w.id})` : ''}`;
  if (!w || typeof w !== 'object' || Array.isArray(w)) {
    errors.push(`${where}: must be an object`);
    return;
  }
  for (const f of REQUIRED) {
    if (typeof w[f] !== 'string' || w[f].trim() === '') errors.push(`${where}: missing or empty "${f}"`);
  }
  for (const f of OPTIONAL) {
    if (f in w && typeof w[f] !== 'string') errors.push(`${where}: "${f}" must be a string`);
  }
  for (const f of Object.keys(w)) {
    if (!REQUIRED.includes(f) && !OPTIONAL.includes(f)) errors.push(`${where}: unknown field "${f}" (typo?)`);
  }
  if (typeof w.added === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(w.added)) {
    errors.push(`${where}: "added" must be YYYY-MM-DD, got "${w.added}"`);
  }
  if (topics && typeof w.topic === 'string' && !topics.includes(w.topic)) {
    errors.push(`${where}: topic "${w.topic}" is not listed in "topics"`);
  }
  if (typeof w.id === 'string') {
    if (ids.has(w.id)) errors.push(`${where}: duplicate id "${w.id}" (also at words[${ids.get(w.id)}])`);
    else ids.set(w.id, i);
  }
  if (typeof w.vietnamese === 'string' && typeof w.topic === 'string') {
    const key = `${w.topic}\u0000${w.vietnamese.normalize('NFC').trim().toLowerCase()}`;
    if (viByTopic.has(key)) {
      errors.push(`${where}: duplicate Vietnamese "${w.vietnamese}" in topic "${w.topic}" (also ${viByTopic.get(key)})`);
    } else viByTopic.set(key, w.id);
  }
});

if (errors.length) {
  console.error(`✗ ${file}: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ ${file}: ${data.words.length} words in ${topics.length} topics, all valid`);
