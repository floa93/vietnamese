// @ts-check
// Loads the vocabulary from data/words.json.

/**
 * @typedef {Object} Word
 * @property {string} id
 * @property {string} vietnamese
 * @property {string} english
 * @property {string} topic
 * @property {string} [type]
 * @property {string} [example_vi]
 * @property {string} [example_en]
 * @property {string} [note]
 * @property {string} [added]
 */

/** @type {{ topics: string[], words: Word[], byId: Map<string, Word> } | null} */
let cache = null;

export async function loadData() {
  if (cache) return cache;
  // "no-cache" revalidates with the server, so newly pushed words show up right away.
  const res = await fetch('data/words.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load words (HTTP ${res.status})`);
  const json = await res.json();
  /** @type {Word[]} */
  const words = json.words || [];
  // Topic order comes from the file; any topic used by a word but not listed is appended.
  const topics = [...(json.topics || [])];
  for (const w of words) if (!topics.includes(w.topic)) topics.push(w.topic);
  cache = { topics, words, byId: new Map(words.map((w) => [w.id, w])) };
  return cache;
}
