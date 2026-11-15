/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview JavaScript for index page.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Index');

goog.require('BlocklyGames');
goog.require('BlocklyGames.identity');
goog.require('Index.html');

/**
 * Array of application names.
 */
const APPS = ['puzzle', 'maze', 'bird', 'turtle', 'movie', 'music', 'ai',
              'pond-tutor', 'pond-duck'];
if (window['BlocklyGamesStandalone']) {
  // Pond Duck needs the Ace editor, which the single-file build omits.
  APPS.splice(APPS.indexOf('pond-duck'), 1);
}

/**
 * Render the page and load any progress data.  Called on page load.
 */
function init() {
  // Render the HTML.
  document.body.innerHTML = Index.html.start(
    {lang: BlocklyGames.LANG,
     html: BlocklyGames.IS_HTML,
     rtl: BlocklyGames.IS_RTL});

  BlocklyGames.init('');

  const languageMenu = BlocklyGames.getElementById('languageMenu');
  languageMenu.addEventListener('change', BlocklyGames.changeLanguage, true);

  initIdentity();

  BlocklyGames.bindClick('exportProgress', exportProgress);
  BlocklyGames.bindClick('importProgress', function() {
    BlocklyGames.getElementById('importProgressFile').click();
  });
  const importInput = BlocklyGames.getElementById('importProgressFile');
  importInput.addEventListener('change', function() {
    const file = importInput.files && importInput.files[0];
    if (file) {
      importProgress(file);
    }
    // Allow re-importing the same file after an error.
    importInput.value = '';
  }, false);

  let storedData = false;
  const levelsDone = [];
  for (let i = 0; i < APPS.length; i++) {
    levelsDone[i] = 0;
    for (let j = 1; j <= BlocklyGames.MAX_LEVEL; j++) {
      if (BlocklyGames.loadFromLocalStorage(APPS[i], j)) {
        storedData = true;
        levelsDone[i]++;
      }
    }
  }
  if (storedData) {
    const clearButtonPara = BlocklyGames.getElementById('clearDataPara');
    clearButtonPara.style.visibility = 'visible';
    BlocklyGames.bindClick('clearData', clearData);
  }

  for (let i = 0; i < levelsDone.length; i++) {
    const app = APPS[i];
    const denominator = (i === 0) ? 1 : BlocklyGames.MAX_LEVEL;
    const angle = levelsDone[i] / denominator * 270;
    if (angle) {
      setTimeout(animateGauge, 1500, app, 0, angle);
    } else {
      // Remove gauge if zero, since IE renders a stub.
      const path = BlocklyGames.getElementById('gauge-' + app);
      path.parentNode.removeChild(path);
    }
  }
}

/**
 * Animate a gauge from zero to a target value.
 * @param {string} app Name of application.
 * @param {number} cur Current angle of gauge in degrees.
 * @param {number} max Final angle of gauge in degrees.
 */
function animateGauge(app, cur, max) {
  const step = 4;
  cur += step;
  drawGauge(app, Math.min(cur, max));
  if (cur < max) {
    setTimeout(animateGauge, 10, app, cur, max);
  }
}

/**
 * Draw the gauge for an app.
 * @param {string} app Name of application.
 * @param {number} angle Angle of gauge in degrees.
 */
function drawGauge(app, angle) {
  const xOffset = 150;
  const yOffset = 60;
  const radius = 52.75;
  const theta0 = toRadians(angle - 45);
  const x = xOffset - Math.cos(theta0) * radius;
  const y = yOffset - Math.sin(theta0) * radius;
  const flag = angle > 180 ? 1 : 0;
  // The starting point is at angle zero.
  const theta1 = toRadians(0 - 45);
  const mx = xOffset - Math.cos(theta1) * radius;
  const my = yOffset - Math.sin(theta1) * radius;
  const path = BlocklyGames.getElementById('gauge-' + app);
  path.setAttribute('d',
      ['M', mx, my, 'A', radius, radius, 0, flag, 1, x, y].join(' '));
}

/**
 * Converts degrees to radians.
 * Copied from Closure's goog.math.toRadians.
 * @param {number} angleDegrees Angle in degrees.
 * @return {number} Angle in radians.
 */
function toRadians(angleDegrees) {
  return angleDegrees * Math.PI / 180;
}

/**
 * Minimum and maximum accepted progress-file sizes.
 * The upper bound protects the page from accidentally loading a huge file.
 */
const MAX_PROGRESS_FILE_SIZE = 2 * 1024 * 1024;

/**
 * Show a short message in the progress toolbar.
 * @param {string} text Message to show.
 */
function setProgressStatus(text) {
  const status = BlocklyGames.getElementById('progressStatus');
  if (status) {
    status.textContent = text;
  }
}

/**
 * Read one level's saved value.  Storage can be unavailable on file://.
 * @param {string} app Application name.
 * @param {number} level Level number.
 * @returns {?string} Saved value or null.
 */
function getProgressValue(app, level) {
  try {
    return window.localStorage[app + level] || null;
  } catch (e) {
    return null;
  }
}

/**
 * File format written by exportProgress.  Version 2 adds the locked student
 * identity, the import history and an ECDSA signature over all of it.
 */
const PROGRESS_FORMAT = 'blockly-games-progress';
const PROGRESS_VERSION = 2;

/**
 * True while an export is being signed, so double clicks do not download two
 * files.
 */
let exporting = false;

/**
 * Replace %1..%9 in a message.  Using a callback avoids treating "$&" in a
 * student's name as a replacement pattern.
 * @param {string} template Message template.
 * @param {!Array} values Replacement values.
 * @returns {string} Formatted message.
 */
function formatMessage_(template, values) {
  return template.replace(/%([0-9])/g, function(match, digit) {
    const index = Number(digit) - 1;
    return index >= 0 && index < values.length ? String(values[index]) : match;
  });
}

/**
 * Bind the locked student identity UI and show the dialog on the first visit.
 */
function initIdentity() {
  const form = BlocklyGames.getElementById('studentForm');
  if (!form) {
    return;
  }
  form.addEventListener('submit', saveStudent, true);
  BlocklyGames.bindClick('studentEdit', openStudentDialog);
  BlocklyGames.bindClick('studentLater', closeStudentDialogWithFlag);
  window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' &&
        !BlocklyGames.getElementById('studentDialog').hidden) {
      closeStudentDialogWithFlag();
    }
  }, false);
  updateIdentityUI();
  if (!BlocklyGames.identity.get()) {
    let prompted = false;
    try {
      prompted = window.sessionStorage['blocklyGamesStudentPrompt'] === '1';
    } catch (e) {
      // sessionStorage can be unavailable in private mode or on file://.
    }
    if (!prompted) {
      setTimeout(openStudentDialog, 300);
    }
  }
}

/**
 * Refresh the identity badge, the "set name" button and the import badge.
 */
function updateIdentityUI() {
  const identity = BlocklyGames.identity.get();
  const badge = BlocklyGames.getElementById('studentBadge');
  const edit = BlocklyGames.getElementById('studentEdit');
  if (!badge || !edit) {
    return;
  }
  if (identity) {
    badge.textContent = formatMessage_(
        BlocklyGames.getMsg('Index.studentBadge', false),
        [identity['name'], identity['group']]);
    badge.title = identity['name'] + ' · ' + identity['group'] + '\n' +
        BlocklyGames.getMsg('Index.studentLockNote', false);
    edit.hidden = true;
  } else {
    badge.textContent = '';
    badge.title = '';
    edit.hidden = false;
  }
  const importBadge = BlocklyGames.getElementById('importBadge');
  const log = BlocklyGames.identity.importLog();
  if (!importBadge) {
    return;
  }
  if (!log.length) {
    importBadge.hidden = true;
    importBadge.textContent = '';
    importBadge.title = '';
  } else {
    const last = log[0];
    importBadge.hidden = false;
    importBadge.textContent = formatMessage_(
        BlocklyGames.getMsg('Index.importBadge', false),
        [last['name'], last['group']]);
    importBadge.title = formatMessage_(
        BlocklyGames.getMsg('Index.importBadgeTitle', false),
        [String(last['levels'] || 0),
         String(last['imported'] || '').slice(0, 10)]);
  }
}

/**
 * Show the student dialog.  An existing record is displayed read-only; the
 * normal UI hides the edit button once the record is locked.
 */
function openStudentDialog() {
  const dialog = BlocklyGames.getElementById('studentDialog');
  if (!dialog) {
    return;
  }
  const identity = BlocklyGames.identity.get();
  const nameInput = BlocklyGames.getElementById('studentName');
  const groupInput = BlocklyGames.getElementById('studentGroup');
  const saveButton = BlocklyGames.getElementById('studentSave');
  setStudentError('');
  if (identity) {
    nameInput.value = identity['name'];
    groupInput.value = identity['group'];
    nameInput.readOnly = true;
    groupInput.readOnly = true;
    saveButton.hidden = true;
  } else {
    nameInput.readOnly = false;
    groupInput.readOnly = false;
    saveButton.hidden = false;
  }
  dialog.hidden = false;
  if (!identity) {
    nameInput.focus();
  }
}

/**
 * Hide the student dialog.
 */
function closeStudentDialog() {
  const dialog = BlocklyGames.getElementById('studentDialog');
  if (dialog) {
    dialog.hidden = true;
  }
}

/**
 * Hide the dialog and remember that the student chose "Later" for this
 * session, so it does not reopen on every navigation.
 */
function closeStudentDialogWithFlag() {
  closeStudentDialog();
  try {
    window.sessionStorage['blocklyGamesStudentPrompt'] = '1';
  } catch (e) {
    // Ignore unavailable sessionStorage.
  }
}

/**
 * Show or clear the inline error in the student dialog.
 * @param {string} text Error text, or an empty string to hide it.
 */
function setStudentError(text) {
  const error = BlocklyGames.getElementById('studentError');
  if (!error) {
    return;
  }
  error.textContent = text || '';
  error.hidden = !text;
}

/**
 * Save the student record.  The inputs are locked afterwards and the record
 * is never replaced from the UI.
 * @param {!Event} event Submit event.
 */
function saveStudent(event) {
  event.preventDefault();
  const name = BlocklyGames.getElementById('studentName').value;
  const group = BlocklyGames.getElementById('studentGroup').value;
  if (!name.trim() || !group.trim()) {
    setStudentError(BlocklyGames.getMsg('Index.studentEmpty', false));
    return;
  }
  const identity = BlocklyGames.identity.save(name, group);
  if (!identity) {
    setStudentError(BlocklyGames.getMsg('Index.studentEmpty', false));
    return;
  }
  closeStudentDialog();
  updateIdentityUI();
  setProgressStatus(formatMessage_(
      BlocklyGames.getMsg('Index.studentSaved', false),
      [identity['name'], identity['group']]));
}

/**
 * Ensure a locked identity exists before exporting or importing.  Opening
 * the dialog is the only recovery path; returning false cancels the action.
 * @returns {boolean} True when the identity is present.
 */
function ensureIdentity() {
  if (BlocklyGames.identity.get()) {
    return true;
  }
  openStudentDialog();
  setProgressStatus(BlocklyGames.getMsg('Index.studentRequired', false));
  return false;
}

/**
 * Download all completed levels as a signed, human-readable JSON file.
 */
function exportProgress() {
  if (!ensureIdentity()) {
    return;
  }
  if (!BlocklyGames.identity.available()) {
    setProgressStatus(BlocklyGames.getMsg('Index.signingUnavailable', false));
    return;
  }
  if (exporting) {
    return;
  }
  const identity = BlocklyGames.identity.get();
  const apps = {};
  let count = 0;
  for (let i = 0; i < APPS.length; i++) {
    const app = APPS[i];
    const levels = {};
    for (let level = 1; level <= BlocklyGames.MAX_LEVEL; level++) {
      const value = getProgressValue(app, level);
      if (value) {
        levels[level] = value;
        count++;
      }
    }
    if (Object.keys(levels).length) {
      apps[app] = levels;
    }
  }
  if (!count) {
    setProgressStatus(BlocklyGames.getMsg('Index.exportEmpty', false));
    return;
  }
  // Quoted keys survive Closure's ADVANCED property renaming.  Without the
  // quotes a compiled build would write {"o": ..., "h": ...} instead of the
  // documented progress schema.
  const student = {};
  student['name'] = identity['name'];
  student['group'] = identity['group'];
  student['id'] = identity['id'] || '';
  const payload = {};
  payload['format'] = PROGRESS_FORMAT;
  payload['version'] = PROGRESS_VERSION;
  payload['exported'] = new Date().toISOString();
  payload['student'] = student;
  payload['apps'] = apps;
  payload['imports'] = BlocklyGames.identity.importLog();
  exporting = true;
  setProgressStatus(BlocklyGames.getMsg('Index.exportSigning', false));
  BlocklyGames.identity.sign(payload).then(function(signature) {
    const data = {};
    data['format'] = payload['format'];
    data['version'] = payload['version'];
    data['exported'] = payload['exported'];
    data['student'] = payload['student'];
    data['apps'] = payload['apps'];
    data['imports'] = payload['imports'];
    data['signature'] = signature;
    const blob = new Blob([JSON.stringify(data, null, 2)],
        {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blockly-games-progress-' +
        new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1000);
    exporting = false;
    setProgressStatus(formatMessage_(
        BlocklyGames.getMsg('Index.exportDone', false), [count]));
  }).catch(function() {
    exporting = false;
    setProgressStatus(BlocklyGames.getMsg('Index.exportFailed', false));
  });
}

/**
 * Merge levels from a signed JSON progress file into localStorage.  The
 * signature is checked before any key is written, so editing the student
 * name (or any level) in the JSON blocks the whole import.
 * @param {!File} file File chosen by the user.
 */
function importProgress(file) {
  if (!ensureIdentity()) {
    return;
  }
  if (!BlocklyGames.identity.available()) {
    setProgressStatus(BlocklyGames.getMsg('Index.signingUnavailable', false));
    return;
  }
  if (file.size > MAX_PROGRESS_FILE_SIZE) {
    setProgressStatus(BlocklyGames.getMsg('Index.importInvalid', false));
    return;
  }
  const reader = new FileReader();
  reader.onerror = function() {
    setProgressStatus(BlocklyGames.getMsg('Index.importError', false));
  };
  reader.onload = function() {
    let data;
    try {
      data = JSON.parse(String(reader.result));
    } catch (e) {
      setProgressStatus(BlocklyGames.getMsg('Index.importInvalid', false));
      return;
    }
    if (!data || data['format'] !== PROGRESS_FORMAT ||
        !data['apps'] || typeof data['apps'] !== 'object') {
      setProgressStatus(BlocklyGames.getMsg('Index.importInvalid', false));
      return;
    }
    if (data['version'] !== PROGRESS_VERSION) {
      setProgressStatus(BlocklyGames.getMsg('Index.importUnsigned', false));
      return;
    }
    const student = data['student'];
    if (!student || typeof student !== 'object' ||
        typeof student['name'] !== 'string' ||
        typeof student['group'] !== 'string' ||
        typeof student['id'] !== 'string' ||
        typeof data['exported'] !== 'string') {
      setProgressStatus(BlocklyGames.getMsg('Index.importTampered', false));
      return;
    }
    if (!data['signature'] || typeof data['signature'] !== 'object') {
      setProgressStatus(BlocklyGames.getMsg('Index.importUnsigned', false));
      return;
    }
    const payload = BlocklyGames.identity.payload(data);
    BlocklyGames.identity.verify(payload, data['signature']).then(
        function(valid) {
      if (!valid) {
        setProgressStatus(BlocklyGames.getMsg('Index.importTampered', false));
        return;
      }
      const local = BlocklyGames.identity.get();
      if (!BlocklyGames.identity.matches(local, student)) {
        const question = formatMessage_(
            BlocklyGames.getMsg('Index.importOther', false),
            [student['name'], student['group']]);
        if (!window.confirm(question)) {
          setProgressStatus(
              BlocklyGames.getMsg('Index.importCanceled', false));
          return;
        }
      }
      let count = 0;
      for (let i = 0; i < APPS.length; i++) {
        const app = APPS[i];
        const levels = data['apps'][app];
        if (!levels || typeof levels !== 'object') {
          continue;
        }
        for (let level = 1; level <= BlocklyGames.MAX_LEVEL; level++) {
          const value = levels[level];
          if (typeof value === 'string' && value.length) {
            try {
              window.localStorage[app + level] = value;
              count++;
            } catch (e) {
              // Storage may be full or disabled.  Keep importing the rest.
            }
          }
        }
      }
      if (!count) {
        setProgressStatus(BlocklyGames.getMsg('Index.importInvalid', false));
        return;
      }
      const record = {};
      record['name'] = student['name'];
      record['group'] = student['group'];
      record['id'] = student['id'];
      record['exported'] = data['exported'];
      record['imported'] = new Date().toISOString();
      record['levels'] = count;
      BlocklyGames.identity.addImport(record, data['imports']);
      updateIdentityUI();
      setProgressStatus(formatMessage_(
          BlocklyGames.getMsg('Index.importSigned', false),
          [student['name'], student['group'], count]));
      setTimeout(function() {
        if (window['BlocklyGamesStandalone']) {
          // The index lives in an iframe in the single-file build; reloading
          // that document would leave a blank frame.
          window.parent.postMessage(
              {'blocklyGames': 'open', 'page': 'index'}, '*');
        } else {
          location.reload();
        }
      }, 1800);
    }).catch(function() {
      setProgressStatus(BlocklyGames.getMsg('Index.importTampered', false));
    });
  };
  reader.readAsText(file);
}

/**
 * Clear all stored data.
 */
function clearData() {
  if (!confirm(BlocklyGames.getMsg('Index.clear', false))) {
    return;
  }
  for (let i = 0; i < APPS.length; i++) {
    for (let j = 1; j <= BlocklyGames.MAX_LEVEL; j++) {
      delete window.localStorage[APPS[i] + j];
    }
  }
  location.reload();
}

// If the browser restores the index from the back/forward cache, its gauges
// and progress toolbar can be stale.  Reload once so the saved levels are
// read again.
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    window.location.reload();
  }
}, false);

BlocklyGames.callWhenLoaded(init);
