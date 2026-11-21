/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Touch/mobile layout for the Blockly games.
 *
 * On a narrow screen the game and the code editor do not fit side by side.
 * This module moves the game pane, the editor pane and the run controls into
 * a small tabbed layout: the game is shown by default, "Blocks" (or "Code")
 * reveals the editor, and the Run button stays in a compact bar at the bottom.
 */
'use strict';

goog.provide('BlocklyGames.mobile');

goog.require('Blockly');
goog.require('BlocklyGames');
goog.require('BlocklyInterface');


/**
 * Resolve a list of element IDs and CSS selectors, dropping missing nodes and
 * duplicates.
 * @param {!Array<string>|undefined} selectors IDs (with '#') or selectors.
 * @returns {!Array<!Element>} Matching elements.
 * @private
 */
function resolveElements_(selectors) {
  const elements = [];
  if (!selectors) {
    return elements;
  }
  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    if (!selector) {
      continue;
    }
    if (selector.charAt(0) === '#') {
      const element = document.getElementById(selector.substring(1));
      if (element && elements.indexOf(element) === -1) {
        elements.push(element);
      }
    } else {
      const nodes = document.querySelectorAll(selector);
      for (let j = 0; j < nodes.length; j++) {
        if (elements.indexOf(nodes[j]) === -1) {
          elements.push(nodes[j]);
        }
      }
    }
  }
  return elements;
}


/**
 * Create one tab panel.
 * @param {string} name Pane name ('game' or 'code').
 * @returns {!Element} Panel.
 * @private
 */
function makePane_(name) {
  const pane = document.createElement('div');
  pane.className = 'mobilePane';
  pane.id = 'mobilePane-' + name;
  pane.setAttribute('data-pane', name);
  pane.setAttribute('role', 'tabpanel');
  pane.setAttribute('aria-labelledby', 'mobileTab-' + name);
  return pane;
}


/**
 * Create one tab button.
 * @param {string} name Pane name.
 * @param {string} label Visible label.
 * @param {!Element} pane Controlled panel.
 * @returns {!HTMLButtonElement} Tab.
 * @private
 */
function makeTab_(name, label, pane) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'mobileTab';
  tab.id = 'mobileTab-' + name;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', pane.id);
  tab.textContent = label;
  return tab;
}


/**
 * Build the mobile tab layout.  Must be called after the page HTML exists and
 * before Blockly is injected, so that the editor has a measurable pane.
 * @param {!Object} options game/code/actions selectors and labels.
 * @returns {boolean} True when the mobile layout was applied.
 */
BlocklyGames.mobile.initPanes = function(options) {
  if (!BlocklyGames.isMobile()) {
    return false;
  }
  const gameElements = resolveElements_(options['game']);
  const codeElements = resolveElements_(options['code']);
  if (!gameElements.length || !codeElements.length) {
    return false;
  }
  const first = gameElements[0];
  const parent = first.parentNode;
  if (!parent) {
    return false;
  }

  // Maze already has a <main>; other games get one created around the panes.
  let host;
  if (parent.tagName === 'MAIN') {
    host = parent;
    host.classList.add('mobileHost');
  } else {
    host = document.createElement('main');
    host.className = 'mobileHost';
    parent.insertBefore(host, first);
  }
  document.body.classList.add('mobilePage');

  const tabs = document.createElement('div');
  tabs.className = 'mobileTabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label',
      BlocklyGames.getMsg('Games.switchView', false));

  const panes = document.createElement('div');
  panes.className = 'mobilePanes';

  const gamePane = makePane_('game');
  const codePane = makePane_('code');
  for (let i = 0; i < gameElements.length; i++) {
    gamePane.appendChild(gameElements[i]);
  }
  for (let i = 0; i < codeElements.length; i++) {
    codePane.appendChild(codeElements[i]);
  }
  panes.appendChild(gamePane);
  panes.appendChild(codePane);

  const gameTab = makeTab_('game',
      BlocklyGames.getMsg(options['gameLabel'] || 'Games.gameTab', false),
      gamePane);
  const codeTab = makeTab_('code',
      BlocklyGames.getMsg(options['codeLabel'] || 'Games.blocks', false),
      codePane);
  tabs.appendChild(gameTab);
  tabs.appendChild(codeTab);

  const actionElements = resolveElements_(options['actions']);
  const actions = document.createElement('div');
  actions.className = 'mobileActions';
  for (let i = 0; i < actionElements.length; i++) {
    actions.appendChild(actionElements[i]);
  }

  host.insertBefore(tabs, host.firstChild);
  host.insertBefore(panes, tabs.nextSibling);
  if (actionElements.length) {
    host.insertBefore(actions, panes.nextSibling);
  }

  let active = options['active'] === 'code' ? 'code' : 'game';
  let centeredCode = false;

  /**
   * Show one pane and update the tab state.
   * @param {string} name Pane to show.
   */
  function activate(name) {
    const code = name === 'code';
    active = code ? 'code' : 'game';
    gamePane.hidden = code;
    codePane.hidden = !code;
    gameTab.setAttribute('aria-selected', code ? 'false' : 'true');
    codeTab.setAttribute('aria-selected', code ? 'true' : 'false');
    gameTab.tabIndex = code ? -1 : 0;
    codeTab.tabIndex = code ? 0 : -1;
    if (code) {
      // Measure only after the pane is visible.  Resizing Blockly while the
      // pane is hidden collapses its main SVG to 0x0, and Blockly's own
      // window-resize listener would do exactly that on the game tab.
      window.setTimeout(function() {
        try {
          if (BlocklyInterface.workspace) {
            BlocklyInterface.resizeBlockly();
            if (!centeredCode) {
              centeredCode = true;
              // Default blocks in the games sit near the left of a wide
              // desktop workspace; centre them once on the first mobile view.
              BlocklyInterface.workspace.scrollCenter();
            }
          }
          if (BlocklyInterface.editor && BlocklyInterface.editor['resize']) {
            BlocklyInterface.editor['resize']();
          }
        } catch (e) {
          // The workspace may be disposed while the page is closing.
        }
        window.dispatchEvent(new Event('resize'));
      }, 0);
    }
  }

  gameTab.addEventListener('click', function() {
    activate('game');
  }, false);
  codeTab.addEventListener('click', function() {
    activate('code');
  }, false);
  tabs.addEventListener('keydown', function(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next = active === 'game' ? 'code' : 'game';
    activate(next);
    (next === 'game' ? gameTab : codeTab).focus();
  }, false);

  const runButton = document.getElementById('runButton');
  if (runButton && options['switchOnRun'] !== false) {
    const showGame = function() {
      activate('game');
    };
    runButton.addEventListener('click', showGame, false);
    // BlocklyGames.bindClick handles touchend itself; a synthetic click may
    // never follow, so switch tabs from the touch event too.
    runButton.addEventListener('touchend', showGame, false);
  }

  // Keep the editor visible during the synchronous Blockly injection so it
  // has a real height.  The initial tab is selected before the first paint.
  codePane.hidden = false;
  gamePane.hidden = true;
  gameTab.setAttribute('aria-selected', 'false');
  codeTab.setAttribute('aria-selected', 'true');
  gameTab.tabIndex = -1;
  codeTab.tabIndex = 0;
  window.setTimeout(function() {
    activate(active);
  }, 0);
  return true;
};
