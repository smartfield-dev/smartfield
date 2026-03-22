/**
 * @smartfield/server v0.1.0
 *
 * Server-side SDK for SmartField.
 * Generates encryption keys and decrypts data from <smart-field> components.
 *
 * Keys are generated and stored LOCALLY on YOUR server.
 * SmartField (the company) NEVER sees your keys or your users' data.
 *
 * Usage:
 *   const sf = require('@smartfield/server');
 *
 *   // First time: generate keys
 *   await sf.init();
 *
 *   // Serve public key to frontend
 *   app.get('/api/sf-key', (req, res) => res.json(sf.getPublicKey()));
 *
 *   // Decrypt form data
 *   app.post('/api/login', async (req, res) => {
 *     const email = await sf.decrypt(req.body.email);
 *     const password = await sf.decrypt(req.body.password);
 *   });
 */

'use strict';

const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;
const fs = require('fs');
const path = require('path');

// ========== STATE ==========

let _privateKey = null;
let _publicKey = null;
let _publicKeyJwk = null;
let _initialized = false;
let _keysDir = null;
let _archivedKeys = [];  // { privateKey, expiresAt }
let _rotationTimer = null;

// ========== INIT ==========

/**
 * Initialize SmartField SDK.
 * Generates RSA-2048 key pair and stores it locally.
 * If keys already exist, loads them from disk.
 *
 * @param {Object} options
 * @param {string} options.keysDir - Directory to store keys (default: .smartfield/)
 * @param {boolean} options.force - Force regenerate keys even if they exist
 * @returns {Promise<void>}
 */
async function init(options = {}) {
  _keysDir = options.keysDir || path.join(process.cwd(), '.smartfield');

  const privateKeyPath = path.join(_keysDir, 'private.json');
  const publicKeyPath = path.join(_keysDir, 'public.json');

  // Load existing keys if available
  if (!options.force && fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    try {
      const privJwk = JSON.parse(fs.readFileSync(privateKeyPath, 'utf8'));
      const pubJwk = JSON.parse(fs.readFileSync(publicKeyPath, 'utf8'));

      _privateKey = await subtle.importKey(
        'jwk', privJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true, ['decrypt']
      );

      _publicKey = await subtle.importKey(
        'jwk', pubJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true, ['encrypt']
      );

      _publicKeyJwk = pubJwk;
      _initialized = true;

      await _loadArchivedKeys();
      console.log('[SmartField] Keys loaded from', _keysDir);
      if (_archivedKeys.length > 0) console.log('[SmartField]', _archivedKeys.length, 'archived key(s) for decryption');
      return;
    } catch (e) {
      console.warn('[SmartField] Could not load existing keys, generating new ones:', e.message);
    }
  }

  // Generate new key pair
  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );

  _privateKey = keyPair.privateKey;
  _publicKey = keyPair.publicKey;
  _publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);

  // Save keys to disk
  if (!fs.existsSync(_keysDir)) {
    fs.mkdirSync(_keysDir, { recursive: true });
  }

  const privJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  fs.writeFileSync(privateKeyPath, JSON.stringify(privJwk, null, 2), { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, JSON.stringify(_publicKeyJwk, null, 2));

  // Add .smartfield to .gitignore if it exists
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.smartfield')) {
      fs.appendFileSync(gitignorePath, '\n# SmartField private keys - NEVER commit\n.smartfield/\n');
      console.log('[SmartField] Added .smartfield/ to .gitignore');
    }
  }

  _initialized = true;
  console.log('[SmartField] New keys generated and saved to', _keysDir);
  console.log('[SmartField] IMPORTANT: Never commit .smartfield/ to version control!');
}

// ========== PUBLIC KEY ==========

/**
 * Get the public key in JWK format.
 * Serve this to your frontend so SmartField can encrypt data for your server.
 *
 * Example:
 *   app.get('/api/sf-key', (req, res) => res.json(sf.getPublicKey()));
 *
 * @returns {Object} JWK public key
 */
function getPublicKey() {
  if (!_initialized) throw new Error('[SmartField] Not initialized. Call sf.init() first.');
  return _publicKeyJwk;
}

// ========== DECRYPT ==========

/**
 * Decrypt an encrypted payload from a SmartField component.
 *
 * @param {string} encryptedPayload - Base64 encoded encrypted data from smart-field .value
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decrypt(encryptedPayload) {
  if (!_initialized) throw new Error('[SmartField] Not initialized. Call sf.init() first.');

  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    return '';
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encryptedPayload, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error('[SmartField] Invalid payload format');
  }

  if (payload.v !== 1) throw new Error('Unsupported payload version: ' + payload.v);

  const iv = Buffer.from(payload.iv, 'base64');
  const encryptedKey = Buffer.from(payload.key, 'base64');
  const encryptedData = Buffer.from(payload.data, 'base64');

  // Try current key first, then archived keys
  const keysToTry = [_privateKey, ..._archivedKeys.map(k => k.privateKey)];

  for (const key of keysToTry) {
    try {
      const rawAesKey = await subtle.decrypt({ name: 'RSA-OAEP' }, key, new Uint8Array(encryptedKey));
      const aesKey = await subtle.importKey('raw', rawAesKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, new Uint8Array(encryptedData));
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      continue;
    }
  }

  throw new Error('[SmartField] Decryption failed: no matching key (' + keysToTry.length + ' tried)');
}

/**
 * Decrypt multiple fields from a form submission.
 *
 * @param {Object} fields - Object with field names as keys, encrypted payloads as values
 * @returns {Promise<Object>} Object with field names as keys, decrypted values
 *
 * Example:
 *   const data = await sf.decryptFields(req.body);
 *   // { email: "user@example.com", password: "Caracas8" }
 */
async function decryptFields(fields) {
  if (!_initialized) throw new Error('[SmartField] Not initialized. Call sf.init() first.');

  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.length > 50) {
      try {
        result[key] = await decrypt(value);
      } catch (e) {
        result[key] = value; // Not encrypted, pass through
      }
    } else {
      result[key] = value; // Not encrypted, pass through
    }
  }
  return result;
}

// ========== MIDDLEWARE ==========

/**
 * Express middleware that automatically serves the public key
 * and decrypts SmartField data in POST requests.
 *
 * Usage:
 *   app.use(sf.middleware());
 *
 * This adds:
 *   GET /sf-public-key → serves public key
 *   req.sf → decrypted fields (on POST requests with encrypted data)
 */
function middleware(options = {}) {
  const keyPath = options.keyPath || '/sf-public-key';

  return async function smartfieldMiddleware(req, res, next) {
    // Serve public key
    if (req.method === 'GET' && req.path === keyPath) {
      return res.json(getPublicKey());
    }

    // Decrypt POST body fields
    if (req.method === 'POST' && req.body) {
      try {
        req.sf = await decryptFields(req.body);
      } catch (e) {
        req.sf = req.body;
      }
    }

    next();
  };
}

// ========== KEY ROTATION ==========

/**
 * Rotate keys: generate new RSA key pair, archive the current one.
 * Old keys kept for decrypting data encrypted before rotation.
 *
 * @param {Object} options
 * @param {number} options.keepDays - Days to keep archived keys (default: 90)
 * @returns {Promise<Object>} { rotatedAt, archivedKeys }
 */
async function rotateKeys(options = {}) {
  if (!_initialized) throw new Error('[SmartField] Not initialized.');
  const keepDays = options.keepDays || 90;
  const archiveDir = path.join(_keysDir, 'archive');
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

  // Archive current key
  const currentPrivJwk = await subtle.exportKey('jwk', _privateKey);
  const record = {
    private: currentPrivJwk,
    public: _publicKeyJwk,
    archivedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + keepDays * 24 * 60 * 60 * 1000).toISOString()
  };
  fs.writeFileSync(path.join(archiveDir, 'key_' + Date.now() + '.json'), JSON.stringify(record, null, 2), { mode: 0o600 });

  // Keep in memory for decryption
  const archivedKey = await subtle.importKey('jwk', currentPrivJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  _archivedKeys.push({ privateKey: archivedKey, expiresAt: record.expiresAt });

  // Generate new keys
  const keyPair = await subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt']
  );
  _privateKey = keyPair.privateKey;
  _publicKey = keyPair.publicKey;
  _publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);

  // Save new keys + metadata
  const privJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  fs.writeFileSync(path.join(_keysDir, 'private.json'), JSON.stringify(privJwk, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(_keysDir, 'public.json'), JSON.stringify(_publicKeyJwk, null, 2));
  const metaPath = path.join(_keysDir, 'meta.json');
  const rotCount = fs.existsSync(metaPath) ? (JSON.parse(fs.readFileSync(metaPath, 'utf8')).rotationCount || 0) + 1 : 1;
  fs.writeFileSync(metaPath, JSON.stringify({ createdAt: new Date().toISOString(), rotationCount: rotCount }, null, 2));

  // Purge expired
  _purgeExpired(archiveDir);

  console.log('[SmartField] Keys rotated. Old key archived until', record.expiresAt);
  return { rotatedAt: new Date().toISOString(), archivedKeys: _archivedKeys.length };
}

/**
 * Enable automatic key rotation.
 * @param {Object} options
 * @param {string} options.every - Interval: '7d', '30d', '90d' (default: '30d')
 * @param {number} options.keepDays - Days to keep old keys (default: 90)
 */
function autoRotate(options = {}) {
  if (!_initialized) throw new Error('[SmartField] Not initialized.');
  const intervalDays = parseInt((options.every || '30d').match(/(\d+)/)[1], 10);
  const keepDays = options.keepDays || 90;

  // Check if rotation is due now
  const metaPath = path.join(_keysDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const daysSince = (Date.now() - new Date(meta.createdAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince >= intervalDays) rotateKeys({ keepDays });
  }

  // Check daily
  clearInterval(_rotationTimer);
  _rotationTimer = setInterval(function() {
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const days = (Date.now() - new Date(meta.createdAt).getTime()) / (24 * 60 * 60 * 1000);
      if (days >= intervalDays) rotateKeys({ keepDays });
    }
  }, 24 * 60 * 60 * 1000);
}

async function _loadArchivedKeys() {
  const archiveDir = path.join(_keysDir, 'archive');
  if (!fs.existsSync(archiveDir)) return;
  const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(archiveDir, file), 'utf8'));
      if (new Date(record.expiresAt) < new Date()) continue;
      const pk = await subtle.importKey('jwk', record.private, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
      _archivedKeys.push({ privateKey: pk, expiresAt: record.expiresAt });
    } catch (e) {}
  }
}

function _purgeExpired(archiveDir) {
  if (!fs.existsSync(archiveDir)) return;
  const now = new Date();
  for (const file of fs.readdirSync(archiveDir).filter(f => f.endsWith('.json'))) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(archiveDir, file), 'utf8'));
      if (new Date(r.expiresAt) < now) {
        fs.unlinkSync(path.join(archiveDir, file));
        console.log('[SmartField] Purged expired key:', file);
      }
    } catch (e) {}
  }
  _archivedKeys = _archivedKeys.filter(k => new Date(k.expiresAt) > now);
}

// ========== STATUS ==========

/**
 * Check if SmartField SDK is initialized and keys are ready.
 * @returns {Object} Status info
 */
function status() {
  return {
    initialized: _initialized,
    keysDir: _keysDir,
    hasPrivateKey: !!_privateKey,
    hasPublicKey: !!_publicKey,
    archivedKeys: _archivedKeys.length,
    version: '2.6.0'
  };
}

// ========== EXPORTS ==========

module.exports = {
  init,
  getPublicKey,
  decrypt,
  decryptFields,
  middleware,
  rotateKeys,
  autoRotate,
  status
};
