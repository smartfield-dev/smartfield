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
        false, ['decrypt']
      );

      _publicKey = await subtle.importKey(
        'jwk', pubJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true, ['encrypt']
      );

      _publicKeyJwk = pubJwk;
      _initialized = true;

      console.log('[SmartField] Keys loaded from', _keysDir);
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

  try {
    // Decode the payload
    const payload = JSON.parse(Buffer.from(encryptedPayload, 'base64').toString('utf8'));

    if (payload.v !== 1) {
      throw new Error('Unsupported payload version: ' + payload.v);
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const encryptedKey = Buffer.from(payload.key, 'base64');
    const encryptedData = Buffer.from(payload.data, 'base64');

    // Step 1: Decrypt the AES key using RSA private key
    const rawAesKey = await subtle.decrypt(
      { name: 'RSA-OAEP' },
      _privateKey,
      new Uint8Array(encryptedKey)
    );

    // Step 2: Import the AES key
    const aesKey = await subtle.importKey(
      'raw',
      rawAesKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Step 3: Decrypt the data using AES
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      aesKey,
      new Uint8Array(encryptedData)
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    throw new Error('[SmartField] Decryption failed: ' + e.message);
  }
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
  status
};
