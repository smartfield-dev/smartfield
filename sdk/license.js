/**
 * @smartfield/server — License Management
 *
 * Handles API key generation, validation, revocation, and HMAC signing.
 * Keys are stored HASHED (SHA-256) — never in plaintext.
 *
 * Security layers:
 *   1. Key hashing (SHA-256) — DB compromise doesn't leak keys
 *   2. HMAC-signed responses — client can verify authenticity
 *   3. Origin header validation — key tied to domain
 *   4. Rate limiting — prevents brute force / enumeration
 *   5. Graceful fallback — API down = free plan, not broken site
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========

const HMAC_SECRET_FILE = 'hmac_secret.json';
const KEYS_FILE = 'keys.json';
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60;           // 60 requests per minute per IP

// ========== STATE ==========

let _licensesDir = null;
let _hmacSecret = null;
let _keys = {};         // hash -> key record
let _rateLimits = {};   // ip -> { count, resetAt }
let _initialized = false;

// ========== HELPERS ==========

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey(prefix) {
  return prefix + crypto.randomBytes(16).toString('hex');
}

function hmacSign(payload) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', _hmacSecret).update(data).digest('hex');
}

function hmacVerify(payload, signature) {
  const expected = hmacSign(payload);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

// ========== INIT ==========

/**
 * Initialize the license system.
 * Creates storage directory and HMAC secret if they don't exist.
 *
 * @param {Object} options
 * @param {string} options.licensesDir - Directory for license data (default: .licenses/)
 */
function init(options = {}) {
  _licensesDir = options.licensesDir || path.join(process.cwd(), '.licenses');

  // Create directory
  if (!fs.existsSync(_licensesDir)) {
    fs.mkdirSync(_licensesDir, { recursive: true });
  }

  // Load or generate HMAC secret
  const secretPath = path.join(_licensesDir, HMAC_SECRET_FILE);
  if (fs.existsSync(secretPath)) {
    _hmacSecret = JSON.parse(fs.readFileSync(secretPath, 'utf8')).secret;
  } else {
    _hmacSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, JSON.stringify({ secret: _hmacSecret }, null, 2), { mode: 0o600 });
  }

  // Load existing keys
  const keysPath = path.join(_licensesDir, KEYS_FILE);
  if (fs.existsSync(keysPath)) {
    _keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  } else {
    _keys = {};
    _saveKeys();
  }

  // Gitignore
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.licenses')) {
      fs.appendFileSync(gitignorePath, '\n# SmartField license data - NEVER commit\n.licenses/\n');
    }
  }

  _initialized = true;
}

function _saveKeys() {
  const keysPath = path.join(_licensesDir, KEYS_FILE);
  fs.writeFileSync(keysPath, JSON.stringify(_keys, null, 2), { mode: 0o600 });
}

// ========== KEY GENERATION ==========

/**
 * Generate a new license key.
 *
 * @param {Object} options
 * @param {string} options.domain - Domain this key is bound to (e.g. "banco.com")
 * @param {string} options.plan - "free", "pro", or "enterprise"
 * @param {string} options.owner - Owner name/email (for reference)
 * @param {boolean} options.test - If true, generates sf_test_ key (accepts any domain)
 * @returns {Object} { key, plan, domain, createdAt }
 */
function generateKey(options = {}) {
  if (!_initialized) throw new Error('[License] Not initialized. Call license.init() first.');

  const plan = options.plan || 'free';
  const domain = options.domain || '*';
  const owner = options.owner || '';
  const isTest = options.test || false;

  const prefix = isTest ? 'sf_test_' : 'sf_live_';
  const rawKey = generateRawKey(prefix);
  const hashed = hashKey(rawKey);

  // paidUntil: null = free forever, date = subscription end
  // gracePeriodDays: days after paidUntil before downgrade (default 7)
  const paidUntil = options.paidUntil || null;
  const gracePeriodDays = options.gracePeriodDays || 7;

  const record = {
    hash: hashed,
    plan: plan,
    domain: domain,
    owner: owner,
    test: isTest,
    active: true,
    maxFields: plan === 'free' ? 3 : -1,
    badge: plan === 'free',
    paidUntil: paidUntil,
    gracePeriodDays: gracePeriodDays,
    createdAt: new Date().toISOString(),
    revokedAt: null
  };

  _keys[hashed] = record;
  _saveKeys();

  // Return the raw key ONLY at creation time — never stored in plaintext
  return {
    key: rawKey,
    plan: record.plan,
    domain: record.domain,
    maxFields: record.maxFields,
    createdAt: record.createdAt
  };
}

// ========== VALIDATION ==========

/**
 * Validate a license key.
 * Checks: key exists, is active, domain matches, not rate limited.
 * Returns a signed response.
 *
 * @param {Object} params
 * @param {string} params.key - The raw API key (sf_live_xxx or sf_test_xxx)
 * @param {string} params.domain - Domain making the request (from query param)
 * @param {string} params.origin - Origin header from the HTTP request
 * @param {string} params.ip - Client IP address (for rate limiting)
 * @returns {Object} Signed validation response
 */
function validateKey(params = {}) {
  if (!_initialized) throw new Error('[License] Not initialized. Call license.init() first.');

  const { key, domain, origin, ip } = params;

  // Rate limiting
  if (ip && !_checkRateLimit(ip)) {
    return {
      valid: false,
      error: 'rate_limited',
      message: 'Too many requests. Try again later.'
    };
  }

  // No key = free plan
  if (!key) {
    return _signResponse({
      valid: true,
      plan: 'free',
      maxFields: 3,
      badge: true,
      domain: '*'
    });
  }

  // Hash and look up
  const hashed = hashKey(key);
  const record = _keys[hashed];

  if (!record) {
    return {
      valid: false,
      error: 'invalid_key',
      message: 'API key not found.'
    };
  }

  if (!record.active) {
    return {
      valid: false,
      error: 'revoked',
      message: 'This API key has been revoked.'
    };
  }

  // Domain validation
  // Test keys accept any domain
  if (!record.test && record.domain !== '*') {
    const requestDomain = _extractDomain(origin || domain || '');

    if (requestDomain && record.domain !== requestDomain) {
      // Domain mismatch — fall back to free
      return _signResponse({
        valid: true,
        plan: 'free',
        maxFields: 3,
        badge: true,
        domain: '*',
        warning: 'domain_mismatch'
      });
    }
  }

  // Check payment status + grace period
  if (record.paidUntil && record.plan !== 'free') {
    const paidUntilDate = new Date(record.paidUntil);
    const now = new Date();
    const graceEnd = new Date(paidUntilDate.getTime() + record.gracePeriodDays * 24 * 60 * 60 * 1000);

    if (now > graceEnd) {
      // Grace period expired → downgrade to free
      return _signResponse({
        valid: true,
        plan: 'free',
        maxFields: 3,
        badge: true,
        domain: record.domain,
        warning: 'subscription_expired',
        expiredAt: record.paidUntil,
        graceEndedAt: graceEnd.toISOString()
      });
    }

    if (now > paidUntilDate) {
      // In grace period → still works but warn
      const daysLeft = Math.ceil((graceEnd - now) / (24 * 60 * 60 * 1000));
      return _signResponse({
        valid: true,
        plan: record.plan,
        maxFields: record.maxFields,
        badge: record.badge,
        domain: record.domain,
        warning: 'grace_period',
        graceDaysLeft: daysLeft
      });
    }
  }

  // Valid key, active subscription
  return _signResponse({
    valid: true,
    plan: record.plan,
    maxFields: record.maxFields,
    badge: record.badge,
    domain: record.domain
  });
}

function _signResponse(data) {
  const payload = {
    ...data,
    ts: Date.now(),
    exp: Date.now() + (24 * 60 * 60 * 1000) // 24h expiry
  };
  const sig = hmacSign(JSON.stringify(payload));
  return { ...payload, sig };
}

function _extractDomain(urlOrDomain) {
  if (!urlOrDomain) return null;
  try {
    // If it's a full URL, extract hostname
    if (urlOrDomain.includes('://')) {
      return new URL(urlOrDomain).hostname.replace(/^www\./, '');
    }
    // Already a domain
    return urlOrDomain.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

function _checkRateLimit(ip) {
  const now = Date.now();

  if (!_rateLimits[ip] || now > _rateLimits[ip].resetAt) {
    _rateLimits[ip] = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    return true;
  }

  _rateLimits[ip].count++;
  return _rateLimits[ip].count <= RATE_LIMIT_MAX;
}

// ========== SUBSCRIPTION MANAGEMENT ==========

/**
 * Extend a subscription. Called when customer pays.
 *
 * @param {string} rawKey - The API key
 * @param {string} paidUntil - ISO date string (e.g. '2026-04-22T00:00:00Z')
 * @returns {boolean} true if updated
 */
function extendSubscription(rawKey, paidUntil) {
  if (!_initialized) throw new Error('[License] Not initialized.');
  const hashed = hashKey(rawKey);
  const record = _keys[hashed];
  if (!record) return false;

  record.paidUntil = paidUntil;
  _saveKeys();
  return true;
}

/**
 * Get subscription status for a key.
 *
 * @param {string} rawKey
 * @returns {Object} { plan, paidUntil, status, graceDaysLeft }
 */
function getSubscriptionStatus(rawKey) {
  if (!_initialized) throw new Error('[License] Not initialized.');
  const hashed = hashKey(rawKey);
  const record = _keys[hashed];
  if (!record) return null;

  if (!record.paidUntil || record.plan === 'free') {
    return { plan: record.plan, status: 'free', paidUntil: null };
  }

  const now = new Date();
  const paidUntil = new Date(record.paidUntil);
  const graceEnd = new Date(paidUntil.getTime() + record.gracePeriodDays * 24 * 60 * 60 * 1000);

  if (now <= paidUntil) {
    return { plan: record.plan, status: 'active', paidUntil: record.paidUntil };
  } else if (now <= graceEnd) {
    const daysLeft = Math.ceil((graceEnd - now) / (24 * 60 * 60 * 1000));
    return { plan: record.plan, status: 'grace_period', paidUntil: record.paidUntil, graceDaysLeft: daysLeft };
  } else {
    return { plan: record.plan, status: 'expired', paidUntil: record.paidUntil, expiredDaysAgo: Math.floor((now - graceEnd) / (24 * 60 * 60 * 1000)) };
  }
}

// ========== REVOCATION ==========

/**
 * Revoke a license key (deactivate it immediately).
 *
 * @param {string} rawKey - The raw API key to revoke
 * @returns {boolean} true if revoked, false if not found
 */
function revokeKey(rawKey) {
  if (!_initialized) throw new Error('[License] Not initialized. Call license.init() first.');

  const hashed = hashKey(rawKey);
  const record = _keys[hashed];

  if (!record) return false;

  record.active = false;
  record.revokedAt = new Date().toISOString();
  _saveKeys();
  return true;
}

// ========== LIST ==========

/**
 * List all registered keys (hashed, never raw).
 * @returns {Array} Key records (without the raw key)
 */
function listKeys() {
  if (!_initialized) throw new Error('[License] Not initialized. Call license.init() first.');
  return Object.values(_keys);
}

// ========== HMAC VERIFICATION (for client use) ==========

/**
 * Get the HMAC secret (for internal use only — e.g. embedding verification key).
 * In production, this would be a public key for asymmetric verification.
 */
function getHmacVerifier() {
  if (!_initialized) throw new Error('[License] Not initialized. Call license.init() first.');
  // Return a derived verification token (NOT the raw secret)
  return crypto.createHash('sha256').update('sf_verify_' + _hmacSecret).digest('hex');
}

/**
 * Verify an HMAC signature on a validation response.
 * Used by the middleware to verify cached responses.
 */
function verifySignature(payload, signature) {
  if (!_initialized) return false;
  try {
    return hmacVerify(JSON.stringify(payload), signature);
  } catch (e) {
    return false;
  }
}

// ========== EXPORTS ==========

module.exports = {
  init,
  generateKey,
  validateKey,
  extendSubscription,
  getSubscriptionStatus,
  revokeKey,
  listKeys,
  getHmacVerifier,
  verifySignature
};
