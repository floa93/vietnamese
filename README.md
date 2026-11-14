# Vietnamese Trainer

A small English ⇄ Vietnamese (Northern / Hanoi) vocabulary trainer. It's a static site in plain HTML, CSS and JavaScript, hosted on GitHub Pages. There is no backend, no login and no build step. Learning progress is stored in your browser.

Live: https://floa93.github.io/vietnamese/

## Features

- **Words**: a list of all words with search (accents optional, so `ca phe` finds `cà phê`), a topic filter, sorting (by topic, A–Z or newest added), a **new** badge for words added in the last 14 days, and a detail view.
- **Train**: three modes, each for all topics or the ones you pick and for 10, 20 or all cards:
  - *Flashcards* in either direction (EN → VI, VI → EN or mixed). Tap to reveal, then *I knew it* / *Again*, or swipe right / left. Cards you mark *Again* come back later in the same session.
  - *Multiple choice*: 4 options, with wrong ones taken from the same topic where possible. You see right/wrong straight away (keys 1–4 work on desktop).
  - *Typing* (EN → VI): an exact answer is correct. If only the accents differ, it counts as "almost" and the letters with different marks are highlighted. Buttons help you type tones and letters without a Vietnamese keyboard: tap a tone button after typing a word and it puts the mark on the right vowel.
- **Progress**: Leitner boxes 0–5. *I knew it* / a correct answer moves a word up one box, and *Again* / a wrong answer sends it back to box 0. A word in box *n* is due again after 0 / 1 / 3 / 7 / 14 / 30 days. Only the first rating of a word in each session counts.
- **Home**: totals, learned words (box ≥ 1), words due today, a daily streak and progress per topic.
- **Backup & settings** (⚙ in the top bar): export progress to a file, import it on another device, or reset everything after a confirmation.
- **Pronunciation**: 🔊 buttons read Vietnamese aloud with the device's built-in voice (`vi-VN`). They are hidden if the device has no Vietnamese voice.

## Project layout

```
index.html               app shell (top bar, <main>, bottom navigation)
css/style.css            all styles; light/dark follows the phone setting
js/app.js                hash router (#/, #/words, #/words/<id>, #/train, #/train/session, #/settings)
js/data.js               loads data/words.json
js/progress.js           Leitner boxes + streak in localStorage, export/import/reset
js/util.js               diacritic folding, shuffle, dates
js/vietnamese.js         typed-answer checking, tone placement for the helper keys
js/speech.js             text-to-speech (Web Speech API)
js/views/*.js            one module per screen
data/words.json          ALL vocabulary – the only file you edit to add words
scripts/validate-data.mjs  data checks (run in CI)
.github/workflows/deploy.yml  validate → deploy to GitHub Pages on push to main
```

## Adding words

1. Open `data/words.json` and add an entry to `"words"`:

   ```json
   { "id": "w124", "vietnamese": "bánh mì", "english": "bread; baguette sandwich",
     "topic": "Order drinks", "type": "noun",
     "example_vi": "Cho tôi một cái bánh mì.", "example_en": "Give me a bánh mì, please.",
     "note": "Classifier: cái.", "added": "2026-11-20" }
   ```

   | field | required | notes |
   |---|---|---|
   | `id` | yes | Unique and **never reused or changed**, because progress is linked to it. Use the next free number. |
   | `vietnamese` | yes | Northern (Hanoi) spelling with full tone marks |
   | `english` | yes | Translation(s), separated by `,` or `;` |
   | `topic` | yes | Must be one of the names in `"topics"`. To add a new topic, add its name there first. |
   | `type` | no | noun, verb, adjective, phrase, pronoun, … |
   | `example_vi` / `example_en` | no | A simple example sentence and its translation |
   | `note` | no | Classifiers, politeness, usage hints |
   | `added` | no | `YYYY-MM-DD` |

2. Commit and push to `main`. The GitHub Action checks the file (valid JSON, required fields, no duplicate ids, no duplicate Vietnamese entries within a topic). If the check passes, it deploys the site. Existing progress is kept because it is stored by `id`.

To run the check locally (needs Node.js): `node scripts/validate-data.mjs`

## Running locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk doesn't work, because browsers block `fetch()` of local files.)

## GitHub Pages setup (one time)

Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
