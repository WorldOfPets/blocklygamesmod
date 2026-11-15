/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Early colour-scheme selection shared by every page.
 *
 * The page must know whether it is light or dark before the first paint, so
 * this tiny script is loaded in the document head, before the stylesheets.
 * The choice is stored in localStorage and can be:
 *   auto  - follow the operating system (the default),
 *   light - always use the light palette,
 *   dark  - always use the dark palette.
 *
 * Blockly itself only reads the effective value at startup.  Changing the
 * mode therefore reloads the page; that keeps the canvas, the Blockly grid,
 * the Ace editor and the CSS in sync without a second theming system.
 */
'use strict';

(function() {
  const STORAGE_KEY = 'blocklyGamesTheme';
  const MODES = ['auto', 'light', 'dark'];
  const DARK_THEME_COLOUR = '#14181d';
  const LIGHT_THEME_COLOUR = '#f6f8fa';

  /**
   * Read the saved mode.  Invalid or unavailable storage means auto.
   * @returns {string} 'auto', 'light' or 'dark'.
   */
  function getMode() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (MODES.indexOf(value) !== -1) {
        return value;
      }
    } catch (e) {
      // Private mode or file://: fall through to auto.
    }
    return 'auto';
  }

  /**
   * Resolve a mode to the actual palette in use.
   * @param {string=} opt_mode Mode to resolve, defaults to the saved mode.
   * @returns {string} 'light' or 'dark'.
   */
  function getEffectiveMode(opt_mode) {
    const mode = opt_mode || getMode();
    if (mode === 'dark' || mode === 'light') {
      return mode;
    }
    return (window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches) ?
        'dark' : 'light';
  }

  /**
   * Paint the document with the requested mode.
   * @param {string} mode 'auto', 'light' or 'dark'.
   */
  function apply(mode) {
    const effective = getEffectiveMode(mode);
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.style.colorScheme = effective;
    // Keep the browser UI (Android status bar, desktop title bar) in step.
    // The static media-qualified metas are deliberately rewritten: after a
    // manual choice the OS preference must not win.
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    for (let i = 0; i < metas.length; i++) {
      metas[i].removeAttribute('media');
      metas[i].setAttribute('content',
          effective === 'dark' ? DARK_THEME_COLOUR : LIGHT_THEME_COLOUR);
    }
  }

  /**
   * Persist and apply a new mode.  Reloading is required because games cache
   * the effective palette in their Blockly/Ace setup.
   * @param {string} mode 'auto', 'light' or 'dark'.
   */
  function setMode(mode) {
    if (MODES.indexOf(mode) === -1) {
      mode = 'auto';
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      // Not fatal: the choice still applies to this page.
    }
    // Give the current game a chance to preserve unsaved blocks before the
    // reload.  lib-interface.js installs this hook on every game page.
    if (window['BlocklyGamesThemeBeforeReload']) {
      try {
        window['BlocklyGamesThemeBeforeReload']();
      } catch (e) {
        // The reload is more important than the snapshot.
      }
    }
    apply(mode);
    if (window['BlocklyGamesStandalone'] && window.parent !== window) {
      // The single-file build owns the document in an iframe.  Ask it to
      // rewrite the current game instead of reloading a blank iframe.
      window.parent.postMessage({
        'blocklyGames': 'open',
        'page': window['BlocklyGamesPage'] || 'index',
        'level': window['BlocklyGamesLevel'] || 1,
        'skin': window['BlocklyGamesSkin'] || 0,
      }, '*');
      return;
    }
    window.location.reload();
  }

  /**
   * Wire up the theme selector, creating one if the page has no markup for it.
   */
  function initSelector() {
    // A game can replace document.body after the first call, leaving the
    // floating fallback next to the real toolbar selector.  Keep the one in
    // the toolbar and remove the fallback.
    const allSelects = document.querySelectorAll('#themeMenu');
    let select = document.querySelector('#themeMenu:not(.themeMenuFixed)');
    if (!select) {
      select = allSelects.length ? allSelects[0] : null;
    }
    if (allSelects.length > 1) {
      for (let i = 0; i < allSelects.length; i++) {
        if (allSelects[i] !== select &&
            allSelects[i].classList.contains('themeMenuFixed')) {
          allSelects[i].remove();
        }
      }
    }
    if (!select) {
      // Static pages such as about.html have no toolbar.  A small floating
      // select keeps the setting reachable there too.
      select = document.createElement('select');
      select.id = 'themeMenu';
      select.className = 'themeMenuFixed';
      select.setAttribute('aria-label', 'Theme');
      const parent = document.body || document.documentElement;
      parent.appendChild(select);
    }
    if (select.getAttribute('data-theme-bound')) {
      select.value = getMode();
      return;
    }
    if (!select.options.length) {
      const labels = [
        ['auto', 'Auto'],
        ['light', 'Light'],
        ['dark', 'Dark'],
      ];
      for (let i = 0; i < labels.length; i++) {
        select.add(new Option(labels[i][1], labels[i][0]));
      }
    }
    select.value = getMode();
    select.setAttribute('data-theme-bound', 'true');
    select.addEventListener('change', function() {
      setMode(select.value);
    }, false);
  }

  // Set data-theme synchronously.  This file is loaded before the stylesheets,
  // so the first paint already has the right palette.
  apply(getMode());

  // Follow the OS when the user is in auto mode.  The CSS media query already
  // updates the palette; this keeps theme-color and color-scheme in step.
  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function() {
      if (getMode() === 'auto') {
        apply('auto');
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', onChange);
    } else if (media.addListener) {
      media.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSelector, false);
  } else {
    initSelector();
  }

  // Public API used by lib-theme.js and by tests.
  window['BlocklyGamesTheme'] = {
    'getMode': getMode,
    'getEffectiveMode': getEffectiveMode,
    'apply': apply,
    'setMode': setMode,
    'initSelector': initSelector,
  };
})();
