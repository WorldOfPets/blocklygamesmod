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
 * Download all completed levels as a small, human-readable JSON file.
 */
function exportProgress() {
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
  const data = {};
  data['format'] = 'blockly-games-progress';
  data['version'] = 1;
  data['exported'] = new Date().toISOString();
  data['apps'] = apps;
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
  setProgressStatus(BlocklyGames.getMsg('Index.exportDone', false)
      .replace('%1', count));
}

/**
 * Merge levels from a JSON progress file into localStorage.
 * @param {!File} file File chosen by the user.
 */
function importProgress(file) {
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
    if (!data || data['format'] !== 'blockly-games-progress' ||
        !data['apps'] || typeof data['apps'] !== 'object') {
      setProgressStatus(BlocklyGames.getMsg('Index.importInvalid', false));
      return;
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
    setProgressStatus(BlocklyGames.getMsg('Index.importDone', false)
        .replace('%1', count));
    setTimeout(function() {
      location.reload();
    }, 900);
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
