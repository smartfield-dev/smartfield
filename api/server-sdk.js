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
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, '..', 'sitemap.xml')));
app.get('/robots.txt', (req, res) => { res.type('text/plain'); res.send('User-agent: *\nAllow: /\nSitemap: https://3wwprotocol.com/sitemap.xml'); });

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

// Stack demo login (decrypt all fields sent from demo pages)
app.post('/api/stack-login', async (req, res) => {
  console.log('\n[Node.js] ═══════════════════════════════');
  console.log('[Node.js] Stack demo login received');
  const data = req.body;
  const decrypted = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'normalPwd') {
      decrypted[key] = value;
      console.log(`[Node.js]   ${key}: "${value}" ← PLAIN TEXT`);
    } else if (typeof value === 'string' && value.length > 50) {
      try {
        decrypted[key] = await sf.decrypt(value);
        console.log(`[Node.js]   ${key}: "${decrypted[key]}" ← DECRYPTED`);
      } catch (e) {
        decrypted[key] = '[decrypt failed]';
        console.log(`[Node.js]   ${key}: FAILED - ${e.message}`);
      }
    } else {
      decrypted[key] = value;
    }
  }
  console.log('[Node.js] ═══════════════════════════════\n');
  res.json({ server: 'Node.js (Express)', status: 'ok', decrypted, normalPwd: data.normalPwd || '', note: 'The normalPwd was sent in plain text. SmartField fields were encrypted.' });
});

// Serve stacks demo
app.use('/demo/stacks', express.static(path.join(__dirname, '..', 'demo', 'stacks')));

// Proxy for Java (avoids CORS issues)
const http = require('http');
app.all('/proxy/java/:path', (req, res) => {
  const targetPath = '/' + req.params.path;
  const options = { hostname: 'localhost', port: 6666, path: targetPath, method: req.method, headers: { 'Content-Type': 'application/json' } };
  const proxy = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', c => data += c);
    proxyRes.on('end', () => { res.status(proxyRes.statusCode).type('json').send(data); });
  });
  proxy.on('error', (e) => res.status(502).json({ error: 'Java server unreachable: ' + e.message }));
  if (req.body && Object.keys(req.body).length > 0) proxy.write(JSON.stringify(req.body));
  proxy.end();
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
