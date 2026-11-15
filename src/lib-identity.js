/**
 * @license
 * Copyright 2026 The Blockly Games Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Student identity and signed progress files.
 *
 * The student enters a full name and a group once.  The UI locks them and
 * every exported progress file carries an ECDSA P-256 signature over that
 * identity and the saved levels.  Editing the name in the JSON therefore
 * breaks the signature and the importer rejects the file.
 *
 * The private key is stored in IndexedDB as a non-extractable CryptoKey.  It
 * is still available to scripts running on this origin, so this is a
 * deterrent against file copying and hand-editing, not a server-verified
 * identity.  A teacher-issued roster is the next step if grades depend on it.
 */
'use strict';

goog.provide('BlocklyGames.identity');

goog.require('BlocklyGames');


/**
 * localStorage key that holds the locked student record.
 * @private
 */
BlocklyGames.identity.STUDENT_KEY_ = 'blocklyGamesStudent';

/**
 * localStorage key that holds the import history.
 * @private
 */
BlocklyGames.identity.IMPORT_LOG_KEY_ = 'blocklyGamesStudentLog';

/**
 * Maximum number of import records kept in localStorage.
 * @private
 */
BlocklyGames.identity.MAX_IMPORT_LOG_ = 20;

/**
 * IndexedDB database, object store and key used for the private key.
 * @private
 */
BlocklyGames.identity.KEY_DB_ = 'blocklyGamesIdentity';
BlocklyGames.identity.KEY_STORE_ = 'keys';
BlocklyGames.identity.KEY_ID_ = 'studentKey';

/**
 * Identifier stored with the signature.
 * @private
 */
BlocklyGames.identity.SIGNATURE_ALG_ = 'ECDSA-P256-SHA256';

/**
 * Cached key-pair promise, shared by all exports during this page load.
 * @type {?Promise<!Object>}
 * @private
 */
BlocklyGames.identity.keyPair_ = null;


/**
 * Collapse runs of whitespace and trim.  Student names arrive from a text
 * input, so they can contain stray spaces and line breaks.
 * @param {*} text Value to normalise.
 * @returns {string} Normalised text.
 * @private
 */
function normalizeText_(text) {
  return String(text === null || text === undefined ? '' : text)
      .replace(/\s+/g, ' ').trim();
}


/**
 * Comparison form for names and groups: normalised and case-insensitive.
 * @param {*} text Value to normalise.
 * @returns {string} Comparison key.
 * @private
 */
function comparisonKey_(text) {
  return normalizeText_(text).toLowerCase();
}


/**
 * Create a random identifier.  crypto.randomUUID needs a secure context;
 * the getRandomValues path keeps the feature working when it is missing.
 * @returns {string} Random identifier.
 * @private
 */
function randomId_() {
  const crypto = window['crypto'];
  if (crypto && typeof crypto['randomUUID'] === 'function') {
    try {
      return crypto['randomUUID']();
    } catch (e) {
      // Older Safari exposes randomUUID but throws outside a secure context.
    }
  }
  const bytes = new Uint8Array(16);
  if (crypto && typeof crypto['getRandomValues'] === 'function') {
    crypto['getRandomValues'](bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] + 0x100).toString(16).slice(1);
  }
  return hex;
}


/**
 * Convert bytes to base64 without spreading a large array into String.
 * @param {!Uint8Array} bytes Bytes.
 * @returns {string} Base64 text.
 * @private
 */
function bytesToBase64_(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


/**
 * Convert base64 text to bytes.
 * @param {string} text Base64 text.
 * @returns {!Uint8Array} Bytes.
 * @private
 */
function base64ToBytes_(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


/**
 * Deterministic JSON with sorted object keys.  The signature must survive a
 * JSON round trip, and JSON.stringify depends on property insertion order.
 * @param {*} value JSON-compatible value.
 * @returns {string} Canonical JSON text.
 * @private
 */
function canonicalJson_(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) {
      parts.push(canonicalJson_(value[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      parts.push(JSON.stringify(key) + ':' + canonicalJson_(value[key]));
    }
    return '{' + parts.join(',') + '}';
  }
  // Functions, symbols and other non-JSON values never appear in a progress
  // file.  Treating them as null keeps the encoder total.
  return 'null';
}


/**
 * Open the tiny IndexedDB database that stores the key pair.
 * @returns {!Promise<!IDBDatabase>} Database.
 * @private
 */
function openKeyDb_() {
  return new Promise(function(resolve, reject) {
    const factory = window['indexedDB'];
    if (!factory) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = factory.open(BlocklyGames.identity.KEY_DB_, 1);
    request['onupgradeneeded'] = function() {
      const db = request['result'];
      if (!db.objectStoreNames.contains(BlocklyGames.identity.KEY_STORE_)) {
        db.createObjectStore(BlocklyGames.identity.KEY_STORE_);
      }
    };
    request['onsuccess'] = function() {
      resolve(request['result']);
    };
    request['onerror'] = function() {
      reject(request['error'] || new Error('IndexedDB open failed'));
    };
  });
}


/**
 * Read the stored key pair, if any.  Storage failures are non-fatal: the
 * caller generates a fresh key for this session instead.
 * @returns {!Promise<?Object>} Key pair or null.
 * @private
 */
function loadKeyPair_() {
  return openKeyDb_().then(function(db) {
    return new Promise(function(resolve, reject) {
      const transaction = db.transaction(
          BlocklyGames.identity.KEY_STORE_, 'readonly');
      const request = transaction.objectStore(
          BlocklyGames.identity.KEY_STORE_).get(
          BlocklyGames.identity.KEY_ID_);
      request['onsuccess'] = function() {
        resolve(request['result'] || null);
      };
      request['onerror'] = function() {
        reject(request['error'] || new Error('IndexedDB read failed'));
      };
      transaction['oncomplete'] = function() {
        db.close();
      };
      transaction['onabort'] = function() {
        db.close();
      };
    });
  }).catch(function() {
    return null;
  });
}


/**
 * Save the key pair for future page loads.  Failure only means the key is
 * regenerated next time, so it is deliberately ignored.
 * @param {!Object} pair Key pair.
 * @private
 */
function storeKeyPair_(pair) {
  openKeyDb_().then(function(db) {
    const transaction = db.transaction(
        BlocklyGames.identity.KEY_STORE_, 'readwrite');
    transaction.objectStore(BlocklyGames.identity.KEY_STORE_).put(
        pair, BlocklyGames.identity.KEY_ID_);
    transaction['oncomplete'] = function() {
      db.close();
    };
    transaction['onabort'] = function() {
      db.close();
    };
  }).catch(function() {
    // Private browsing and blocked storage are common; the in-memory key
    // still signs this session's exports.
  });
}


/**
 * Get (or create) the non-extractable ECDSA key pair.
 * @returns {!Promise<!Object>} Key pair with privateKey and publicKey.
 * @private
 */
function getKeyPair_() {
  if (BlocklyGames.identity.keyPair_) {
    return BlocklyGames.identity.keyPair_;
  }
  const crypto = window['crypto'];
  const subtle = crypto && crypto['subtle'];
  if (!subtle) {
    return Promise.reject(new Error('WebCrypto is unavailable'));
  }
  BlocklyGames.identity.keyPair_ = loadKeyPair_().then(function(pair) {
    if (pair && pair['privateKey'] && pair['publicKey']) {
      return pair;
    }
    return subtle['generateKey'](
        {'name': 'ECDSA', 'namedCurve': 'P-256'}, false,
        ['sign', 'verify']).then(function(generated) {
      const fresh = {};
      fresh['privateKey'] = generated['privateKey'];
      fresh['publicKey'] = generated['publicKey'];
      storeKeyPair_(fresh);
      return fresh;
    });
  }).catch(function(error) {
    BlocklyGames.identity.keyPair_ = null;
    throw error;
  });
  return BlocklyGames.identity.keyPair_;
}


/**
 * Read the locked student record.
 * @returns {?Object} Record with name, group, id and created, or null.
 */
BlocklyGames.identity.get = function() {
  try {
    const raw = window.localStorage[BlocklyGames.identity.STUDENT_KEY_];
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    if (!data || typeof data['name'] !== 'string' ||
        typeof data['group'] !== 'string' ||
        !normalizeText_(data['name']) || !normalizeText_(data['group'])) {
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
};


/**
 * Store the student record.  Once a record exists it is never replaced, so
 * the UI and the exported files keep the same identity.
 * @param {string} name Full name.
 * @param {string} group Group.
 * @returns {?Object} Stored record, or null when input is empty/storage failed.
 */
BlocklyGames.identity.save = function(name, group) {
  const cleanName = normalizeText_(name);
  const cleanGroup = normalizeText_(group);
  if (!cleanName || !cleanGroup) {
    return null;
  }
  const existing = BlocklyGames.identity.get();
  if (existing) {
    return existing;
  }
  const data = {};
  data['version'] = 1;
  data['name'] = cleanName;
  data['group'] = cleanGroup;
  data['id'] = randomId_();
  data['created'] = new Date().toISOString();
  data['locked'] = true;
  try {
    window.localStorage[BlocklyGames.identity.STUDENT_KEY_] =
        JSON.stringify(data);
  } catch (e) {
    return null;
  }
  // Warm the key now instead of on the first export.  A missing WebCrypto
  // surfaces as a status message when the student actually exports.
  BlocklyGames.identity.prepare().catch(function() {});
  return data;
};


/**
 * Generate the signing key ahead of the first export.
 * @returns {!Promise<!Object>} Key pair.
 */
BlocklyGames.identity.prepare = function() {
  return getKeyPair_();
};


/**
 * Whether this browser can create and verify signatures.
 * @returns {boolean} True when WebCrypto and TextEncoder are present.
 */
BlocklyGames.identity.available = function() {
  const crypto = window['crypto'];
  return !!(crypto && crypto['subtle'] && window['TextEncoder']);
};


/**
 * Compare two identity records by name and group.  The random id is tied to
 * the device, so it must not make a legitimate re-install look like a
 * different student.
 * @param {?Object} first First record.
 * @param {?Object} second Second record.
 * @returns {boolean} True when both describe the same student.
 */
BlocklyGames.identity.matches = function(first, second) {
  return !!first && !!second &&
      comparisonKey_(first['name']) === comparisonKey_(second['name']) &&
      comparisonKey_(first['group']) === comparisonKey_(second['group']);
};


/**
 * Build the canonical payload that is signed and exported.
 * @param {!Object} data Parsed file, or a freshly built object.
 * @returns {!Object} Payload without the signature.
 */
BlocklyGames.identity.payload = function(data) {
  const payload = {};
  payload['format'] = data['format'];
  payload['version'] = data['version'];
  payload['exported'] = data['exported'];
  payload['student'] = data['student'];
  payload['apps'] = data['apps'];
  payload['imports'] = Array.isArray(data['imports']) ? data['imports'] : [];
  return payload;
};


/**
 * Sign a progress payload.
 * @param {!Object} payload Object returned by payload().
 * @returns {!Promise<!Object>} Signature object with alg, value, publicKey.
 */
BlocklyGames.identity.sign = function(payload) {
  const crypto = window['crypto'];
  const subtle = crypto && crypto['subtle'];
  if (!subtle || !window['TextEncoder']) {
    return Promise.reject(new Error('WebCrypto is unavailable'));
  }
  return getKeyPair_().then(function(pair) {
    const bytes = new window['TextEncoder']().encode(
        canonicalJson_(payload));
    return Promise.all([
      subtle['sign']({'name': 'ECDSA', 'hash': 'SHA-256'},
          pair['privateKey'], bytes),
      subtle['exportKey']('jwk', pair['publicKey']),
    ]);
  }).then(function(results) {
    const signature = {};
    signature['alg'] = BlocklyGames.identity.SIGNATURE_ALG_;
    signature['value'] = bytesToBase64_(new Uint8Array(results[0]));
    signature['publicKey'] = results[1];
    return signature;
  });
};


/**
 * Verify a signature object against a payload.
 * @param {!Object} payload Object returned by payload().
 * @param {*} signature Signature object from the file.
 * @returns {!Promise<boolean>} True when the signature is valid.
 */
BlocklyGames.identity.verify = function(payload, signature) {
  const crypto = window['crypto'];
  const subtle = crypto && crypto['subtle'];
  if (!subtle || !window['TextEncoder'] || !signature ||
      typeof signature !== 'object') {
    return Promise.resolve(false);
  }
  if (signature['alg'] !== BlocklyGames.identity.SIGNATURE_ALG_ ||
      typeof signature['value'] !== 'string') {
    return Promise.resolve(false);
  }
  const publicKey = signature['publicKey'];
  if (!publicKey || typeof publicKey !== 'object' ||
      publicKey['kty'] !== 'EC' || publicKey['crv'] !== 'P-256') {
    return Promise.resolve(false);
  }
  return subtle['importKey']('jwk', publicKey,
      {'name': 'ECDSA', 'namedCurve': 'P-256'}, false, ['verify']
  ).then(function(key) {
    const bytes = new window['TextEncoder']().encode(
        canonicalJson_(payload));
    return subtle['verify']({'name': 'ECDSA', 'hash': 'SHA-256'}, key,
        base64ToBytes_(signature['value']), bytes);
  }).catch(function() {
    return false;
  });
};


/**
 * Read the import history.  Newest entry first.
 * @returns {!Array<!Object>} Import records.
 */
BlocklyGames.identity.importLog = function() {
  try {
    const raw = window.localStorage[BlocklyGames.identity.IMPORT_LOG_KEY_];
    if (!raw) {
      return [];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
};


/**
 * Keep only well-formed import records before storing or exporting them.
 * @param {*} records Candidate records.
 * @returns {!Array<!Object>} Clean records.
 * @private
 */
function cleanImportLog_(records) {
  const clean = [];
  if (!Array.isArray(records)) {
    return clean;
  }
  for (let i = 0; i < records.length && clean.length <
      BlocklyGames.identity.MAX_IMPORT_LOG_; i++) {
    const entry = records[i];
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (typeof entry['name'] !== 'string' ||
        typeof entry['group'] !== 'string') {
      continue;
    }
    const record = {};
    record['name'] = normalizeText_(entry['name']);
    record['group'] = normalizeText_(entry['group']);
    record['id'] = typeof entry['id'] === 'string' ? entry['id'] : '';
    record['exported'] = typeof entry['exported'] === 'string' ?
        entry['exported'] : '';
    record['imported'] = typeof entry['imported'] === 'string' ?
        entry['imported'] : '';
    record['levels'] = typeof entry['levels'] === 'number' ?
        entry['levels'] : 0;
    if (record['name'] && record['group']) {
      clean.push(record);
    }
  }
  return clean;
}


/**
 * Record an import and merge the source file's own history, so a save that
 * travels through several students keeps its lineage.
 * @param {!Object} record Record for the file just imported.
 * @param {*} previous Imports array from that file.
 * @returns {!Array<!Object>} Updated log.
 */
BlocklyGames.identity.addImport = function(record, previous) {
  const merged = [];
  const seen = {};
  const add = function(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const key = comparisonKey_(entry['name']) + '\u0000' +
        comparisonKey_(entry['group']) + '\u0000' +
        String(entry['exported'] || '');
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    merged.push(entry);
  };
  add(record);
  const oldLog = BlocklyGames.identity.importLog();
  for (let i = 0; i < oldLog.length; i++) {
    add(oldLog[i]);
  }
  if (Array.isArray(previous)) {
    for (let i = 0; i < previous.length; i++) {
      add(previous[i]);
    }
  }
  const clean = cleanImportLog_(merged);
  try {
    window.localStorage[BlocklyGames.identity.IMPORT_LOG_KEY_] =
        JSON.stringify(clean);
  } catch (e) {
    // Storage may be unavailable; the import itself still succeeds.
  }
  return clean;
};
