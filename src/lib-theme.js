/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Shared Blockly appearance for all games.
 *
 * Blockly Games ships one look and feel for every app: the palette and the
 * workspace furniture are defined here, and games only add what makes them
 * unique (their own blocks, canvas and toolbox).  Anything a game passes in
 * its own inject options always wins over these defaults.
 */
'use strict';

goog.provide('BlocklyGames.theme');

goog.require('Blockly');
goog.require('BlocklyGames');


/**
 * Flat colour generation.  Blockly turns a block's hue into a fill colour
 * using these two globals; the classic values produce the old 3D-ish look,
 * these produce a brighter, flatter palette shared by all apps.
 * @type {number}
 */
Blockly.HSV_SATURATION = 0.44;
Blockly.HSV_VALUE = 0.72;

/**
 * Is the effective colour scheme dark?  Respect the explicit light/dark/auto
 * choice made on the page (see common/theme.js) before falling back to the
 * operating-system preference.
 * @type {boolean}
 */
BlocklyGames.theme.IS_DARK = !!(window['BlocklyGamesTheme'] ?
    window['BlocklyGamesTheme']['getEffectiveMode']() === 'dark' :
    (window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches));

/**
 * Workspace background and dot grid.
 */
BlocklyGames.theme.GRID_SPACING = 28;
BlocklyGames.theme.GRID_DOT = 2;
/** @type {string} */
BlocklyGames.theme.GRID_COLOUR =
    BlocklyGames.theme.IS_DARK ? '#4b5563' : '#d3dae1';

/**
 * Font stack used for block text and fields.
 * @type {string}
 */
BlocklyGames.theme.FONT_FAMILY =
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * Rendering constants shared by every workspace.
 * @type {!Object}
 */
BlocklyGames.theme.RENDERER_OVERRIDES = {
  'FIELD_TEXT_FONTFAMILY': BlocklyGames.theme.FONT_FAMILY,
  'FIELD_TEXT_FONTSIZE': 12,
  'FIELD_TEXT_FONTWEIGHT': '500',
  'FIELD_BORDER_RECT_COLOUR': '#ffffff',
  'CORNER_RADIUS': 8,
};

/**
 * Work around a mixed property-access bug in the vendored Blockly build:
 * `Options.parseGridOptions_` writes unquoted properties (renamed by Closure)
 * while `Grid.createDom` reads them through string keys (not renamed), so the
 * compiled grid pattern gets `stroke="undefined"`.  Returning the normalized
 * object with quoted keys keeps both sides in agreement.
 * @private
 */
BlocklyGames.theme.fixGridOptions_ = function() {
  if (!Blockly.Options || !Blockly.Options.parseGridOptions_ ||
      Blockly.Options.parseGridOptions_['blocklyGamesPatched']) {
    return;
  }
  const patched = function(options) {
    const grid = options['grid'] || {};
    const spacing = Number(grid['spacing']) || 0;
    return {
      'spacing': spacing,
      'colour': grid['colour'] || '#888',
      'length': (grid['length'] === undefined) ? 1 : Number(grid['length']),
      'snap': spacing > 0 && !!grid['snap'],
    };
  };
  patched['blocklyGamesPatched'] = true;
  Blockly.Options.parseGridOptions_ = patched;
};

/**
 * Add Blockly Games' shared appearance to a game's inject options.
 * @param {!Object} options Dictionary of Blockly options, modified in place.
 * @returns {!Object} The same options object.
 */
BlocklyGames.theme.configure = function(options) {
  BlocklyGames.theme.fixGridOptions_();
  if (!options['rendererOverrides']) {
    options['rendererOverrides'] = BlocklyGames.theme.RENDERER_OVERRIDES;
  }
  if (!options['grid'] && !options['readOnly']) {
    // Faint dot grid: the only ornament on an otherwise empty workspace.
    // Readonly samples (help dialogs) are too small to be worth gridding.
    options['grid'] = {
      'spacing': BlocklyGames.theme.GRID_SPACING,
      'length': BlocklyGames.theme.GRID_DOT,
      'colour': BlocklyGames.theme.GRID_COLOUR,
      'snap': false,
    };
  }
  return options;
};
