/**
 * Demo server using @smartfield/server SDK
 * This is what a REAL client's server would look like
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const sf = require('../sdk');           // In production: require('@smartfield/server')
const license = require('../sdk/license');  // License validation

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// SmartField middleware: auto-serves public key + auto-decrypts
app.use(sf.middleware({ keyPath: '/api/public-key' }));

// Serve static files
app.use('/component', express.static(path.join(__dirname, '..', 'component')));
app.use('/landing', express.static(path.join(__dirname, '..', 'landing')));
app.use('/usecases', express.static(path.join(__dirname, '..', 'landing')));
app.use('/demo', express.static(path.join(__dirname, '..', 'demo')));

// ========== LICENSE VALIDATION ==========

app.get('/api/validate', (req, res) => {
  const key = req.query.key || '';
  const domain = req.query.domain || '';
  const origin = req.get('Origin') || req.get('Referer') || '';
  const ip = req.ip || req.connection.remoteAddress || '';

  const result = license.validateKey({ key, domain, origin, ip });
  res.json(result);
});

// ========== DEMO: Generate a test key ==========

app.post('/api/generate-key', (req, res) => {
  const { domain, plan, owner, test } = req.body;
  try {
    const result = license.generateKey({ domain, plan, owner, test });
    console.log(`[License] Key generated: ${result.key.substring(0, 16)}... for ${domain} (${plan})`);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== DEMO: List keys ==========

app.get('/api/keys', (req, res) => {
  res.json(license.listKeys());
});

// SmartField login (encrypted)
app.post('/api/login', async (req, res) => {
  console.log('\n[Server] ═══════════════════════════════');
  console.log('[Server] SmartField login received');

  const { fields } = req.body;
  if (!fields) return res.status(400).json({ error: 'No fields' });

  const decrypted = {};
  for (const field of fields) {
    try {
      decrypted[field.id] = await sf.decrypt(field.encrypted);
      console.log(`[Server]   ${field.id}: "${decrypted[field.id]}"`);
    } catch (e) {
      decrypted[field.id] = '[decrypt failed]';
      console.log(`[Server]   ${field.id}: FAILED - ${e.message}`);
    }
  }

  console.log('[Server] ═══════════════════════════════\n');
  res.json({ success: true, message: 'Server decrypted your data successfully', decrypted, note: 'In production, password would be hashed and stored - never shown back' });
});

// Normal login (plaintext — for comparison)
app.post('/api/login-normal', (req, res) => {
  console.log('\n[Server] ⚠ NORMAL LOGIN (INSECURE)');
  console.log(`[Server]   email: "${req.body.email}"`);
  console.log(`[Server]   password: "${req.body.password}" ← PLAIN TEXT!\n`);
  res.json({ success: true, message: 'Server received your data IN PLAIN TEXT', received: req.body, warning: 'This password was visible to every middleware, proxy, and log' });
});

// SRI hash endpoint — clients use this to get the current integrity hash
app.get('/api/sri', (req, res) => {
  const crypto = require('crypto');
  const fs = require('fs');
  const filePath = path.join(__dirname, '..', 'component', 'smartfield.js');
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha384').update(content).digest('base64');
  const integrity = 'sha384-' + hash;
  res.json({
    integrity,
    script: '<script src="https://cdn.smartfield.dev/v1/smartfield.js" integrity="' + integrity + '" crossorigin="anonymous"></script>'
  });
});

// Health
app.get('/api/health', (req, res) => res.json({ ...sf.status(), license: { initialized: true }, server: 'ok' }));

// Start
const PORT = process.env.PORT || 3333;

sf.init().then(() => {
  license.init({ licensesDir: path.join(__dirname, '..', '.licenses') });

  // Auto-generate a demo test key if none exist
  if (license.listKeys().length === 0) {
    const demoKey = license.generateKey({ domain: 'localhost', plan: 'pro', owner: 'demo', test: true });
    console.log(`[License] Demo test key: ${demoKey.key}`);
  }

  app.listen(PORT, () => {
    console.log(`\n[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] Landing:    http://localhost:${PORT}/landing`);
    console.log(`[Server] Public key: http://localhost:${PORT}/api/public-key`);
    console.log(`[Server] Validate:   http://localhost:${PORT}/api/validate?key=YOUR_KEY`);
    console.log(`[Server] Health:     http://localhost:${PORT}/api/health\n`);
  });
});
