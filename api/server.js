/**
 * SmartField API Server
 * Generates keys, receives encrypted data, decrypts it
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the demo/landing page
app.use('/demo', express.static(path.join(__dirname, '..', 'demo')));
app.use('/component', express.static(path.join(__dirname, '..', 'component')));
app.use('/landing', express.static(path.join(__dirname, '..', 'landing')));

// ========== KEY MANAGEMENT ==========

let serverKeys = null;

async function initKeys() {
  const { subtle } = globalThis.crypto;
  serverKeys = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );
  const pubJwk = await subtle.exportKey('jwk', serverKeys.publicKey);
  console.log('[SmartField API] Keys generated');
  console.log('[SmartField API] Public key (first 50 chars):', JSON.stringify(pubJwk).substring(0, 50) + '...');
  return pubJwk;
}

// ========== DECRYPT ENGINE ==========

async function decryptPayload(encryptedBase64) {
  const { subtle } = globalThis.crypto;
  const payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString());

  // Decode components
  const iv = Buffer.from(payload.iv, 'base64');
  const encryptedKey = Buffer.from(payload.key, 'base64');
  const encryptedData = Buffer.from(payload.data, 'base64');

  // Decrypt AES key with RSA
  const rawAesKey = await subtle.decrypt(
    { name: 'RSA-OAEP' },
    serverKeys.privateKey,
    encryptedKey
  );

  // Import AES key
  const aesKey = await subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decrypt data with AES
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    new Uint8Array(encryptedData)
  );

  return new TextDecoder().decode(decrypted);
}

// ========== ROUTES ==========

// Get server's public key (SmartField fetches this)
app.get('/api/public-key', async (req, res) => {
  if (!serverKeys) await initKeys();
  const pubJwk = await globalThis.crypto.subtle.exportKey('jwk', serverKeys.publicKey);
  res.json(pubJwk);
});

// Receive encrypted form data and decrypt it (simulates login)
app.post('/api/login', async (req, res) => {
  const { fields } = req.body;

  if (!fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'No fields provided' });
  }

  console.log('\n[SmartField API] ═══════════════════════════════════');
  console.log('[SmartField API] Received encrypted login');
  console.log('[SmartField API] Fields:', fields.length);

  const decrypted = {};
  for (const field of fields) {
    try {
      const value = await decryptPayload(field.encrypted);
      decrypted[field.id] = value;
      console.log(`[SmartField API]   ${field.id}: "${value}"`);
    } catch (e) {
      console.log(`[SmartField API]   ${field.id}: DECRYPT FAILED - ${e.message}`);
      decrypted[field.id] = '[decrypt failed - wrong key?]';
    }
  }

  console.log('[SmartField API] ═══════════════════════════════════\n');

  res.json({
    success: true,
    message: 'Server decrypted your data successfully',
    decrypted,
    note: 'In production, password would be hashed and stored - never shown back'
  });
});

// Receive normal (unencrypted) form data (to show the vulnerability)
app.post('/api/login-normal', (req, res) => {
  const { email, password } = req.body;

  console.log('\n[SmartField API] ⚠⚠⚠ NORMAL LOGIN (INSECURE) ⚠⚠⚠');
  console.log(`[SmartField API]   email: "${email}"`);
  console.log(`[SmartField API]   password: "${password}"  ← IN PLAIN TEXT!`);
  console.log('[SmartField API] Any middleware, proxy, or log can read this!\n');

  res.json({
    success: true,
    message: 'Server received your data IN PLAIN TEXT',
    received: { email, password: password },
    warning: 'This password was visible to every middleware, proxy, and log between your browser and the server'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', keysReady: !!serverKeys });
});

// ========== START ==========

const PORT = process.env.PORT || 3333;

initKeys().then(() => {
  app.listen(PORT, () => {
    console.log(`\n[SmartField API] Server running at http://localhost:${PORT}`);
    console.log(`[SmartField API] Landing page: http://localhost:${PORT}/landing`);
    console.log(`[SmartField API] Demo: http://localhost:${PORT}/demo`);
    console.log(`[SmartField API] Public key: http://localhost:${PORT}/api/public-key\n`);
  });
});
