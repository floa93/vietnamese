// @ts-check
// Appearance, backup (export / import) and reset of the learning progress.
import * as progress from '../progress.js';
import { today, esc } from '../util.js';
import { speak, voiceInfo } from '../speech.js';
import { getTheme, setTheme } from '../theme.js';

/** @param {HTMLElement} root @param {any} data */
export function render(root, data) {
  const studied = progress.studiedCount();
  const voice = document.documentElement.classList.contains('has-vi-voice');
  const info = voiceInfo();

  const theme = getTheme();
  root.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Appearance</h2>
      <div class="choices choices-2" role="radiogroup" aria-label="Theme">
        <label class="choice"><input type="radio" name="theme" value="light"${theme === 'light' ? ' checked' : ''}><span>☀︎ Light</span></label>
        <label class="choice"><input type="radio" name="theme" value="dark"${theme === 'dark' ? ' checked' : ''}><span>☾ Dark</span></label>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Your progress</h2>
      <p class="muted">Progress is saved only in this browser on this device (${studied} of ${data.words.length} words studied).
        Export it to back it up or move it to another device.</p>
      <button class="btn btn-block" type="button" id="export"><span aria-hidden="true">⬇</span> Export progress</button>
      <label class="btn btn-block file-btn"><span aria-hidden="true">⬆</span> Import progress
        <input type="file" id="import" accept="application/json,.json" class="visually-hidden"></label>
      <div id="import-confirm" hidden></div>
      <p id="msg" class="msg" role="status"></p>
    </section>

    <section class="panel">
      <h2 class="panel-title">Reset</h2>
      <p class="muted">Delete all learning progress and your streak on this device. Words are not affected.</p>
      <button class="btn btn-block btn-danger" type="button" id="reset">Reset all progress…</button>
      <div id="reset-confirm" hidden>
        <p><strong>Really delete all progress?</strong> This cannot be undone.</p>
        <div class="row-2">
          <button class="btn" type="button" id="reset-cancel">Cancel</button>
          <button class="btn btn-danger-solid" type="button" id="reset-yes">Yes, reset</button>
        </div>
      </div>
      <p id="reset-msg" class="msg msg-ok" role="status"></p>
    </section>

    <section class="panel">
      <h2 class="panel-title">Pronunciation</h2>
      <p class="muted">${
        voice
          ? 'A Vietnamese voice is available – tap 🔊 next to a word to hear it.'
          : 'No Vietnamese voice was found on this device, so speaker buttons are hidden. You can add one in your phone’s accessibility / text-to-speech settings.'
      }</p>
      ${
        voice
          ? `<p class="muted">Voice: ${esc(info?.name)} (${esc(info?.lang)})</p>
      <button class="btn btn-block" type="button" id="test-voice"><span aria-hidden="true">🔊</span> Test voice</button>
      <p id="voice-msg" class="msg" role="status"></p>`
          : ''
      }
    </section>
  `;

  root.querySelectorAll('input[name="theme"]').forEach((el) =>
    el.addEventListener('change', (e) => {
      const value = /** @type {HTMLInputElement} */ (e.target).value;
      setTheme(value === 'dark' ? 'dark' : 'light');
    }),
  );

  const msg = /** @type {HTMLElement} */ (root.querySelector('#msg'));
  const say = (text, ok = true) => {
    msg.textContent = text;
    msg.className = `msg ${ok ? 'msg-ok' : 'msg-error'}`;
  };

  root.querySelector('#export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(progress.exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vietnamese-progress-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    say(`✓ Exported progress for ${progress.studiedCount()} words.`);
  });

  const fileInput = /** @type {HTMLInputElement} */ (root.querySelector('#import'));
  const importBox = /** @type {HTMLElement} */ (root.querySelector('#import-confirm'));
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let parsed;
    try {
      parsed = progress.parseImport(JSON.parse(await file.text()));
    } catch (err) {
      importBox.hidden = true;
      say(`✗ Import failed: ${err instanceof SyntaxError ? 'the file is not valid JSON.' : err instanceof Error ? err.message : err}`, false);
      return;
    }
    const n = Object.keys(parsed.progress).length;
    say('');
    importBox.hidden = false;
    importBox.innerHTML = `
      <p><strong>Replace your current progress (${progress.studiedCount()} words) with the file (${n} ${n === 1 ? 'word' : 'words'})?</strong></p>
      <div class="row-2">
        <button class="btn" type="button" id="import-cancel">Cancel</button>
        <button class="btn btn-primary" type="button" id="import-yes">Replace</button>
      </div>`;
    importBox.querySelector('#import-cancel')?.addEventListener('click', () => {
      importBox.hidden = true;
    });
    importBox.querySelector('#import-yes')?.addEventListener('click', () => {
      progress.importData(parsed);
      importBox.hidden = true;
      say(`✓ Imported progress for ${n} ${n === 1 ? 'word' : 'words'}.`);
    });
  });

  const resetBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#reset'));
  const resetBox = /** @type {HTMLElement} */ (root.querySelector('#reset-confirm'));
  resetBtn.addEventListener('click', () => {
    resetBtn.hidden = true;
    resetBox.hidden = false;
    /** @type {HTMLElement|null} */ (root.querySelector('#reset-cancel'))?.focus();
  });
  root.querySelector('#reset-cancel')?.addEventListener('click', () => {
    resetBox.hidden = true;
    resetBtn.hidden = false;
  });
  root.querySelector('#reset-yes')?.addEventListener('click', () => {
    progress.resetAll();
    resetBox.hidden = true;
    resetBtn.hidden = false;
    /** @type {HTMLElement} */ (root.querySelector('#reset-msg')).textContent = '✓ All progress has been reset.';
  });

  const voiceMsg = /** @type {HTMLElement|null} */ (root.querySelector('#voice-msg'));
  root.querySelector('#test-voice')?.addEventListener('click', () => {
    if (!voiceMsg) return;
    voiceMsg.className = 'msg';
    voiceMsg.textContent = 'Speaking…';
    speak('Xin chào, bạn khỏe không?', (error) => {
      voiceMsg.className = `msg ${error ? 'msg-error' : 'msg-ok'}`;
      voiceMsg.textContent = error
        ? `✗ Speech failed (${error}). Check that Vietnamese voice data is downloaded in your phone’s text-to-speech settings (Google or Samsung engine), and that media volume is up.`
        : '✓ Done. If you heard nothing, turn up the media volume.';
    });
  });

  return 'Settings';
}
