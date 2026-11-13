/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Common support code for games that handle JavaScript.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('BlocklyCode');

goog.require('Blockly');
goog.require('Blockly.JavaScript');
goog.require('BlocklyDialogs');
goog.require('BlocklyGames');
goog.require('BlocklyGames.Python');
goog.require('BlocklyInterface');


/**
 * User's JavaScript code from previous execution.
 * @type string
 */
BlocklyCode.executedJsCode = '';

/**
 * Language of the code shown in the 'done' dialog: 'js' or 'py'.
 * @type ?string
 * @private
 */
BlocklyCode.codeLang_ = null;

/**
 * Have the language buttons already been wired up?
 * @type boolean
 * @private
 */
BlocklyCode.codeLangListenersAdded_ = false;

/**
 * Get the preferred language for the displayed code.
 * @returns {string} 'js' or 'py'.
 * @private
 */
BlocklyCode.getCodeLang_ = function() {
  if (!BlocklyCode.codeLang_) {
    let stored = null;
    try {
      stored = window.localStorage.getItem('BlocklyGamesCodeLang');
    } catch (e) {
      // Storage may be unavailable (private mode, file:// in old browsers).
    }
    BlocklyCode.codeLang_ = stored === 'py' ? 'py' : 'js';
  }
  return BlocklyCode.codeLang_;
};

/**
 * Remember the preferred language for the displayed code.
 * @param {string} lang 'js' or 'py'.
 * @private
 */
BlocklyCode.setCodeLang_ = function(lang) {
  BlocklyCode.codeLang_ = lang === 'py' ? 'py' : 'js';
  try {
    window.localStorage.setItem('BlocklyGamesCodeLang', BlocklyCode.codeLang_);
  } catch (e) {
    // Not fatal: the choice simply won't persist.
  }
};

/**
 * Generate the user's program as Python, or null when there are no blocks.
 * @returns {?string} Python code.
 * @private
 */
BlocklyCode.getPythonCode_ = function() {
  if (!BlocklyInterface.workspace || BlocklyInterface.blocksDisabled) {
    return null;
  }
  try {
    return BlocklyGames.Python.safeWorkspaceToCode(BlocklyInterface.workspace);
  } catch (e) {
    console.warn('Could not generate Python: ' + e);
    return null;
  }
};

/**
 * Wire up the JavaScript/Python buttons in the 'done' dialog.
 * @private
 */
BlocklyCode.setUpCodeLanguageBar_ = function() {
  const jsButton = BlocklyGames.getElementById('codeLangJs');
  const pyButton = BlocklyGames.getElementById('codeLangPy');
  if (!jsButton || !pyButton) {
    return;
  }
  jsButton.textContent = BlocklyGames.getMsg('Games.codeLangJavascript', false);
  pyButton.textContent = BlocklyGames.getMsg('Games.codeLangPython', false);
  pyButton.disabled = !!BlocklyInterface.blocksDisabled;
  if (BlocklyCode.codeLangListenersAdded_) {
    return;
  }
  jsButton.addEventListener('click', function() {
    BlocklyCode.setCodeLang_('js');
    BlocklyCode.renderCode_();
  }, true);
  pyButton.addEventListener('click', function() {
    if (!pyButton.disabled) {
      BlocklyCode.setCodeLang_('py');
      BlocklyCode.renderCode_();
    }
  }, true);
  BlocklyCode.codeLangListenersAdded_ = true;
};

/**
 * Show the executed program in the 'done' dialog, in the chosen language.
 * @private
 */
BlocklyCode.renderCode_ = function() {
  const pre = BlocklyGames.getElementById('containerCode');
  const linesText = BlocklyGames.getElementById('dialogLinesText');
  if (!pre || !linesText) {
    return;
  }
  let lang = BlocklyCode.getCodeLang_();
  let code = null;
  if (lang === 'py') {
    code = BlocklyCode.getPythonCode_();
    if (code === null) {
      lang = 'js';
    }
  }
  if (lang === 'js') {
    code = BlocklyCode.stripCode(BlocklyCode.executedJsCode);
  }
  BlocklyCode.codeLang_ = lang;

  // Count the lines of code, ignoring comments and blank lines.
  let noComments = code;
  if (lang === 'py') {
    noComments = noComments.replace(/#[^\n]*/g, '');
  } else {
    noComments = noComments.replace(/\/\/[^\n]*/g, '');
    noComments = noComments.replace(/\/\*[\s\S]*?\*\//g, '');
  }
  noComments = noComments.replace(/[ \t]+\n/g, '\n');
  noComments = noComments.replace(/\n+/g, '\n');
  noComments = noComments.trim();
  const lineCount = noComments ? noComments.split('\n').length : 1;
  const locMsg = lineCount === 1 ?
      BlocklyGames.getMsg('Games.linesOfCode1', false) :
      BlocklyGames.getMsg('Games.linesOfCode2', false)
          .replace('%1', String(lineCount));
  linesText.textContent = locMsg;

  pre.textContent = code;
  if (typeof prettyPrintOne === 'function') {
    pre.innerHTML = prettyPrintOne(pre.innerHTML, lang === 'py' ? 'py' : 'js');
  }

  const jsButton = BlocklyGames.getElementById('codeLangJs');
  const pyButton = BlocklyGames.getElementById('codeLangPy');
  if (jsButton) {
    jsButton.classList.toggle('codeLangActive', lang === 'js');
    jsButton.setAttribute('aria-pressed', String(lang === 'js'));
  }
  if (pyButton) {
    pyButton.classList.toggle('codeLangActive', lang === 'py');
    pyButton.setAttribute('aria-pressed', String(lang === 'py'));
  }
};

/**
 * Get the user's executable code as JS from the editor (Blockly or ACE).
 * @returns {string} JS code.
 */
BlocklyCode.getJsCode = function() {
  if (BlocklyInterface.blocksDisabled) {
    // Text editor.
    return BlocklyInterface.editor['getValue']();
  }
  // Blockly editor.
  return Blockly.JavaScript.workspaceToCode(BlocklyInterface.workspace);
};

/**
 * Highlight the block (or clear highlighting).
 * @param {?string} id ID of block that triggered this action.
 * @param {boolean=} opt_state If undefined, highlight specified block and
 * automatically unhighlight all others.  If true or false, manually
 * highlight/unhighlight the specified block.
 */
BlocklyCode.highlight = function(id, opt_state) {
  if (id) {
    const m = id.match(/^block_id_([^']+)$/);
    if (m) {
      id = m[1];
    }
  }
  BlocklyInterface.workspace.highlightBlock(id, opt_state);
};

/**
 * Convert the user's code to raw JavaScript.
 * @param {string} code Generated code.
 * @returns {string} The code without serial numbers.
 */
BlocklyCode.stripCode = function(code) {
  // Strip out serial numbers.
  code = code.replace(/(,\s*)?'block_id_[^']+'\)/g, ')');
  return code.replace(/\s+$/, '');
};


/**
 * Load the JavaScript interpreter.
 * Defer loading until page is loaded and responsive.
 */
BlocklyCode.importInterpreter = function() {
  function load() {
    //<script type="text/javascript"
    //  src="third-party/JS-Interpreter/compressed.js"></script>
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'third-party/JS-Interpreter/compressed.js';
    document.head.appendChild(script);
  }
  setTimeout(load, 1);
};

/**
 * Load the Prettify CSS and JavaScript.
 * Defer loading until page is loaded and responsive.
 */
BlocklyCode.importPrettify = function() {
  function load() {
    //<link rel="stylesheet" type="text/css" href="common/prettify.css">
    //<script type="text/javascript" src="common/prettify.js"></script>
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = 'common/prettify.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'common/prettify.js';
    document.head.appendChild(script);
  }
  setTimeout(load, 1);
};

/**
 * Congratulates the user for completing the level and offers to
 * direct them to the next level, if available.
 */
BlocklyCode.congratulations = function() {
  const content = BlocklyGames.getElementById('dialogDone');
  const style = {
    width: '40%',
    left: '30%',
    top: '3em',
  };

  // Add the user's code.
  const codeLangBar = BlocklyGames.getElementById('codeLangBar');
  if (BlocklyInterface.workspace) {
    if (codeLangBar) {
      codeLangBar.style.display = '';
    }
    BlocklyCode.setUpCodeLanguageBar_();
    BlocklyCode.renderCode_();
  } else if (codeLangBar) {
    // Text-editor levels have no blocks to translate.
    codeLangBar.style.display = 'none';
  }

  let levelMsg;
  if (BlocklyGames.LEVEL < BlocklyGames.MAX_LEVEL) {
    levelMsg = BlocklyGames.getMsg('Games.nextLevel', false)
        .replace('%1', String(BlocklyGames.LEVEL + 1));
  } else {
    levelMsg = BlocklyGames.getMsg('Games.finalLevel', false);
  }

  const ok = BlocklyGames.getElementById('doneOk');
  ok.addEventListener('click', BlocklyInterface.nextLevel, true);
  ok.addEventListener('touchend', BlocklyInterface.nextLevel, true);

  BlocklyDialogs.showDialog(content, null, false, true, style,
      function() {
        document.body.removeEventListener('keydown',
            BlocklyCode.congratulationsKeyDown_, true);
        });
  document.body.addEventListener('keydown',
      BlocklyCode.congratulationsKeyDown_, true);

  BlocklyGames.getElementById('dialogDoneText').textContent = levelMsg;
};

/**
 * If the user presses enter, escape, or space, hide the dialog.
 * Enter and space move to the next level, escape does not.
 * @param {!Event} e Keyboard event.
 * @private
 */
BlocklyCode.congratulationsKeyDown_ = function(e) {
  if (e.target && e.target.classList &&
      e.target.classList.contains('codeLang')) {
    // Let the language buttons receive Enter and Space normally.
    return;
  }
  BlocklyDialogs.dialogKeyDown(e);
  if (e.keyCode === 13 || e.keyCode === 32) {
    BlocklyInterface.nextLevel();
  }
};