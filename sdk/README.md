# @smartfield/server

Server-side SDK for [SmartField](https://smartfield.dev) — decrypt encrypted form data from `<smart-field>` components.

## Installation

```bash
npm install @smartfield/server
```

## Quick Start

```javascript
const sf = require('@smartfield/server');
const express = require('express');
const app = express();

app.use(express.json());

// 1. Initialize (generates keys on YOUR server, stored locally)
await sf.init();

// 2. Serve public key to frontend
app.get('/api/sf-key', (req, res) => res.json(sf.getPublicKey()));

// 3. Decrypt form submissions
app.post('/api/login', async (req, res) => {
  const email = await sf.decrypt(req.body.email);
  const password = await sf.decrypt(req.body.password);
  // email = "user@example.com"
  // password = "Caracas8"
});

app.listen(3000);
```

## Frontend Setup

```html
<script src="https://cdn.smartfield.dev/v1/smartfield.js"></script>

<smart-field
  type="password"
  name="password"
  placeholder="your password"
  encrypt-key="/api/sf-key"
></smart-field>
```

## API Reference

### `sf.init(options?)`
Generates RSA-2048 key pair and saves to `.smartfield/` directory.
If keys already exist, loads them from disk.

```javascript
await sf.init();
// or
await sf.init({ keysDir: '/path/to/keys', force: false });
```

**Options:**
- `keysDir` (string) — Directory to store keys. Default: `.smartfield/`
- `force` (boolean) — Regenerate keys even if they exist. Default: `false`

### `sf.getPublicKey()`
Returns the public key in JWK format. Serve this to your frontend.

```javascript
app.get('/api/sf-key', (req, res) => res.json(sf.getPublicKey()));
```

### `sf.decrypt(encryptedPayload)`
Decrypts a single encrypted field value.

```javascript
const password = await sf.decrypt(req.body.password);
```

### `sf.decryptFields(fields)`
Decrypts all encrypted fields in an object.

```javascript
const data = await sf.decryptFields(req.body);
// { email: "user@example.com", password: "Caracas8", name: "John" }
```

### `sf.middleware(options?)`
Express middleware that auto-serves public key and decrypts POST data.

```javascript
app.use(sf.middleware());
// Now: GET /sf-public-key → public key
// Now: req.sf → decrypted fields on POST requests
```

### `sf.status()`
Check SDK status.

```javascript
console.log(sf.status());
// { initialized: true, keysDir: '.smartfield/', hasPrivateKey: true, ... }
```

## Security

- **Keys are LOCAL.** Generated on your server, stored in `.smartfield/` directory.
- **We NEVER see your keys.** SmartField (the company) has zero access to your private key.
- **We NEVER see user data.** All decryption happens on YOUR server.
- **Auto .gitignore.** The SDK automatically adds `.smartfield/` to your `.gitignore`.
- **File permissions.** Private key is saved with mode `0600` (owner read/write only).

## Encryption Details

| Component | Algorithm |
|-----------|-----------|
| Data encryption | AES-256-GCM |
| Key exchange | RSA-OAEP-2048 |
| Key derivation | Web Crypto API (hardware-accelerated) |
| Payload format | Base64(JSON{v, iv, key, data}) |

Each keystroke generates a new AES key and IV, encrypted with your RSA public key.
This means even identical passwords produce completely different ciphertext.

## License

MIT
