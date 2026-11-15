/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview HTML for the AI Lab game.
 */
'use strict';

goog.provide('Ai.html');

goog.require('BlocklyGames');
goog.require('BlocklyGames.html');


/**
 * Web page structure.
 * @param {!Object} ij Injected options.
 * @returns {string} HTML.
 */
Ai.html.start = function(ij) {
  return `
${BlocklyGames.html.headerBar(ij, BlocklyGames.getMsg('Games.ai', true),
    '', false, false, '')}

<main id="aiMain">
<div id="aiWrap">
  <aside id="aiSidebar">
    <p id="aiHelp" class="aiHelp"></p>
    <p id="aiStats" class="aiStats" role="status" aria-live="polite"></p>

    <div class="aiGroup" role="group"
        aria-label="${BlocklyGames.getMsg('AI.brushGroup', true)}">
      <button type="button" class="aiBrush aiBrushA" data-brush="a"
          aria-pressed="false">${BlocklyGames.getMsg('AI.brushA', true)}</button>
      <button type="button" class="aiBrush aiBrushB" data-brush="b"
          aria-pressed="false">${BlocklyGames.getMsg('AI.brushB', true)}</button>
      <button type="button" class="aiBrush aiBrushErase" data-brush="erase"
          aria-pressed="false">${BlocklyGames.getMsg('AI.erase', true)}</button>
    </div>

    <label class="aiSlider" for="aiK">
      <span>${BlocklyGames.getMsg('AI.k', true)}</span>
      <output id="aiKValue" for="aiK">3</output>
    </label>
    <input type="range" id="aiK" min="1" max="15" step="2" value="3">

    <div class="aiActions">
      <button type="button" id="aiTrain" class="primary">
        ${BlocklyGames.getMsg('AI.train', true)}
      </button>
      <button type="button" id="aiTest" class="secondary">
        ${BlocklyGames.getMsg('AI.test', true)}
      </button>
    </div>
    <button type="button" id="aiReset" class="aiReset">
      ${BlocklyGames.getMsg('AI.reset', true)}
    </button>
    <p id="aiHint" class="aiHint" hidden></p>
  </aside>

  <section id="aiStage">
    <canvas id="aiCanvas" width="640" height="640" role="img"
        aria-label="${BlocklyGames.getMsg('AI.canvasLabel', true)}"></canvas>
    <div id="aiOverlay" class="aiOverlay" hidden>
      <div class="aiOverlayCard" role="dialog" aria-modal="true"
          aria-labelledby="aiOverlayTitle">
        <h2 id="aiOverlayTitle"></h2>
        <p id="aiOverlayText"></p>
        <div class="aiOverlayButtons">
          <button type="button" id="aiNext" class="primary">
            ${BlocklyGames.getMsg('AI.next', true)}
          </button>
          <button type="button" id="aiAll" class="secondary">
            ${BlocklyGames.getMsg('AI.allGames', true)}
          </button>
        </div>
      </div>
    </div>
  </section>
</div>
</main>
`;
};
