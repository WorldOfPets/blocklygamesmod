/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Python code generator for every Blockly Games block.
 *
 * The games only ever needed JavaScript, so this repository ships just the
 * JavaScript generators.  The 'done' dialog can now show the user's program
 * as Python too, so this file adds a small Python generator covering the
 * standard blocks that the toolboxes expose plus the blocks of each game.
 */
'use strict';

goog.provide('BlocklyGames.Python');

goog.require('Blockly');
goog.require('Blockly.Generator');
goog.require('Blockly.Names');
goog.require('Blockly.Variables');
goog.require('Blockly.constants');
goog.require('Blockly.inputTypes');
goog.require('Blockly.utils.object');
goog.require('Blockly.utils.string');


/**
 * Python code generator.
 * @type {!Blockly.Generator}
 */
BlocklyGames.Python = new Blockly.Generator('Python');

BlocklyGames.Python.addReservedWords(
    'False,None,True,and,as,assert,async,await,break,class,continue,def,del,' +
    'elif,else,except,finally,for,from,global,if,import,in,is,lambda,' +
    'nonlocal,not,or,pass,raise,return,try,while,with,yield,' +
    'print,len,range,int,str,float,abs,min,max,round,list,dict,set,tuple,' +
    'math,random,' +
    Object.getOwnPropertyNames(Blockly.utils.global).join(','));

/**
 * Python uses four-space indentation.
 * @type {string}
 */
BlocklyGames.Python.INDENT = '    ';

/**
 * Order of operation ENUMs.  Smaller numbers bind more tightly.
 */
BlocklyGames.Python.ORDER_ATOMIC = 0;
BlocklyGames.Python.ORDER_MEMBER = 1;
BlocklyGames.Python.ORDER_FUNCTION_CALL = 2;
BlocklyGames.Python.ORDER_EXPONENTIATION = 3;
BlocklyGames.Python.ORDER_UNARY = 4;
BlocklyGames.Python.ORDER_MULTIPLICATIVE = 5;
BlocklyGames.Python.ORDER_ADDITIVE = 6;
BlocklyGames.Python.ORDER_RELATIONAL = 7;
BlocklyGames.Python.ORDER_LOGICAL_NOT = 8;
BlocklyGames.Python.ORDER_LOGICAL_AND = 9;
BlocklyGames.Python.ORDER_LOGICAL_OR = 10;
BlocklyGames.Python.ORDER_TERNARY = 11;
BlocklyGames.Python.ORDER_ASSIGNMENT = 12;
BlocklyGames.Python.ORDER_NONE = 99;


/**
 * Encode a string as a properly escaped Python string.
 * @param {string} string Text to encode.
 * @returns {string} Quoted Python string.
 * @private
 */
BlocklyGames.Python.quote_ = function(string) {
  string = String(string)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  return '\'' + string + '\'';
};

/**
 * Encode a multiline string as a Python string.
 * @param {string} string Text to encode.
 * @returns {string} Quoted Python string.
 * @private
 */
BlocklyGames.Python.multiline_quote_ = function(string) {
  return BlocklyGames.Python.quote_(String(string).replace(/\n/g, '\\n'));
};

/**
 * Register a helper function that will be printed above the program.
 * @param {string} name Desired helper name.
 * @param {string} code Python source of the helper.
 * @protected
 */
BlocklyGames.Python.addHelper_ = function(name, code) {
  BlocklyGames.Python.definitions_['%' + name] = code;
};

/**
 * Ensure a indented block is not empty (Python needs 'pass').
 * @param {string} branch Generated statements, already indented.
 * @returns {string} Non-empty branch.
 * @protected
 */
BlocklyGames.Python.orPass_ = function(branch) {
  return branch.trim() ? branch : BlocklyGames.Python.INDENT + 'pass\n';
};

/**
 * Prepare a value to be indexed or called as a method.
 * @param {string} code Generated expression.
 * @returns {string} Expression safe to put before '[' or '.'.
 * @protected
 */
BlocklyGames.Python.atomize_ = function(code) {
  return /^[\w.]+$/.test(code) ? code : '(' + code + ')';
};

/**
 * Start code generation (called by workspaceToCode).
 * @param {!Blockly.Workspace} workspace Workspace to generate code from.
 */
BlocklyGames.Python.init = function(workspace) {
  Object.getPrototypeOf(this).init.call(this, workspace);
  if (!BlocklyGames.Python.nameDB_) {
    BlocklyGames.Python.nameDB_ = new Blockly.Names(BlocklyGames.Python.RESERVED_WORDS_);
  } else {
    BlocklyGames.Python.nameDB_.reset();
  }
  BlocklyGames.Python.nameDB_.setVariableMap(workspace.getVariableMap());
  BlocklyGames.Python.nameDB_.populateVariables(workspace);
  BlocklyGames.Python.nameDB_.populateProcedures(workspace);
  BlocklyGames.Python.needsMath_ = false;
  BlocklyGames.Python.needsRandom_ = false;
  BlocklyGames.Python.startCount_ = 0;
};

/**
 * Finish code generation, prepending imports and helper functions.
 * @param {string} code Generated code.
 * @returns {string} Complete program.
 */
BlocklyGames.Python.finish = function(code) {
  const definitions = Blockly.utils.object.values(BlocklyGames.Python.definitions_);
  code = Object.getPrototypeOf(this).finish.call(this, code);
  BlocklyGames.Python.isInitialized = false;
  BlocklyGames.Python.nameDB_.reset();
  const parts = [];
  let imports = '';
  if (BlocklyGames.Python.needsMath_) {
    imports += 'import math\n';
  }
  if (BlocklyGames.Python.needsRandom_) {
    imports += 'import random\n';
  }
  if (imports) {
    parts.push(imports.replace(/\n$/, ''));
  }
  if (definitions.length) {
    parts.push(definitions.join('\n\n'));
  }
  parts.push(code);
  return parts.join('\n\n');
};

/**
 * Common tasks for generating Python from blocks.
 * @param {!Blockly.Block} block The current block.
 * @param {string} code The code created for this block.
 * @param {boolean=} opt_thisOnly True to generate code for only this statement.
 * @returns {string} Code with comments and subsequent blocks added.
 * @protected
 */
BlocklyGames.Python.scrub_ = function(block, code, opt_thisOnly) {
  let commentCode = '';
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    let comment = block.getCommentText();
    if (comment) {
      comment = Blockly.utils.string.wrap(comment, BlocklyGames.Python.COMMENT_WRAP - 3);
      commentCode += BlocklyGames.Python.prefixLines(comment + '\n', '# ');
    }
    for (let i = 0; i < block.inputList.length; i++) {
      if (block.inputList[i].type === Blockly.inputTypes.VALUE) {
        const childBlock = block.inputList[i].connection.targetBlock();
        if (childBlock) {
          comment = BlocklyGames.Python.allNestedComments(childBlock);
          if (comment) {
            commentCode += BlocklyGames.Python.prefixLines(comment, '# ');
          }
        }
      }
    }
  }
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = opt_thisOnly ? '' : BlocklyGames.Python.blockToCode(nextBlock);
  return commentCode + code + nextCode;
};

/**
 * Naked values are not legal Python statements; keep them visible.
 * @param {string} line Line of generated code.
 * @returns {string} Legal line of code.
 */
BlocklyGames.Python.scrubNakedValue = function(line) {
  return line + '\n';
};

/**
 * Generate Python for a workspace, replacing unsupported blocks with
 * placeholders instead of throwing (the user should always see their code).
 * @param {!Blockly.Workspace} workspace Workspace to generate code from.
 * @returns {string} Generated Python.
 */
BlocklyGames.Python.safeWorkspaceToCode = function(workspace) {
  if (!workspace) {
    return '';
  }
  const blocks = workspace.getAllBlocks(false);
  for (let i = 0; i < blocks.length; i++) {
    const type = blocks[i].type;
    if (typeof this[type] !== 'function') {
      if (blocks[i].outputConnection) {
        this[type] = function() {
          return ['None', BlocklyGames.Python.ORDER_ATOMIC];
        };
      } else {
        this[type] = function(block) {
          return '# TODO: ' + block.type + '\n';
        };
      }
    }
  }
  return BlocklyGames.Python.workspaceToCode(workspace);
};


// ---------------------------------------------------------------------------
// Logic.
// ---------------------------------------------------------------------------

BlocklyGames.Python['controls_if'] = function(block) {
  let n = 0;
  let code = '';
  let keyword = 'if ';
  do {
    if (block.getInput('IF' + n)) {
      const condition = BlocklyGames.Python.valueToCode(block, 'IF' + n, BlocklyGames.Python.ORDER_NONE) ||
          'False';
      const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO' + n));
      code += keyword + condition + ':\n' + branch;
      keyword = 'elif ';
    }
    n++;
  } while (block.getInput('IF' + n));
  if (block.getInput('ELSE')) {
    code += 'else:\n' + BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'ELSE'));
  }
  return code;
};

BlocklyGames.Python['logic_compare'] = function(block) {
  const OPERATORS = {
    'EQ': ' == ', 'NEQ': ' != ', 'LT': ' < ',
    'LTE': ' <= ', 'GT': ' > ', 'GTE': ' >= ',
  };
  const operator = OPERATORS[block.getFieldValue('OP')];
  const order = BlocklyGames.Python.ORDER_RELATIONAL;
  const argument0 = BlocklyGames.Python.valueToCode(block, 'A', order) || '0';
  const argument1 = BlocklyGames.Python.valueToCode(block, 'B', order) || '0';
  return [argument0 + operator + argument1, order];
};

BlocklyGames.Python['logic_operation'] = function(block) {
  const isAnd = block.getFieldValue('OP') === 'AND';
  const order = isAnd ? BlocklyGames.Python.ORDER_LOGICAL_AND : BlocklyGames.Python.ORDER_LOGICAL_OR;
  let argument0 = BlocklyGames.Python.valueToCode(block, 'A', order);
  let argument1 = BlocklyGames.Python.valueToCode(block, 'B', order);
  if (!argument0 && !argument1) {
    argument0 = 'False';
    argument1 = 'False';
  } else {
    if (!argument0) {
      argument0 = isAnd ? 'True' : 'False';
    }
    if (!argument1) {
      argument1 = isAnd ? 'True' : 'False';
    }
  }
  return [argument0 + (isAnd ? ' and ' : ' or ') + argument1, order];
};

BlocklyGames.Python['logic_negate'] = function(block) {
  const argument = BlocklyGames.Python.valueToCode(
      block, 'BOOL', BlocklyGames.Python.ORDER_LOGICAL_NOT) || 'True';
  return ['not ' + argument, BlocklyGames.Python.ORDER_LOGICAL_NOT];
};

BlocklyGames.Python['logic_boolean'] = function(block) {
  return [block.getFieldValue('BOOL') === 'TRUE' ? 'True' : 'False',
          BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['logic_ternary'] = function(block) {
  const valueIf = BlocklyGames.Python.valueToCode(block, 'IF', BlocklyGames.Python.ORDER_TERNARY) || 'None';
  const valueThen = BlocklyGames.Python.valueToCode(block, 'THEN', BlocklyGames.Python.ORDER_TERNARY) || 'None';
  const valueElse = BlocklyGames.Python.valueToCode(block, 'ELSE', BlocklyGames.Python.ORDER_TERNARY) || 'None';
  return [valueThen + ' if ' + valueIf + ' else ' + valueElse,
          BlocklyGames.Python.ORDER_TERNARY];
};


// ---------------------------------------------------------------------------
// Loops.
// ---------------------------------------------------------------------------

BlocklyGames.Python['controls_repeat_ext'] = function(block) {
  let repeats;
  if (block.getField('TIMES')) {
    repeats = String(Number(block.getFieldValue('TIMES')));
  } else {
    repeats = BlocklyGames.Python.valueToCode(block, 'TIMES', BlocklyGames.Python.ORDER_NONE) || '0';
  }
  const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  const loopVar = BlocklyGames.Python.nameDB_.getDistinctName(
      'count', Blockly.VARIABLE_CATEGORY_NAME);
  return 'for ' + loopVar + ' in range(int(' + repeats + ')):\n' + branch;
};

BlocklyGames.Python['controls_repeat'] =
    BlocklyGames.Python['controls_repeat_ext'];

BlocklyGames.Python['controls_whileUntil'] = function(block) {
  const until = block.getFieldValue('MODE') === 'UNTIL';
  let argument = BlocklyGames.Python.valueToCode(
      block, 'BOOL', until ? BlocklyGames.Python.ORDER_LOGICAL_NOT : BlocklyGames.Python.ORDER_NONE) ||
      'False';
  if (until) {
    argument = 'not ' + argument;
  }
  const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  return 'while ' + argument + ':\n' + branch;
};

BlocklyGames.Python['controls_for'] = function(block) {
  const variable = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  const start = BlocklyGames.Python.valueToCode(block, 'FROM', BlocklyGames.Python.ORDER_NONE) || '0';
  const end = BlocklyGames.Python.valueToCode(block, 'TO', BlocklyGames.Python.ORDER_NONE) || '0';
  const step = BlocklyGames.Python.valueToCode(block, 'BY', BlocklyGames.Python.ORDER_NONE) || '1';
  BlocklyGames.Python.addHelper_('blockly_range',
      'def blockly_range(start, end, step):\n' +
      BlocklyGames.Python.INDENT + '"""Count from start to end inclusive, in either ' +
      'direction."""\n' +
      BlocklyGames.Python.INDENT + 'step = abs(int(step)) or 1\n' +
      BlocklyGames.Python.INDENT + 'if start > end:\n' +
      BlocklyGames.Python.INDENT + BlocklyGames.Python.INDENT + 'step = -step\n' +
      BlocklyGames.Python.INDENT + 'return range(int(start), int(end) + ' +
      '(1 if step > 0 else -1), step)');
  const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  return 'for ' + variable + ' in blockly_range(' + start + ', ' + end +
      ', ' + step + '):\n' + branch;
};

BlocklyGames.Python['controls_forEach'] = function(block) {
  const variable = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  const list = BlocklyGames.Python.valueToCode(block, 'LIST', BlocklyGames.Python.ORDER_NONE) || '[]';
  const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  return 'for ' + variable + ' in ' + list + ':\n' + branch;
};

BlocklyGames.Python['controls_flow_statements'] = function(block) {
  switch (block.getFieldValue('FLOW')) {
    case 'BREAK':
      return 'break\n';
    case 'CONTINUE':
      return 'continue\n';
  }
  throw Error('Unknown flow statement.');
};


// ---------------------------------------------------------------------------
// Math.
// ---------------------------------------------------------------------------

BlocklyGames.Python['math_number'] = function(block) {
  const code = String(Number(block.getFieldValue('NUM')));
  const order = Number(code) >= 0 ? BlocklyGames.Python.ORDER_ATOMIC : BlocklyGames.Python.ORDER_UNARY;
  return [code, order];
};

BlocklyGames.Python['math_arithmetic'] = function(block) {
  const OPERATORS = {
    'ADD': [' + ', BlocklyGames.Python.ORDER_ADDITIVE],
    'MINUS': [' - ', BlocklyGames.Python.ORDER_ADDITIVE],
    'MULTIPLY': [' * ', BlocklyGames.Python.ORDER_MULTIPLICATIVE],
    'DIVIDE': [' / ', BlocklyGames.Python.ORDER_MULTIPLICATIVE],
    'POWER': [null, BlocklyGames.Python.ORDER_NONE],
  };
  const tuple = OPERATORS[block.getFieldValue('OP')];
  const operator = tuple[0];
  const order = tuple[1];
  const argument0 = BlocklyGames.Python.valueToCode(block, 'A', order) || '0';
  const argument1 = BlocklyGames.Python.valueToCode(block, 'B', order) || '0';
  if (!operator) {
    BlocklyGames.Python.needsMath_ = true;
    return ['math.pow(' + argument0 + ', ' + argument1 + ')',
            BlocklyGames.Python.ORDER_FUNCTION_CALL];
  }
  return [argument0 + operator + argument1, order];
};

BlocklyGames.Python['math_single'] = function(block) {
  const operator = block.getFieldValue('OP');
  let arg = BlocklyGames.Python.valueToCode(block, 'NUM', BlocklyGames.Python.ORDER_NONE) || '0';
  switch (operator) {
    case 'ROOT':
      BlocklyGames.Python.needsMath_ = true;
      return ['math.sqrt(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'ABS':
      return ['abs(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'NEG':
      if (arg.charAt(0) === '-') {
        arg = '(' + arg + ')';
      }
      return ['-' + arg, BlocklyGames.Python.ORDER_UNARY];
    case 'LN':
      BlocklyGames.Python.needsMath_ = true;
      return ['math.log(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'LOG10':
      BlocklyGames.Python.needsMath_ = true;
      return ['math.log10(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'EXP':
      BlocklyGames.Python.needsMath_ = true;
      return ['math.exp(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'POW10':
      return ['10 ** (' + arg + ')', BlocklyGames.Python.ORDER_EXPONENTIATION];
  }
  throw Error('Unknown math operator: ' + operator);
};

BlocklyGames.Python['math_trig'] = function(block) {
  const operator = block.getFieldValue('OP');
  const arg = BlocklyGames.Python.valueToCode(block, 'NUM', BlocklyGames.Python.ORDER_NONE) || '0';
  BlocklyGames.Python.needsMath_ = true;
  const FUNCTIONS = {
    'SIN': 'math.sin(math.radians(' + arg + '))',
    'COS': 'math.cos(math.radians(' + arg + '))',
    'TAN': 'math.tan(math.radians(' + arg + '))',
    'ASIN': 'math.degrees(math.asin(' + arg + '))',
    'ACOS': 'math.degrees(math.acos(' + arg + '))',
    'ATAN': 'math.degrees(math.atan(' + arg + '))',
  };
  return [FUNCTIONS[operator], BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['math_constant'] = function(block) {
  const CONSTANTS = {
    'PI': ['math.pi', BlocklyGames.Python.ORDER_MEMBER],
    'E': ['math.e', BlocklyGames.Python.ORDER_MEMBER],
    'GOLDEN_RATIO': ['(1 + math.sqrt(5)) / 2', BlocklyGames.Python.ORDER_ADDITIVE],
    'SQRT2': ['math.sqrt(2)', BlocklyGames.Python.ORDER_FUNCTION_CALL],
    'SQRT1_2': ['math.sqrt(0.5)', BlocklyGames.Python.ORDER_FUNCTION_CALL],
    'INFINITY': ['float(\'inf\')', BlocklyGames.Python.ORDER_FUNCTION_CALL],
  };
  const constant = CONSTANTS[block.getFieldValue('CONSTANT')];
  if (constant[0].indexOf('math.') !== -1) {
    BlocklyGames.Python.needsMath_ = true;
  }
  return constant;
};

BlocklyGames.Python['math_number_property'] = function(block) {
  const number = BlocklyGames.Python.valueToCode(block, 'NUMBER_TO_CHECK',
      BlocklyGames.Python.ORDER_MULTIPLICATIVE) || '0';
  const property = block.getFieldValue('PROPERTY');
  switch (property) {
    case 'EVEN':
      return [number + ' % 2 == 0', BlocklyGames.Python.ORDER_RELATIONAL];
    case 'ODD':
      return [number + ' % 2 != 0', BlocklyGames.Python.ORDER_RELATIONAL];
    case 'WHOLE':
      return [number + ' % 1 == 0', BlocklyGames.Python.ORDER_RELATIONAL];
    case 'POSITIVE':
      return [number + ' > 0', BlocklyGames.Python.ORDER_RELATIONAL];
    case 'NEGATIVE':
      return [number + ' < 0', BlocklyGames.Python.ORDER_RELATIONAL];
    case 'DIVISIBLE_BY':
      const divisor = BlocklyGames.Python.valueToCode(block, 'DIVISOR',
          BlocklyGames.Python.ORDER_MULTIPLICATIVE) || '1';
      return [number + ' % ' + divisor + ' == 0', BlocklyGames.Python.ORDER_RELATIONAL];
    case 'PRIME':
      BlocklyGames.Python.needsMath_ = true;
      BlocklyGames.Python.addHelper_('is_prime',
          'def is_prime(n):\n' +
          BlocklyGames.Python.INDENT + 'n = abs(int(n))\n' +
          BlocklyGames.Python.INDENT + 'if n < 2:\n' +
          BlocklyGames.Python.INDENT + BlocklyGames.Python.INDENT + 'return False\n' +
          BlocklyGames.Python.INDENT + 'for i in range(2, int(math.sqrt(n)) + 1):\n' +
          BlocklyGames.Python.INDENT + BlocklyGames.Python.INDENT + 'if n % i == 0:\n' +
          BlocklyGames.Python.INDENT + BlocklyGames.Python.INDENT + BlocklyGames.Python.INDENT + 'return False\n' +
          BlocklyGames.Python.INDENT + 'return True');
      return ['is_prime(' + number + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
  }
  throw Error('Unknown property: ' + property);
};

BlocklyGames.Python['math_round'] = function(block) {
  const operator = block.getFieldValue('OP');
  const arg = BlocklyGames.Python.valueToCode(block, 'NUM', BlocklyGames.Python.ORDER_NONE) || '0';
  switch (operator) {
    case 'ROUND':
      return ['round(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'ROUNDUP':
      BlocklyGames.Python.needsMath_ = true;
      return ['math.ceil(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    case 'ROUNDDOWN':
      BlocklyGames.Python.needsMath_ = true;
      return ['math.floor(' + arg + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
  }
  throw Error('Unknown rounding operator: ' + operator);
};

BlocklyGames.Python['math_modulo'] = function(block) {
  const argument0 = BlocklyGames.Python.valueToCode(block, 'DIVIDEND',
      BlocklyGames.Python.ORDER_MULTIPLICATIVE) || '0';
  const argument1 = BlocklyGames.Python.valueToCode(block, 'DIVISOR',
      BlocklyGames.Python.ORDER_MULTIPLICATIVE) || '1';
  return [argument0 + ' % ' + argument1, BlocklyGames.Python.ORDER_MULTIPLICATIVE];
};

BlocklyGames.Python['math_constrain'] = function(block) {
  const value = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '0';
  const low = BlocklyGames.Python.valueToCode(block, 'LOW', BlocklyGames.Python.ORDER_NONE) || '0';
  const high = BlocklyGames.Python.valueToCode(block, 'HIGH', BlocklyGames.Python.ORDER_NONE) || '0';
  return ['min(max(' + value + ', ' + low + '), ' + high + ')',
          BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['math_random_int'] = function(block) {
  const argument0 = BlocklyGames.Python.valueToCode(block, 'FROM', BlocklyGames.Python.ORDER_NONE) || '0';
  const argument1 = BlocklyGames.Python.valueToCode(block, 'TO', BlocklyGames.Python.ORDER_NONE) || '0';
  BlocklyGames.Python.needsRandom_ = true;
  return ['random.randint(int(' + argument0 + '), int(' + argument1 + '))',
          BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['math_random_float'] = function(_block) {
  BlocklyGames.Python.needsRandom_ = true;
  return ['random.random()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['math_change'] = function(block) {
  const argument = BlocklyGames.Python.valueToCode(block, 'DELTA', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
  const variable = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return variable + ' += ' + argument + '\n';
};


// ---------------------------------------------------------------------------
// Text.
// ---------------------------------------------------------------------------

BlocklyGames.Python['text'] = function(block) {
  return [BlocklyGames.Python.quote_(block.getFieldValue('TEXT')), BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['text_print'] = function(block) {
  const argument = BlocklyGames.Python.valueToCode(block, 'TEXT', BlocklyGames.Python.ORDER_NONE) || '\'\'';
  return 'print(' + argument + ')\n';
};

BlocklyGames.Python['text_join'] = function(block) {
  const parts = [];
  for (let i = 0; i < block.itemCount_; i++) {
    parts.push('str(' + (BlocklyGames.Python.valueToCode(
        block, 'ADD' + i, BlocklyGames.Python.ORDER_NONE) || '\'\'') + ')');
  }
  return [parts.join(' + ') || '\'\'', BlocklyGames.Python.ORDER_ADDITIVE];
};

BlocklyGames.Python['text_length'] = function(block) {
  const text = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '\'\'';
  return ['len(' + text + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['text_isEmpty'] = function(block) {
  const text = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '\'\'';
  return ['not len(' + text + ')', BlocklyGames.Python.ORDER_LOGICAL_NOT];
};

BlocklyGames.Python['text_changeCase'] = function(block) {
  const text = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'TEXT', BlocklyGames.Python.ORDER_MEMBER) || '\'\'');
  const op = block.getFieldValue('CASE');
  const METHOD = {'UPPERCASE': '.upper()', 'LOWERCASE': '.lower()',
                  'TITLECASE': '.title()'};
  return [text + METHOD[op], BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['text_trim'] = function(block) {
  const text = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'TEXT', BlocklyGames.Python.ORDER_MEMBER) || '\'\'');
  const op = block.getFieldValue('MODE') === 'LEFT' ? '.lstrip()' :
      (block.getFieldValue('MODE') === 'RIGHT' ? '.rstrip()' : '.strip()');
  return [text + op, BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['text_indexOf'] = function(block) {
  const haystack = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_MEMBER) || '\'\'');
  const needle = BlocklyGames.Python.valueToCode(block, 'FIND', BlocklyGames.Python.ORDER_NONE) || '\'\'';
  if (block.getFieldValue('END') === 'FIRST') {
    return [haystack + '.find(' + needle + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
  }
  return [haystack + '.rfind(' + needle + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['text_charAt'] = function(block) {
  const text = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_MEMBER) || '\'\'');
  const where = block.getFieldValue('WHERE');
  if (where === 'FIRST') {
    return [text + '[0]', BlocklyGames.Python.ORDER_MEMBER];
  } else if (where === 'LAST') {
    return [text + '[-1]', BlocklyGames.Python.ORDER_MEMBER];
  } else if (where === 'FROM_START') {
    const at = BlocklyGames.Python.valueToCode(block, 'AT', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
    return [text + '[' + at + ']', BlocklyGames.Python.ORDER_MEMBER];
  } else {
    const at = BlocklyGames.Python.valueToCode(block, 'AT', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
    return [text + '[-' + at + ' - 1]', BlocklyGames.Python.ORDER_MEMBER];
  }
};

BlocklyGames.Python['text_getSubstring'] = function(block) {
  return [BlocklyGames.Python.getSubstring_(block, 'STRING'), BlocklyGames.Python.ORDER_MEMBER];
};


// ---------------------------------------------------------------------------
// Lists.
// ---------------------------------------------------------------------------

BlocklyGames.Python['lists_create_with'] = function(block) {
  const elements = [];
  for (let i = 0; i < block.itemCount_; i++) {
    elements.push(BlocklyGames.Python.valueToCode(block, 'ADD' + i, BlocklyGames.Python.ORDER_NONE) || 'None');
  }
  return ['[' + elements.join(', ') + ']', BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['lists_repeat'] = function(block) {
  const item = BlocklyGames.Python.valueToCode(block, 'ITEM', BlocklyGames.Python.ORDER_NONE) || 'None';
  const num = BlocklyGames.Python.valueToCode(block, 'NUM', BlocklyGames.Python.ORDER_MULTIPLICATIVE) || '0';
  return ['[' + item + '] * int(' + num + ')', BlocklyGames.Python.ORDER_MULTIPLICATIVE];
};

BlocklyGames.Python['lists_length'] = function(block) {
  const list = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '[]';
  return ['len(' + list + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['lists_isEmpty'] = function(block) {
  const list = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '[]';
  return ['not len(' + list + ')', BlocklyGames.Python.ORDER_LOGICAL_NOT];
};

BlocklyGames.Python['lists_indexOf'] = function(block) {
  const list = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_MEMBER) || '[]');
  const item = BlocklyGames.Python.valueToCode(block, 'FIND', BlocklyGames.Python.ORDER_NONE) || 'None';
  if (block.getFieldValue('END') === 'FIRST') {
    return ['(' + list + '.index(' + item + ') if ' + item + ' in ' + list +
        ' else -1)', BlocklyGames.Python.ORDER_TERNARY];
  }
  return ['(len(' + list + ') - 1 - ' + list + '[::-1].index(' + item +
      ') if ' + item + ' in ' + list + ' else -1)', BlocklyGames.Python.ORDER_TERNARY];
};

BlocklyGames.Python['lists_getIndex'] = function(block) {
  const list = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_MEMBER) || '[]');
  const mode = block.getFieldValue('MODE');
  const where = block.getFieldValue('WHERE');
  if (where === 'RANDOM') {
    BlocklyGames.Python.needsRandom_ = true;
    const index = 'random.randint(0, len(' + list + ') - 1)';
    if (mode === 'GET') {
      return [list + '[' + index + ']', BlocklyGames.Python.ORDER_MEMBER];
    }
    return [list + '.pop(' + index + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
  }
  let index;
  if (where === 'FIRST') {
    index = '0';
  } else if (where === 'LAST') {
    index = '-1';
  } else if (where === 'FROM_START') {
    index = BlocklyGames.Python.valueToCode(block, 'AT', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
  } else {
    const at = BlocklyGames.Python.valueToCode(block, 'AT', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
    index = '-' + at + ' - 1';
  }
  if (mode !== 'GET') {
    if (where === 'LAST') {
      return [list + '.pop()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
    }
    return [list + '.pop(' + index + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
  }
  return [list + '[' + index + ']', BlocklyGames.Python.ORDER_MEMBER];
};

BlocklyGames.Python['lists_setIndex'] = function(block) {
  const list = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, 'LIST', BlocklyGames.Python.ORDER_MEMBER) || '[]');
  const value = BlocklyGames.Python.valueToCode(block, 'TO', BlocklyGames.Python.ORDER_NONE) || 'None';
  const where = block.getFieldValue('WHERE');
  const insert = block.getFieldValue('MODE') === 'INSERT';
  if (where === 'LAST' && insert) {
    return list + '.append(' + value + ')\n';
  }
  if (where === 'RANDOM') {
    BlocklyGames.Python.needsRandom_ = true;
    if (insert) {
      return list + '.insert(random.randint(0, len(' + list + ') - 1), ' +
          value + ')\n';
    }
    return list + '[random.randint(0, len(' + list + ') - 1)] = ' + value + '\n';
  }
  let index;
  if (where === 'FIRST') {
    index = '0';
  } else if (where === 'LAST') {
    index = '-1';
  } else if (where === 'FROM_START') {
    index = BlocklyGames.Python.valueToCode(block, 'AT', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
  } else {
    const at = BlocklyGames.Python.valueToCode(block, 'AT', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
    index = '-' + at + ' - 1';
  }
  if (insert) {
    return list + '.insert(' + index + ', ' + value + ')\n';
  }
  return list + '[' + index + '] = ' + value + '\n';
};

BlocklyGames.Python['lists_getSublist'] = function(block) {
  return [BlocklyGames.Python.getSubstring_(block, 'LIST'), BlocklyGames.Python.ORDER_MEMBER];
};

/**
 * Build a Python slice for the two 'WHERE' fields of a substring block.
 * @param {!Blockly.Block} block Block with WHERE1/AT1/WHERE2/AT2 fields.
 * @param {string} valueName Name of the input holding the sequence.
 * @returns {string} Python slice expression.
 * @private
 */
BlocklyGames.Python.getSubstring_ = function(block, valueName) {
  const sequence = BlocklyGames.Python.atomize_(
      BlocklyGames.Python.valueToCode(block, valueName, BlocklyGames.Python.ORDER_MEMBER) || '[]');
  const where1 = block.getFieldValue('WHERE1');
  const where2 = block.getFieldValue('WHERE2');
  let at1 = '';
  let at2 = '';
  if (where1 === 'FROM_START' || where1 === 'FROM_END') {
    at1 = BlocklyGames.Python.valueToCode(block, 'AT1', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
  }
  if (where2 === 'FROM_START' || where2 === 'FROM_END') {
    at2 = BlocklyGames.Python.valueToCode(block, 'AT2', BlocklyGames.Python.ORDER_ADDITIVE) || '0';
  }
  let start = '';
  let end = '';
  if (where1 === 'FROM_START') {
    start = at1;
  } else if (where1 === 'FROM_END') {
    start = '-' + at1 + ' - 1';
  }
  if (where2 === 'FROM_START') {
    end = at2 + ' + 1';
  } else if (where2 === 'FROM_END') {
    end = '-' + at2;
  }
  return sequence + '[' + start + ':' + end + ']';
};

BlocklyGames.Python['lists_sort'] = function(block) {
  const list = BlocklyGames.Python.valueToCode(block, 'LIST', BlocklyGames.Python.ORDER_NONE) || '[]';
  return ['sorted(' + list + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['lists_reverse'] = function(block) {
  const list = BlocklyGames.Python.valueToCode(block, 'LIST', BlocklyGames.Python.ORDER_NONE) || '[]';
  return ['list(reversed(' + list + '))', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};


// ---------------------------------------------------------------------------
// Colour.
// ---------------------------------------------------------------------------

BlocklyGames.Python['colour_picker'] = function(block) {
  return [BlocklyGames.Python.quote_(block.getFieldValue('COLOUR')), BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['colour_random'] = function(_block) {
  BlocklyGames.Python.needsRandom_ = true;
  return ['\'#%06x\' % random.randint(0, 0xffffff)', BlocklyGames.Python.ORDER_MULTIPLICATIVE];
};

BlocklyGames.Python['colour_rgb'] = function(block) {
  const red = BlocklyGames.Python.valueToCode(block, 'RED', BlocklyGames.Python.ORDER_NONE) || '0';
  const green = BlocklyGames.Python.valueToCode(block, 'GREEN', BlocklyGames.Python.ORDER_NONE) || '0';
  const blue = BlocklyGames.Python.valueToCode(block, 'BLUE', BlocklyGames.Python.ORDER_NONE) || '0';
  BlocklyGames.Python.addHelper_('colour_rgb',
      'def colour_rgb(r, g, b):\n' +
      BlocklyGames.Python.INDENT + '"""Make a colour from red, green and blue (0-100)."""\n' +
      BlocklyGames.Python.INDENT + 'r = int(min(255, max(0, round(r * 2.55))))\n' +
      BlocklyGames.Python.INDENT + 'g = int(min(255, max(0, round(g * 2.55))))\n' +
      BlocklyGames.Python.INDENT + 'b = int(min(255, max(0, round(b * 2.55))))\n' +
      BlocklyGames.Python.INDENT + 'return \'#%02x%02x%02x\' % (r, g, b)');
  return ['colour_rgb(' + red + ', ' + green + ', ' + blue + ')',
          BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['colour_blend'] = function(block) {
  const colour1 = BlocklyGames.Python.valueToCode(block, 'COLOUR1', BlocklyGames.Python.ORDER_NONE) ||
      '\'#000000\'';
  const colour2 = BlocklyGames.Python.valueToCode(block, 'COLOUR2', BlocklyGames.Python.ORDER_NONE) ||
      '\'#000000\'';
  const ratio = BlocklyGames.Python.valueToCode(block, 'RATIO', BlocklyGames.Python.ORDER_NONE) || '0.5';
  BlocklyGames.Python.addHelper_('colour_blend',
      'def colour_blend(colour1, colour2, ratio):\n' +
      BlocklyGames.Python.INDENT + '"""Blend two colours, 0 = colour1, 1 = colour2."""\n' +
      BlocklyGames.Python.INDENT + 'ratio = min(1, max(0, ratio))\n' +
      BlocklyGames.Python.INDENT + 'rgb1 = [int(colour1[i:i + 2], 16) for i in (1, 3, 5)]\n' +
      BlocklyGames.Python.INDENT + 'rgb2 = [int(colour2[i:i + 2], 16) for i in (1, 3, 5)]\n' +
      BlocklyGames.Python.INDENT + 'rgb = [round(a + (b - a) * ratio) ' +
      'for a, b in zip(rgb1, rgb2)]\n' +
      BlocklyGames.Python.INDENT + 'return \'#%02x%02x%02x\' % tuple(rgb)');
  return ['colour_blend(' + colour1 + ', ' + colour2 + ', ' + ratio + ')',
          BlocklyGames.Python.ORDER_FUNCTION_CALL];
};


// ---------------------------------------------------------------------------
// Variables.
// ---------------------------------------------------------------------------

BlocklyGames.Python['variables_get'] = function(block) {
  const code = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return [code, BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['variables_set'] = function(block) {
  const argument = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '0';
  const variable = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return variable + ' = ' + argument + '\n';
};


// ---------------------------------------------------------------------------
// Procedures.
// ---------------------------------------------------------------------------

BlocklyGames.Python['procedures_defreturn'] = function(block) {
  const funcName = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
  let body = BlocklyGames.Python.statementToCode(block, 'STACK');
  const returnValue = BlocklyGames.Python.valueToCode(block, 'RETURN', BlocklyGames.Python.ORDER_NONE);
  if (returnValue) {
    body += BlocklyGames.Python.INDENT + 'return ' + returnValue + '\n';
  }
  body = BlocklyGames.Python.orPass_(body);
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = BlocklyGames.Python.nameDB_.getName(
        variables[i], Blockly.VARIABLE_CATEGORY_NAME);
  }
  const code = 'def ' + funcName + '(' + args.join(', ') + '):\n' + body;
  BlocklyGames.Python.definitions_['%' + funcName] = code;
  return null;
};

BlocklyGames.Python['procedures_defnoreturn'] =
    BlocklyGames.Python['procedures_defreturn'];

BlocklyGames.Python['procedures_callreturn'] = function(block) {
  const funcName = BlocklyGames.Python.nameDB_.getName(
      block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = BlocklyGames.Python.valueToCode(block, 'ARG' + i, BlocklyGames.Python.ORDER_NONE) || 'None';
  }
  return [funcName + '(' + args.join(', ') + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['procedures_callnoreturn'] = function(block) {
  const tuple = BlocklyGames.Python['procedures_callreturn'](block);
  return tuple[0] + '\n';
};

BlocklyGames.Python['procedures_ifreturn'] = function(block) {
  const condition = BlocklyGames.Python.valueToCode(
      block, 'CONDITION', BlocklyGames.Python.ORDER_NONE) || 'False';
  let code = 'if ' + condition + ':\n';
  if (block.hasReturnValue_) {
    const value = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || 'None';
    code += BlocklyGames.Python.INDENT + 'return ' + value + '\n';
  } else {
    code += BlocklyGames.Python.INDENT + 'return\n';
  }
  return code;
};


// ---------------------------------------------------------------------------
// Maze.
// ---------------------------------------------------------------------------

BlocklyGames.Python['maze_moveForward'] = function(_block) {
  return 'moveForward()\n';
};

BlocklyGames.Python['maze_turn'] = function(block) {
  return block.getFieldValue('DIR') + '()\n';
};

BlocklyGames.Python['maze_if'] = function(block) {
  const argument = block.getFieldValue('DIR') + '()';
  const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  return 'if ' + argument + ':\n' + branch;
};

BlocklyGames.Python['maze_ifElse'] = function(block) {
  const argument = block.getFieldValue('DIR') + '()';
  const branch0 = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  const branch1 = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'ELSE'));
  return 'if ' + argument + ':\n' + branch0 + 'else:\n' + branch1;
};

BlocklyGames.Python['maze_forever'] = function(block) {
  const branch = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  return 'while notDone():\n' + branch;
};


// ---------------------------------------------------------------------------
// Bird.
// ---------------------------------------------------------------------------

BlocklyGames.Python['bird_noWorm'] = function(_block) {
  return ['noWorm()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['bird_heading'] = function(block) {
  const dir = Number(block.getFieldValue('ANGLE'));
  return 'heading(' + dir + ')\n';
};

BlocklyGames.Python['bird_position'] = function(block) {
  const code = 'get' + block.getFieldValue('XY').charAt(0) + '()';
  return [code, BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['bird_compare'] = function(block) {
  const operator = block.getFieldValue('OP') === 'LT' ? ' < ' : ' > ';
  const order = BlocklyGames.Python.ORDER_RELATIONAL;
  const argument0 = BlocklyGames.Python.valueToCode(block, 'A', order) || '0';
  const argument1 = BlocklyGames.Python.valueToCode(block, 'B', order) || '0';
  return [argument0 + operator + argument1, order];
};

BlocklyGames.Python['bird_and'] = function(block) {
  const order = BlocklyGames.Python.ORDER_LOGICAL_AND;
  let argument0 = BlocklyGames.Python.valueToCode(block, 'A', order);
  let argument1 = BlocklyGames.Python.valueToCode(block, 'B', order);
  if (!argument0 && !argument1) {
    argument0 = 'False';
    argument1 = 'False';
  } else {
    if (!argument0) {
      argument0 = 'True';
    }
    if (!argument1) {
      argument1 = 'True';
    }
  }
  return [argument0 + ' and ' + argument1, order];
};

BlocklyGames.Python['bird_ifElse'] = function(block) {
  const argument = BlocklyGames.Python.valueToCode(
      block, 'CONDITION', BlocklyGames.Python.ORDER_NONE) || 'False';
  const branch0 = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'DO'));
  const branch1 = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'ELSE'));
  return 'if ' + argument + ':\n' + branch0 + 'else:\n' + branch1;
};


// ---------------------------------------------------------------------------
// Turtle.
// ---------------------------------------------------------------------------

BlocklyGames.Python['turtle_move'] = function(block) {
  const value = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '0';
  return block.getFieldValue('DIR') + '(' + value + ')\n';
};

BlocklyGames.Python['turtle_move_internal'] = function(block) {
  return block.getFieldValue('DIR') + '(' +
      Number(block.getFieldValue('VALUE')) + ')\n';
};

BlocklyGames.Python['turtle_turn'] = function(block) {
  const value = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '0';
  return block.getFieldValue('DIR') + '(' + value + ')\n';
};

BlocklyGames.Python['turtle_turn_internal'] = function(block) {
  return block.getFieldValue('DIR') + '(' +
      Number(block.getFieldValue('VALUE')) + ')\n';
};

BlocklyGames.Python['turtle_width'] = function(block) {
  const width = BlocklyGames.Python.valueToCode(block, 'WIDTH', BlocklyGames.Python.ORDER_NONE) || '1';
  return 'penWidth(' + width + ')\n';
};

BlocklyGames.Python['turtle_pen'] = function(block) {
  return block.getFieldValue('PEN') + '()\n';
};

BlocklyGames.Python['turtle_colour'] = function(block) {
  const colour = BlocklyGames.Python.valueToCode(block, 'COLOUR', BlocklyGames.Python.ORDER_NONE) ||
      '\'#000000\'';
  return 'penColour(' + colour + ')\n';
};

BlocklyGames.Python['turtle_colour_internal'] = function(block) {
  return 'penColour(' + BlocklyGames.Python.quote_(block.getFieldValue('COLOUR')) + ')\n';
};

BlocklyGames.Python['turtle_visibility'] = function(block) {
  return block.getFieldValue('VISIBILITY') + '()\n';
};

BlocklyGames.Python['turtle_print'] = function(block) {
  const text = BlocklyGames.Python.valueToCode(block, 'TEXT', BlocklyGames.Python.ORDER_NONE) || '\'\'';
  return 'print(' + text + ')\n';
};

BlocklyGames.Python['turtle_font'] = function(block) {
  const font = BlocklyGames.Python.quote_(block.getFieldValue('FONT'));
  const fontSize = Number(block.getFieldValue('FONTSIZE'));
  const fontStyle = BlocklyGames.Python.quote_(block.getFieldValue('FONTSTYLE'));
  return 'font(' + font + ', ' + fontSize + ', ' + fontStyle + ')\n';
};

BlocklyGames.Python['turtle_repeat_internal'] =
    BlocklyGames.Python['controls_repeat'];


// ---------------------------------------------------------------------------
// Movie.
// ---------------------------------------------------------------------------

BlocklyGames.Python['movie_circle'] = function(block) {
  const x = BlocklyGames.Python.valueToCode(block, 'X', BlocklyGames.Python.ORDER_NONE) || '0';
  const y = BlocklyGames.Python.valueToCode(block, 'Y', BlocklyGames.Python.ORDER_NONE) || '0';
  const radius = BlocklyGames.Python.valueToCode(block, 'RADIUS', BlocklyGames.Python.ORDER_NONE) || '0';
  return 'circle(' + x + ', ' + y + ', ' + radius + ')\n';
};

BlocklyGames.Python['movie_rect'] = function(block) {
  const x = BlocklyGames.Python.valueToCode(block, 'X', BlocklyGames.Python.ORDER_NONE) || '0';
  const y = BlocklyGames.Python.valueToCode(block, 'Y', BlocklyGames.Python.ORDER_NONE) || '0';
  const width = BlocklyGames.Python.valueToCode(block, 'WIDTH', BlocklyGames.Python.ORDER_NONE) || '0';
  const height = BlocklyGames.Python.valueToCode(block, 'HEIGHT', BlocklyGames.Python.ORDER_NONE) || '0';
  return 'rect(' + x + ', ' + y + ', ' + width + ', ' + height + ')\n';
};

BlocklyGames.Python['movie_line'] = function(block) {
  const x1 = BlocklyGames.Python.valueToCode(block, 'X1', BlocklyGames.Python.ORDER_NONE) || '0';
  const y1 = BlocklyGames.Python.valueToCode(block, 'Y1', BlocklyGames.Python.ORDER_NONE) || '0';
  const x2 = BlocklyGames.Python.valueToCode(block, 'X2', BlocklyGames.Python.ORDER_NONE) || '0';
  const y2 = BlocklyGames.Python.valueToCode(block, 'Y2', BlocklyGames.Python.ORDER_NONE) || '0';
  const width = BlocklyGames.Python.valueToCode(block, 'WIDTH', BlocklyGames.Python.ORDER_NONE) || '0';
  return 'line(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ', ' + width +
      ')\n';
};

BlocklyGames.Python['movie_time'] = function(_block) {
  return ['time()', BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['movie_colour'] = function(block) {
  const colour = BlocklyGames.Python.valueToCode(block, 'COLOUR', BlocklyGames.Python.ORDER_NONE) ||
      '\'#000000\'';
  return 'penColour(' + colour + ')\n';
};


// ---------------------------------------------------------------------------
// Music.
// ---------------------------------------------------------------------------

BlocklyGames.Python['music_pitch'] = function(block) {
  return [String(Number(block.getFieldValue('PITCH'))), BlocklyGames.Python.ORDER_ATOMIC];
};

BlocklyGames.Python['music_note'] = function(block) {
  const duration = Number(block.getFieldValue('DURATION'));
  const pitch = BlocklyGames.Python.valueToCode(block, 'PITCH', BlocklyGames.Python.ORDER_NONE) || '7';
  return 'play(' + duration + ', ' + pitch + ')\n';
};

BlocklyGames.Python['music_rest_whole'] = function(_block) {
  return 'rest(1)\n';
};

BlocklyGames.Python['music_rest'] = function(block) {
  return 'rest(' + Number(block.getFieldValue('DURATION')) + ')\n';
};

BlocklyGames.Python['music_instrument'] = function(block) {
  const instrument = block.getFieldValue('INSTRUMENT');
  return 'setInstrument(' + BlocklyGames.Python.quote_(instrument) + ')\n';
};

BlocklyGames.Python['music_start'] = function(block) {
  BlocklyGames.Python.startCount_++;
  const statements = BlocklyGames.Python.orPass_(BlocklyGames.Python.statementToCode(block, 'STACK'));
  const code = 'def start' + BlocklyGames.Python.startCount_ + '():\n' + statements;
  BlocklyGames.Python.definitions_['%start' + BlocklyGames.Python.startCount_] = code;
  return null;
};


// ---------------------------------------------------------------------------
// Pond.
// ---------------------------------------------------------------------------

BlocklyGames.Python['pond_scan'] = function(block) {
  const degree = BlocklyGames.Python.valueToCode(block, 'DEGREE', BlocklyGames.Python.ORDER_NONE) || '0';
  return ['scan(' + degree + ')', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['pond_cannon'] = function(block) {
  const degree = BlocklyGames.Python.valueToCode(block, 'DEGREE', BlocklyGames.Python.ORDER_NONE) || '0';
  const range = BlocklyGames.Python.valueToCode(block, 'RANGE', BlocklyGames.Python.ORDER_NONE) || '0';
  return 'cannon(' + degree + ', ' + range + ')\n';
};

BlocklyGames.Python['pond_swim'] = function(block) {
  const degree = BlocklyGames.Python.valueToCode(block, 'DEGREE', BlocklyGames.Python.ORDER_NONE) || '0';
  return 'swim(' + degree + ')\n';
};

BlocklyGames.Python['pond_stop'] = function(_block) {
  return 'stop()\n';
};

BlocklyGames.Python['pond_health'] = function(_block) {
  return ['health()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['pond_speed'] = function(_block) {
  return ['speed()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['pond_getX'] = function(_block) {
  return ['getX()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['pond_getY'] = function(_block) {
  return ['getY()', BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

BlocklyGames.Python['pond_log'] = function(block) {
  const text = BlocklyGames.Python.valueToCode(block, 'VALUE', BlocklyGames.Python.ORDER_NONE) || '\'\'';
  return 'log(' + text + ')\n';
};

BlocklyGames.Python['pond_math_single'] = function(block) {
  const arg = BlocklyGames.Python.valueToCode(block, 'NUM', BlocklyGames.Python.ORDER_NONE) || '0';
  BlocklyGames.Python.needsMath_ = true;
  const FUNCTIONS = {
    'ROOT': 'math.sqrt(' + arg + ')',
    'ABS': 'abs(' + arg + ')',
    'SIN': 'math.sin(math.radians(' + arg + '))',
    'COS': 'math.cos(math.radians(' + arg + '))',
    'TAN': 'math.tan(math.radians(' + arg + '))',
    'ASIN': 'math.degrees(math.asin(' + arg + '))',
    'ACOS': 'math.degrees(math.acos(' + arg + '))',
    'ATAN': 'math.degrees(math.atan(' + arg + '))',
    'LN': 'math.log(' + arg + ')',
    'LOG10': 'math.log10(' + arg + ')',
    'EXP': 'math.exp(' + arg + ')',
    'POW10': '10 ** (' + arg + ')',
  };
  return [FUNCTIONS[block.getFieldValue('OP')], BlocklyGames.Python.ORDER_FUNCTION_CALL];
};

// Aliases for the pond-specific block names and for old saved programs.
BlocklyGames.Python['pond_math_number'] = BlocklyGames.Python['math_number'];
BlocklyGames.Python['pond_controls_if'] = BlocklyGames.Python['controls_if'];
BlocklyGames.Python['pond_loops_while'] =
    BlocklyGames.Python['controls_whileUntil'];
BlocklyGames.Python['pond_math_arithmetic'] =
    BlocklyGames.Python['math_arithmetic'];
BlocklyGames.Python['pond_math_change'] = BlocklyGames.Python['math_change'];
BlocklyGames.Python['pond_loc_x'] = BlocklyGames.Python['pond_getX'];
BlocklyGames.Python['pond_loc_y'] = BlocklyGames.Python['pond_getY'];
