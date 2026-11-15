/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview JavaScript for AI Lab.
 *
 * The game is a small, deliberately transparent introduction to supervised
 * learning.  The player labels examples, the "model" is k-nearest neighbours,
 * and the canvas shows the decision regions that the model has learned.
 * There is no hidden training loop: every change is visible immediately, so
 * the lesson stays on data, labels, k and generalisation.
 */
'use strict';

goog.provide('Ai');

goog.require('Ai.html');
goog.require('BlocklyGames');
goog.require('BlocklyGames.theme');


BlocklyGames.storageName = 'ai';

/**
 * Colours used by the canvas.  Kept here instead of reading CSS because the
 * canvas is painted immediately, before layout settles.
 */
const COLOURS = {
  light: {
    surface: '#ffffff',
    line: '#e2e6ea',
    ink: '#1f2328',
    a: 'rgba(26, 115, 232, .16)',
    b: 'rgba(232, 113, 10, .16)',
    aRegion: '#dce9fb',
    bRegion: '#fbe9d8',
    aSolid: '#1a73e8',
    bSolid: '#e8710a',
    error: '#d1242f',
  },
  dark: {
    surface: '#1c2128',
    line: '#30363d',
    ink: '#e6edf3',
    a: 'rgba(83, 155, 245, .24)',
    b: 'rgba(255, 166, 87, .24)',
    aRegion: '#243449',
    bRegion: '#3a2c22',
    aSolid: '#539bf5',
    bSolid: '#ffa657',
    error: '#ff7b72',
  },
};

/**
 * Plot geometry, recalculated whenever the canvas is resized.
 */
const plot = {
  size: 640,
  pad: 22,
  dpr: 1,
};

/**
 * One level description.
 * @typedef {{
 *   target: number,
 *   maxPoints: number,
 *   k: number,
 *   help: string,
 *   data: function(!Function): !Array<!Object>,
 *   test: function(!Function): !Array<!Object>
 * }}
 */
let LevelDef;

/**
 * A labelled example.
 * @typedef {{x: number, y: number, label: number}}
 */
let Example;

/**
 * Deterministic pseudo-random generator.  Replaying a level must produce the
 * same examples on every device and in every browser.
 * @param {number} seed Seed.
 * @returns {function(): number} Generator in [0, 1).
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return function() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Sample points in [-0.9, 0.9]^2 and label them with a rule.
 * @param {function(number, number): boolean} rule True means class B.
 * @param {number} count Number of examples.
 * @param {!Function} rng Random generator.
 * @param {number=} opt_noise Probability of flipping a label.
 * @returns {!Array<!Example>} Examples.
 */
function sample(rule, count, rng, opt_noise) {
  const noise = opt_noise || 0;
  const points = [];
  for (let i = 0; i < count; i++) {
    const x = rng() * 1.8 - 0.9;
    const y = rng() * 1.8 - 0.9;
    let label = rule(x, y) ? 1 : 0;
    if (noise && rng() < noise) {
      label = 1 - label;
    }
    points.push({x: x, y: y, label: label});
  }
  return points;
}

/**
 * Two interleaving spirals.  The sign of a travelling wave decides the class.
 * @param {number} x X.
 * @param {number} y Y.
 * @returns {boolean} True for class B.
 */
function spiralRule(x, y) {
  const angle = Math.atan2(y, x);
  const radius = Math.sqrt(x * x + y * y);
  return Math.sin(angle * 3 + radius * 9) > 0;
}

/**
 * Two half-moons.
 * @param {number} x X.
 * @param {number} y Y.
 * @returns {boolean} True for class B.
 */
function moonsRule(x, y) {
  const dx1 = x + 0.35;
  const dy1 = y + 0.15;
  const dx2 = x - 0.35;
  const dy2 = y - 0.15;
  const first = dx1 * dx1 + dy1 * dy1 < 0.42 * 0.42 && y > -0.15;
  const second = dx2 * dx2 + dy2 * dy2 < 0.42 * 0.42 && y < 0.15;
  return first || second;
}

/**
 * A 3 x 3 checkerboard.
 * @param {number} x X.
 * @param {number} y Y.
 * @returns {boolean} True for class B.
 */
function checkerRule(x, y) {
  const col = Math.floor((x + 1) * 1.5);
  const row = Math.floor((y + 1) * 1.5);
  return (col + row) % 2 === 0;
}

/**
 * A deliberately unbalanced training set: 26 class-B examples, 6 class-A.
 * @param {!Function} rng Random generator.
 * @returns {!Array<!Example>} Examples.
 */
function imbalanceData(rng) {
  const points = [];
  for (let i = 0; i < 26; i++) {
    points.push({x: rng() * 0.85 + 0.05, y: rng() * 1.8 - 0.9,
                 label: 1});
  }
  for (let i = 0; i < 6; i++) {
    points.push({x: rng() * 0.85 - 0.9, y: rng() * 1.8 - 0.9,
                 label: 0});
  }
  return points;
}

/**
 * Level table.  The message key in 'help' is resolved at runtime so the
 * level text can be translated without touching this file.
 * @type {!Array<!LevelDef>}
 */
const LEVELS = [
  {
    target: 0.90,
    maxPoints: 26,
    k: 1,
    help: 'AI.help1',
    data: function(rng) {
      return sample(function(x, y) { return x < 0; }, 18, rng);
    },
    test: function(rng) {
      return sample(function(x, y) { return x < 0; }, 300, rng);
    },
  },
  {
    target: 0.90,
    maxPoints: 26,
    k: 1,
    help: 'AI.help2',
    data: function(rng) {
      return sample(function(x, y) { return y > 0; }, 18, rng);
    },
    test: function(rng) {
      return sample(function(x, y) { return y > 0; }, 300, rng);
    },
  },
  {
    target: 0.88,
    maxPoints: 30,
    k: 1,
    help: 'AI.help3',
    data: function(rng) {
      return sample(function(x, y) { return x + y > 0; }, 22, rng);
    },
    test: function(rng) {
      return sample(function(x, y) { return x + y > 0; }, 300, rng);
    },
  },
  {
    target: 0.92,
    maxPoints: 32,
    k: 1,
    help: 'AI.help4',
    data: function(rng) {
      const points = sample(function(x, y) { return x - y > 0.15; },
                            24, rng);
      // Two examples carry the wrong label.  The player can erase them.
      points.push({x: -0.72, y: 0.76, label: 1});
      points.push({x: 0.82, y: 0.18, label: 0});
      return points;
    },
    test: function(rng) {
      return sample(function(x, y) { return x - y > 0.15; }, 300, rng);
    },
  },
  {
    target: 0.84,
    maxPoints: 40,
    k: 5,
    help: 'AI.help5',
    data: function(rng) {
      return sample(function(x, y) { return x + y > 0; }, 30, rng, 0.14);
    },
    test: function(rng) {
      return sample(function(x, y) { return x + y > 0; }, 300, rng);
    },
  },
  {
    target: 0.88,
    maxPoints: 20,
    k: 1,
    help: 'AI.help6',
    data: function(rng) {
      return sample(function(x, y) {
        return x * x + y * y < 0.55 * 0.55;
      }, 8, rng);
    },
    test: function(rng) {
      return sample(function(x, y) {
        return x * x + y * y < 0.55 * 0.55;
      }, 300, rng);
    },
  },
  {
    target: 0.88,
    maxPoints: 40,
    k: 3,
    help: 'AI.help7',
    data: imbalanceData,
    test: function(rng) {
      return sample(function(x, y) { return x > 0; }, 300, rng);
    },
  },
  {
    target: 0.90,
    maxPoints: 40,
    k: 3,
    help: 'AI.help8',
    data: function(rng) {
      return sample(function(x, y) {
        return (x < 0) !== (y < 0);
      }, 36, rng);
    },
    test: function(rng) {
      return sample(function(x, y) {
        return (x < 0) !== (y < 0);
      }, 300, rng);
    },
  },
  {
    target: 0.92,
    maxPoints: 50,
    k: 3,
    help: 'AI.help9',
    data: function(rng) {
      return sample(function(x, y) {
        return x * x + y * y < 0.55 * 0.55;
      }, 44, rng);
    },
    test: function(rng) {
      return sample(function(x, y) {
        return x * x + y * y < 0.55 * 0.55;
      }, 300, rng);
    },
  },
  {
    target: 0.82,
    maxPoints: 100,
    k: 3,
    help: 'AI.help10',
    data: function(rng) {
      return sample(function(x, y) {
        const r = x * x + y * y;
        return r > 0.35 * 0.35 && r < 0.75 * 0.75;
      }, 70, rng);
    },
    test: function(rng) {
      return sample(function(x, y) {
        const r = x * x + y * y;
        return r > 0.35 * 0.35 && r < 0.75 * 0.75;
      }, 300, rng);
    },
  },
  {
    target: 0.88,
    maxPoints: 52,
    k: 3,
    help: 'AI.help11',
    data: function(rng) {
      return sample(moonsRule, 48, rng);
    },
    test: function(rng) {
      return sample(moonsRule, 300, rng);
    },
  },
  {
    target: 0.84,
    maxPoints: 60,
    k: 1,
    help: 'AI.help12',
    data: function(rng) {
      return sample(checkerRule, 56, rng);
    },
    test: function(rng) {
      return sample(checkerRule, 300, rng);
    },
  },
  {
    target: 0.78,
    maxPoints: 120,
    k: 3,
    help: 'AI.help13',
    data: function(rng) {
      return sample(spiralRule, 100, rng);
    },
    test: function(rng) {
      return sample(spiralRule, 300, rng);
    },
  },
  {
    target: 0.86,
    maxPoints: 10,
    k: 1,
    help: 'AI.help14',
    data: function(rng) {
      return sample(function(x, y) { return x + y > 0; }, 6, rng);
    },
    test: function(rng) {
      return sample(function(x, y) { return x + y > 0; }, 300, rng);
    },
  },
  {
    target: 0.78,
    maxPoints: 120,
    k: 3,
    help: 'AI.help15',
    data: function(rng) {
      return sample(spiralRule, 110, rng, 0.06);
    },
    test: function(rng) {
      return sample(spiralRule, 300, rng);
    },
  },
];

/**
 * Current level number (1..BlocklyGames.MAX_LEVEL).
 * @type {number}
 */
let level = BlocklyGames.LEVEL;

/**
 * Current level definition.
 * @type {!LevelDef}
 */
let levelDef = LEVELS[level - 1];

/**
 * Training examples, edited by the player.
 * @type {!Array<!Example>}
 */
let training = [];

/**
 * Cached test set, or null before the first Test press / after Reset.
 * @type {?Array<!Example>}
 */
let testSet = null;

/**
 * Classification of the current test set, or null.
 * @type {?Array<{x: number, y: number, label: number,
 *                predicted: number, correct: boolean}>}
 */
let testResults = null;

/**
 * Last test accuracy in [0, 1], or null.
 * @type {?number}
 */
let accuracy = null;

/**
 * Active drawing tool: 'a', 'b' or 'erase'.
 * @type {string}
 */
let brush = 'a';

/**
 * Current number of neighbours.  Cached because the classifier runs tens of
 * thousands of times while painting the decision regions.
 * @type {number}
 */
let kValue = 1;

/**
 * Canvas and its 2D context.
 * @type {?HTMLCanvasElement}
 */
let canvas = null;
/** @type {?CanvasRenderingContext2D} */
let ctx = null;

/**
 * The level seed.  A reset should restore the same examples, not a new set.
 * @type {number}
 */
const SEED = 20261114;

/**
 * Resolve a Game message and optionally replace %1 and %2.
 * @param {string} key Message key.
 * @param {*=} opt_first First substitution.
 * @param {*=} opt_second Second substitution.
 * @returns {string} Message.
 */
function msg(key, opt_first, opt_second) {
  let text = BlocklyGames.getMsg(key, false);
  if (opt_first !== undefined) {
    text = text.replace('%1', String(opt_first));
  }
  if (opt_second !== undefined) {
    text = text.replace('%2', String(opt_second));
  }
  return text;
}

/**
 * Is the effective theme dark?
 * @returns {boolean} True for dark.
 */
function isDark() {
  return BlocklyGames.theme.IS_DARK;
}

/**
 * Get the palette for the current theme.
 * @returns {!Object} Palette.
 */
function palette() {
  return isDark() ? COLOURS.dark : COLOURS.light;
}

/**
 * Replace the training set with the level's preset.
 */
function resetTraining() {
  const rng = makeRng(SEED + level * 37);
  training = levelDef.data(rng).slice();
  testSet = null;
  testResults = null;
  accuracy = null;
}

/**
 * Ensure the hidden test set exists.  It is generated once per reset so the
 * player cannot reroll the exam by pressing Test repeatedly.
 */
function ensureTestSet() {
  if (!testSet) {
    const rng = makeRng(SEED + 9000 + level * 53);
    testSet = levelDef.test(rng);
  }
}

/**
 * Classify one point with k-nearest neighbours.
 * @param {number} x X.
 * @param {number} y Y.
 * @returns {number} 0 for class A, 1 for class B.
 */
function classify(x, y) {
  if (!training.length) {
    return 0;
  }
  const nearest = [];
  for (let i = 0; i < training.length; i++) {
    const point = training[i];
    const dx = point.x - x;
    const dy = point.y - y;
    nearest.push({d: dx * dx + dy * dy, label: point.label});
  }
  nearest.sort(function(a, b) {
    return a.d - b.d;
  });
  const k = Math.min(kValue, nearest.length);
  let votesA = 0;
  let votesB = 0;
  for (let i = 0; i < k; i++) {
    if (nearest[i].label) {
      votesB++;
    } else {
      votesA++;
    }
  }
  if (votesA === votesB) {
    // Tie: the closest example wins.
    return nearest[0].label;
  }
  return votesB > votesA ? 1 : 0;
}

/**
 * Convert data coordinates to canvas pixels.
 * @param {number} x X in [-1, 1].
 * @param {number} y Y in [-1, 1].
 * @returns {{px: number, py: number}} Pixel position.
 */
function toPixel(x, y) {
  const span = plot.size - 2 * plot.pad;
  return {
    px: plot.pad + (x + 1) / 2 * span,
    py: plot.pad + (1 - y) / 2 * span,
  };
}

/**
 * Convert a pointer event to data coordinates.
 * @param {!PointerEvent|!MouseEvent} e Event.
 * @returns {{x: number, y: number}} Point in [-1, 1].
 */
function fromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const span = plot.size - 2 * plot.pad;
  const px = (e.clientX - rect.left) * (plot.size / rect.width);
  const py = (e.clientY - rect.top) * (plot.size / rect.height);
  return {
    x: Math.max(-1, Math.min(1, (px - plot.pad) / span * 2 - 1)),
    y: Math.max(-1, Math.min(1, 1 - (py - plot.pad) / span * 2)),
  };
}

/**
 * Resize the backing canvas for the current CSS size and device pixel ratio.
 */
function resizeCanvas() {
  if (!canvas) {
    return;
  }
  const cssSize = Math.max(320, Math.min(canvas.clientWidth || 640,
      canvas.clientHeight || 640));
  const dpr = window.devicePixelRatio || 1;
  plot.size = cssSize;
  plot.dpr = dpr;
  const pixels = Math.round(cssSize * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Draw the decision regions and the training/test examples.
 */
function render() {
  if (!ctx || !canvas) {
    return;
  }
  resizeCanvas();
  const colours = palette();
  const size = plot.size;
  const span = size - 2 * plot.pad;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = colours.surface;
  ctx.fillRect(0, 0, size, size);

  // Decision regions.  Classifying the centre of each cell is enough for a
  // readable boundary and keeps redraws under a frame on modest tablets.
  const cell = Math.max(3, Math.round(size / 120));
  for (let py = plot.pad; py < size - plot.pad; py += cell) {
    for (let px = plot.pad; px < size - plot.pad; px += cell) {
      const x = (px + cell / 2 - plot.pad) / span * 2 - 1;
      const y = 1 - (py + cell / 2 - plot.pad) / span * 2;
      const label = classify(x, y);
      // Opaque region colours.  Translucent fills would double up on the
      // one-pixel overlap and leave a visible grid over the whole plot.
      ctx.fillStyle = label ? colours.bRegion : colours.aRegion;
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
    }
  }

  // Axes and border.
  ctx.strokeStyle = colours.line;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(plot.pad, plot.pad + span / 2);
  ctx.lineTo(plot.pad + span, plot.pad + span / 2);
  ctx.moveTo(plot.pad + span / 2, plot.pad);
  ctx.lineTo(plot.pad + span / 2, plot.pad + span);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeRect(plot.pad, plot.pad, span, span);

  // Test examples are shown only after Test.  Wrong answers get a red ring.
  if (testResults) {
    for (let i = 0; i < testResults.length; i++) {
      const point = testResults[i];
      const pixel = toPixel(point.x, point.y);
      if (point.correct) {
        ctx.fillStyle = point.label ? colours.b : colours.a;
        ctx.beginPath();
        ctx.arc(pixel.px, pixel.py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = colours.error;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pixel.px - 3, pixel.py - 3);
        ctx.lineTo(pixel.px + 3, pixel.py + 3);
        ctx.moveTo(pixel.px + 3, pixel.py - 3);
        ctx.lineTo(pixel.px - 3, pixel.py + 3);
        ctx.stroke();
      }
    }
  }

  // Training examples: circles for class A, triangles for class B.
  for (let i = 0; i < training.length; i++) {
    const point = training[i];
    const pixel = toPixel(point.x, point.y);
    ctx.fillStyle = point.label ? colours.bSolid : colours.aSolid;
    ctx.strokeStyle = colours.surface;
    ctx.lineWidth = 2;
    if (point.label) {
      ctx.beginPath();
      ctx.moveTo(pixel.px, pixel.py - 7);
      ctx.lineTo(pixel.px + 7, pixel.py + 5);
      ctx.lineTo(pixel.px - 7, pixel.py + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pixel.px, pixel.py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/**
 * Update the statistics line and the hint.
 */
function updateStats() {
  const stats = document.getElementById('aiStats');
  const parts = [];
  parts.push(msg('AI.examples', training.length, levelDef.maxPoints));
  if (accuracy === null) {
    parts.push(msg('AI.notTested'));
  } else {
    parts.push(msg('AI.accuracy', Math.round(accuracy * 100)));
  }
  parts.push(msg('AI.target', Math.round(levelDef.target * 100)));
  stats.textContent = parts.join(' · ');
}

/**
 * Show the completion overlay and persist the level result.
 */
function winLevel() {
  try {
    window.localStorage[BlocklyGames.storageName + level] = 'done';
  } catch (e) {
    // Storage can be unavailable; the level still counts for this session.
  }
  const overlay = document.getElementById('aiOverlay');
  const title = document.getElementById('aiOverlayTitle');
  const text = document.getElementById('aiOverlayText');
  const next = document.getElementById('aiNext');
  const all = document.getElementById('aiAll');
  title.textContent = level >= BlocklyGames.MAX_LEVEL ?
      msg('AI.finalPass') : msg('AI.pass');
  text.textContent = msg('AI.accuracy', Math.round(accuracy * 100));
  next.hidden = level >= BlocklyGames.MAX_LEVEL;
  all.textContent = msg('AI.allGames');
  overlay.hidden = false;
  next.focus();
}

/**
 * Run the program on the hidden test set and report accuracy.
 */
function testModel() {
  ensureTestSet();
  let correct = 0;
  const results = [];
  for (let i = 0; i < testSet.length; i++) {
    const point = testSet[i];
    const predicted = classify(point.x, point.y);
    const ok = predicted === point.label;
    if (ok) {
      correct++;
    }
    results.push({x: point.x, y: point.y, label: point.label,
                  predicted: predicted, correct: ok});
  }
  testResults = results;
  accuracy = correct / testSet.length;
  render();
  updateStats();
  const hint = document.getElementById('aiHint');
  if (accuracy >= levelDef.target) {
    hint.hidden = true;
    winLevel();
  } else {
    hint.hidden = false;
    hint.textContent = msg('AI.fail');
  }
}

/**
 * Handle a click on the plot: add an example or erase the nearest one.
 * @param {!PointerEvent} e Event.
 */
function canvasClick(e) {
  e.preventDefault();
  const point = fromEvent(e);
  if (brush === 'erase') {
    let best = -1;
    let bestDistance = 0.012;  // roughly a 10 px radius
    for (let i = 0; i < training.length; i++) {
      const dx = training[i].x - point.x;
      const dy = training[i].y - point.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    if (best !== -1) {
      training.splice(best, 1);
    }
  } else {
    if (training.length >= levelDef.maxPoints) {
      const hint = document.getElementById('aiHint');
      hint.hidden = false;
      hint.textContent = msg('AI.maxPoints', levelDef.maxPoints);
      return;
    }
    training.push({x: point.x, y: point.y, label: brush === 'b' ? 1 : 0});
  }
  testResults = null;
  accuracy = null;
  document.getElementById('aiHint').hidden = true;
  render();
  updateStats();
}

/**
 * Set the active brush and update the aria-pressed state.
 * @param {string} newBrush 'a', 'b' or 'erase'.
 */
function setBrush(newBrush) {
  brush = newBrush;
  const buttons = document.querySelectorAll('.aiBrush');
  for (let i = 0; i < buttons.length; i++) {
    const active = buttons[i].getAttribute('data-brush') === brush;
    buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    buttons[i].classList.toggle('active', active);
  }
}

/**
 * Go to a level, or to the index, inside the single-file build.
 * @param {number} newLevel Level number, or 0 for the index.
 */
function navigate(newLevel) {
  if (window['BlocklyGamesStandalone']) {
    if (newLevel) {
      window.parent.postMessage({'blocklyGames': 'open', 'page': 'ai',
          'level': newLevel}, '*');
    } else {
      window.parent.postMessage({'blocklyGames': 'open', 'page': 'index'}, '*');
    }
    return;
  }
  if (newLevel) {
    window.location = window.location.protocol + '//' +
        window.location.host + window.location.pathname +
        '?lang=' + BlocklyGames.LANG + '&level=' + newLevel;
  } else {
    window.location = (BlocklyGames.IS_HTML ? 'index.html' : './') +
        '?lang=' + BlocklyGames.LANG;
  }
}

/**
 * Initialize the page.  Called on page load.
 */
function init() {
  document.body.innerHTML = Ai.html.start({
    lang: BlocklyGames.LANG,
    level: level,
    maxLevel: BlocklyGames.MAX_LEVEL,
    html: BlocklyGames.IS_HTML,
  });

  BlocklyGames.init(msg('Games.ai'));
  const languageMenu = document.getElementById('languageMenu');
  if (languageMenu) {
    languageMenu.addEventListener('change', BlocklyGames.changeLanguage, true);
  }

  document.getElementById('aiHelp').innerHTML = msg(levelDef.help);
  kValue = levelDef.k;
  document.getElementById('aiK').value = String(kValue);
  document.getElementById('aiKValue').textContent = String(kValue);

  canvas = /** @type {!HTMLCanvasElement} */ (
      document.getElementById('aiCanvas'));
  ctx = /** @type {!CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  resetTraining();
  render();
  updateStats();
  setBrush('a');

  const brushes = document.querySelectorAll('.aiBrush');
  for (let i = 0; i < brushes.length; i++) {
    brushes[i].addEventListener('click', function(e) {
      setBrush(e.currentTarget.getAttribute('data-brush'));
    }, false);
  }

  canvas.addEventListener('pointerdown', canvasClick, false);
  // While the slider is being dragged only the number changes.  Repainting
  // the decision regions on every step would make the control feel heavy on
  // tablets with a large training set.
  document.getElementById('aiK').addEventListener('input', function(e) {
    kValue = Number(e.target.value);
    document.getElementById('aiKValue').textContent = String(kValue);
  }, false);
  document.getElementById('aiK').addEventListener('change', function() {
    testResults = null;
    accuracy = null;
    render();
    updateStats();
  }, false);
  document.getElementById('aiTrain').addEventListener('click', function() {
    testResults = null;
    accuracy = null;
    render();
    updateStats();
    document.getElementById('aiHint').hidden = true;
  }, false);
  document.getElementById('aiTest').addEventListener('click', testModel,
      false);
  document.getElementById('aiReset').addEventListener('click', function() {
    document.getElementById('aiOverlay').hidden = true;
    kValue = levelDef.k;
    document.getElementById('aiK').value = String(kValue);
    document.getElementById('aiKValue').textContent = String(kValue);
    document.getElementById('aiHint').hidden = true;
    resetTraining();
    render();
    updateStats();
  }, false);
  document.getElementById('aiNext').addEventListener('click', function() {
    navigate(level + 1);
  }, false);
  document.getElementById('aiAll').addEventListener('click', function() {
    navigate(0);
  }, false);

  window.addEventListener('resize', function() {
    render();
  });
}

BlocklyGames.callWhenLoaded(init);
