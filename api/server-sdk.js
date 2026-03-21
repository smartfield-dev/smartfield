/**
 * Demo server using @smartfield/server SDK
 * This is what a REAL client's server would look like
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const sf = require('../sdk'); // In production: require('@smartfield/server')

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

// Health
app.get('/api/health', (req, res) => res.json({ ...sf.status(), server: 'ok' }));

// Start
const PORT = process.env.PORT || 3333;

sf.init().then(() => {
  app.listen(PORT, () => {
    console.log(`\n[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] Landing: http://localhost:${PORT}/landing`);
    console.log(`[Server] Public key: http://localhost:${PORT}/api/public-key`);
    console.log(`[Server] Status: http://localhost:${PORT}/api/health\n`);
  });
});
