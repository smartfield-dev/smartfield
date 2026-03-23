# @smartfield-dev/server

Server-side SDK for [SmartField](https://smartfield.dev). Decrypt encrypted form data from `<smart-field>` components.

**Website:** https://smartfield.dev
**Docs:** https://smartfield.dev/docs
**Support:** support@smartfield.dev
**GitHub:** https://github.com/smartfield-dev/smartfield

## Installation

```bash
npm install @smartfield-dev/server
```

## Quick Start

```javascript
const sf = require('@smartfield-dev/server');
const express = require('express');
const app = express();

app.use(express.json());

// 1. Initialize (generates RSA-2048 keys on YOUR server)
await sf.init();

// 2. Serve public key to frontend
app.get('/api/sf-key', (req, res) => res.json(sf.getPublicKey()));

// 3. Decrypt form submissions
app.post('/api/login', async (req, res) => {
  const email = await sf.decrypt(req.body.email);
  const password = await sf.decrypt(req.body.password);
});

app.listen(3000);
```

## Frontend Setup

```html
<script src="https://cdn.smartfield.dev/v1/smartfield.js"></script>

<smart-field
  type="password"
  placeholder="password"
  encrypt-key="/api/sf-key"
  sf-security="peek"
></smart-field>
```

## Security Modes

SmartField offers 3 security modes. Set with the `sf-security` attribute:

| Mode | Attribute | Behavior |
|------|-----------|----------|
| **MAX** | `sf-security="max"` | Full cipher display. User never sees real text. Maximum security for seed phrases, classified data. |
| **PEEK** | `sf-security="peek"` | Shield button on the left. Hold to reveal text for 5 seconds, then re-encrypts visually. |
| **BRIEF** | `sf-security="brief"` | Each character visible for 1 second after typing, then transforms to cipher. Like phone PIN entry. |

All three modes use identical AES-256-GCM + RSA-2048 encryption. Only the display changes.

```html
<!-- Maximum security -->
<smart-field sf-security="max" encrypt-key="/api/sf-key"></smart-field>

<!-- Hold to reveal (recommended for passwords) -->
<smart-field sf-security="peek" encrypt-key="/api/sf-key"></smart-field>

<!-- Brief flash then hide (recommended for PINs) -->
<smart-field sf-security="brief" encrypt-key="/api/sf-key"></smart-field>
```

## Pricing

| Plan | Fields | Badge | Key |
|------|--------|-------|-----|
| **Free** | 3 per page | Yes | No `data-key` needed |
| **Pro** ($19/mo) | Unlimited | No | `data-key="sf_live_xxx"` |
| **Enterprise** | Unlimited + self-hosted | No | Custom |

```html
<!-- Free: no data-key, 3 fields max, badge shown -->
<script src="https://cdn.smartfield.dev/v1/smartfield.js"></script>

<!-- Pro: add data-key for unlimited fields -->
<script src="https://cdn.smartfield.dev/v1/smartfield.js"
        data-key="sf_live_your_key_here"></script>
```

## Server SDKs (6 Languages)

All SDKs decrypt the same encrypted payload. Use whichever matches your backend.

### Node.js
```bash
npm install @smartfield-dev/server
```
```javascript
const sf = require('@smartfield-dev/server');
await sf.init();
const password = await sf.decrypt(req.body.password);
```

### Python
```bash
pip install cryptography
```
```python
from smartfield import SmartField
sf = SmartField()
sf.init()
password = sf.decrypt(request.json['password'])
```

### Java
```java
// javax.crypto included in JDK
SmartField sf = new SmartField();
sf.init();
String password = sf.decrypt(encryptedPayload);
```

### Go
```go
// crypto/rsa + crypto/aes included in stdlib
sf := smartfield.New()
sf.Init()
password, err := sf.Decrypt(encryptedPayload)
```

### PHP
```php
// openssl extension included in PHP
$sf = new SmartField();
$sf->init();
$password = $sf->decrypt($_POST['password']);
```

### Ruby
```ruby
# OpenSSL included in Ruby stdlib
sf = SmartField.new
sf.init
password = sf.decrypt(params[:password])
```

## API Reference

### `sf.init(options?)`
Generates RSA-2048 key pair and saves to `.smartfield/` directory. If keys already exist, loads them.

```javascript
await sf.init();
await sf.init({ keysDir: '/path/to/keys' });
```

### `sf.getPublicKey()`
Returns the public key in JWK format. Serve this to your frontend.

### `sf.decrypt(encryptedPayload)`
Decrypts a single encrypted field value. Returns plaintext string.

### `sf.decryptFields(fields)`
Decrypts all encrypted fields in an object. Returns object with decrypted values.

### `sf.middleware(options?)`
Express middleware. Auto-serves public key at `/sf-public-key` and decrypts POST data to `req.sf`.

### `sf.rotateKeys()`
Rotates RSA keys. Archives old keys for decrypting data encrypted before rotation.

### `sf.status()`
Returns SDK status: initialized, keys directory, key count, version.

## Field Types

```html
<smart-field sf-type="card">      <!-- 16 digits, Luhn validation -->
<smart-field sf-type="expiry">    <!-- MM/YY auto-format -->
<smart-field sf-type="cvv">       <!-- 3-4 digits -->
<smart-field sf-type="ssn">       <!-- 9 digits -->
<smart-field sf-type="phone">     <!-- 10-15 digits -->
<smart-field type="password">     <!-- any text, hidden -->
<smart-field type="email">        <!-- any text -->
<smart-field>                     <!-- any text, no limits -->
```

## Encryption Standards

| Component | Algorithm | Standard |
|-----------|-----------|----------|
| Data encryption | AES-256-GCM | NIST SP 800-38D |
| Key exchange | RSA-OAEP-2048 | NIST SP 800-56B |
| Random generation | crypto.getRandomValues() | Web Crypto API |
| Key storage | .smartfield/ (chmod 0600) | Local only |
| Payload format | Base64(JSON{v, iv, key, data}) | Versioned |

Each keystroke generates a new AES key and IV. Even identical passwords produce completely different ciphertext.

## Security

- **Keys are LOCAL.** Generated on your server, stored in `.smartfield/`.
- **We NEVER see your keys.** SmartField has zero access to your private key.
- **We NEVER see user data.** All decryption happens on YOUR server.
- **Auto .gitignore.** SDK adds `.smartfield/` to your `.gitignore`.
- **File permissions.** Private key saved with mode `0600`.
- **20/20 attacks blocked.** Verified in security audit (March 2026).

## License

MIT. Copyright (c) 2026 SmartField.

https://smartfield.dev | support@smartfield.dev
