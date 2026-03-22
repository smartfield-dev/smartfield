<div align="center">

# 🔒 SmartField

### Every Keystroke, Encrypted.

**AES-256-GCM + RSA-2048 encryption inside a Web Component.**<br>
**Replace `<input>` with `<smart-field>` — 2 lines of code.**

[![npm](https://img.shields.io/npm/v/@smartfield-dev/server?color=22c55e&label=npm&logo=npm)](https://www.npmjs.com/package/@smartfield-dev/server)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)
[![Security Audit](https://img.shields.io/badge/security_audit-PASSED-22c55e)](SECURITY-AUDIT-REPORT.html)
[![Attacks Blocked](https://img.shields.io/badge/attacks_blocked-20%2F20-22c55e)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-22c55e?logo=node.js)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-22c55e)]()

<br>

<img src="https://raw.githubusercontent.com/smartfield-dev/smartfield/main/assets/security-modes.gif" alt="SmartField Security Modes" width="720">

<br>

**Hotjar is recording your users' passwords.**<br>
**Screen recorders see everything. Bots scrape everything. SmartField encrypts everything.**

[Live Demo](https://3wwprotocol.com/demo) · [Landing Page](https://3wwprotocol.com/landing) · [Hacker Challenge](https://3wwprotocol.com/demo/hacker.html) · [npm](https://www.npmjs.com/package/@smartfield-dev/server)

</div>

---

## The Problem

Every `<input>` on the web is **naked**. Any JavaScript on the page can read it:

```js
// Any tracker, extension, or injected script can do this:
document.querySelector('input[type="password"]').value
// → "MyBankPassword123"  💀
```

**Hotjar**, **FullStory**, **Clarity**, **LogRocket** — they all record keystrokes. Browser extensions read form data. XSS attacks steal passwords. And your users have no idea.

## The Solution

```html
<smart-field type="password" placeholder="password" encrypt-key="/api/public-key"></smart-field>
```

Now the same attack returns:

```js
document.querySelector('smart-field').value
// → "eyJ2IjoxLCJpdiI6IkNxT3..."  🔒 (encrypted payload)
```

The screen shows `ΣΩΔψξλ` — not the password. The DOM has nothing. The browser saved nothing. **Only your server can decrypt it.**

---

## How It Works

```
User types "A"
    ↓
Keystroke captured inside closed Shadow DOM
    ↓
Real value stored in WeakMap (invisible to JS)
    ↓
Screen shows random cipher: "Σ" (continuously mutating)
    ↓
AES-256-GCM encrypts data (new key per keystroke)
    ↓
AES key encrypted with server's RSA-2048 public key
    ↓
.value returns encrypted payload — ONLY your server can decrypt
```

<div align="center">
<img src="https://raw.githubusercontent.com/smartfield-dev/smartfield/main/assets/normal-vs-smartfield.gif" alt="Normal Input vs SmartField" width="720">
</div>

---

## Quick Start

### Frontend — 2 lines

```html
<script src="https://cdn.smartfield.dev/v1/smartfield.js"></script>

<smart-field type="password" placeholder="password" encrypt-key="/api/sf-key"></smart-field>
```

### Server — 3 lines

```bash
npm install @smartfield-dev/server
```

```js
const sf = require('@smartfield-dev/server');
await sf.init();
const password = await sf.decrypt(req.body.password);
```

That's it. Every keystroke is now encrypted end-to-end.

---

## Security Architecture

```
  User's Browser                         Your Server
  ┌─────────────────────┐               ┌─────────────────────┐
  │                     │               │                     │
  │  <smart-field>      │   encrypted   │  @smartfield/server │
  │  ┌───────────────┐  │──────────────→│  sf.decrypt()       │
  │  │ Shadow DOM    │  │               │                     │
  │  │ (closed)      │  │               │  YOUR private key   │
  │  │               │  │               │  YOUR server        │
  │  │ WeakMap ──────┤  │               │  YOUR data          │
  │  │ AES-256-GCM   │  │               │                     │
  │  │ RSA-2048      │  │               └─────────────────────┘
  │  └───────────────┘  │
  │                     │               SmartField (us)
  │  Screen shows:      │               ┌─────────────────────┐
  │  ΣΩΔψξλμπ           │               │  ZERO data          │
  │                     │               │  ZERO keys          │
  └─────────────────────┘               │  ZERO access        │
                                        └─────────────────────┘
```

**If we get hacked, there's nothing to steal.** We never see passwords, keys, or user data.

---

## 13 Security Layers

| # | Layer | What It Does |
|---|-------|-------------|
| 1 | **Closed Shadow DOM** | `.shadowRoot` returns `null` — JS can't access internals |
| 2 | **AES-256-GCM** | Military-grade authenticated encryption per keystroke |
| 3 | **RSA-2048** | Asymmetric key exchange — only your server has the private key |
| 4 | **WeakMap storage** | Sensitive data invisible to `JSON.stringify`, property enumeration |
| 5 | **Event blocking** | `stopPropagation()` on all keyboard events — blocks keyloggers |
| 6 | **Anti-copy/paste** | Blocks copy, cut, paste, select, drag, context menu |
| 7 | **Cipher display** | Screen recorders see `ΣΩΔψ`, not real text |
| 8 | **Anti-screenshot** | Auto-scramble on visibility change, blur, Print Screen |
| 9 | **Anti-bot** | Bots can't find or fill the input — Shadow DOM blocks all queries |
| 10 | **Anti-autosave** | Browser saves `ΣΩΔψ`, not the real password |
| 11 | **Hidden metadata** | `.type` → "encrypted", `.name` → random, `.length` → -1 |
| 12 | **Value injection blocked** | `.value` setter is a no-op (`configurable: false`) |
| 13 | **HTTPS enforcement** | Rejects non-HTTPS key URLs in production |

---

## 20/20 Attack Resistance

| Attack | Status | Defense |
|--------|--------|---------|
| `.value` read | ✅ Blocked | Returns encrypted payload only |
| `.shadowRoot` access | ✅ Blocked | Closed Shadow DOM → `null` |
| `.innerHTML` / `.textContent` | ✅ Blocked | Overridden getters → empty |
| `querySelector` | ✅ Blocked | Shadow DOM boundary |
| `children` / `childNodes` | ✅ Blocked | No accessible children |
| `outerHTML` extraction | ✅ Blocked | No plaintext in attributes |
| Metadata (type/name/length) | ✅ Blocked | "encrypted" / random / -1 |
| Value injection (`.value = x`) | ✅ Blocked | Setter is no-op |
| Keyboard event interception | ✅ Blocked | `stopPropagation()` |
| Prototype pollution | ✅ Blocked | `configurable: false` |
| `MutationObserver` | ✅ Blocked | Can't observe closed Shadow DOM |
| CSS data extraction | ✅ Blocked | No data in styles |
| Input overlay / clickjacking | ✅ Blocked | Keystrokes → Shadow DOM |
| `execCommand('copy')` | ✅ Blocked | Capture-phase handlers |
| `JSON.stringify` | ✅ Blocked | WeakMap invisible |
| Property enumeration | ✅ Blocked | Non-enumerable properties |
| ARIA extraction | ✅ Blocked | No data in ARIA attrs |
| Screen recording | ✅ Mitigated | Cipher chars + scramble |
| Browser autosave | ✅ Blocked | Saves cipher chars |
| Password manager injection | ✅ Blocked | 4 ignore flags + `type="text"` |

**Try it yourself:** [Hacker Challenge →](https://3wwprotocol.com/demo/hacker.html)

---

## Field Types

```html
<smart-field sf-type="card">      <!-- 16 digits, validation -->
<smart-field sf-type="expiry">    <!-- MM/YY auto-format -->
<smart-field sf-type="cvv">       <!-- 3-4 digits -->
<smart-field sf-type="ssn">       <!-- 9 digits -->
<smart-field sf-type="phone">     <!-- 10-15 digits -->
<smart-field type="password">     <!-- any text, hidden -->
<smart-field type="email">        <!-- any text -->
<smart-field>                     <!-- any text, no limits -->
```

---

## Custom Styling

```css
smart-field {
  --sf-bg: #ffffff;
  --sf-border-color: #006a4e;
  --sf-focus-color: #006a4e;
  --sf-cipher-color: #006a4e;
  --sf-cipher-glow: rgba(0, 106, 78, 0.4);
  --sf-radius: 8px;
  --sf-padding: 12px 16px;
  --sf-font-size: 14px;
  --sf-placeholder-color: #9ca3af;
}
```

---

## Environment Threat Scanner

SmartField automatically scans the page for threats when it loads:

| Threat | Detection |
|--------|-----------|
| **Hotjar, FullStory, Clarity** | Script pattern matching |
| **Google Analytics, FB Pixel** | Script pattern matching |
| **TikTok, Google Ads** | Script pattern matching |
| **HTTP forms** | Form action URL check |
| **Unprotected passwords** | `input[type="password"]` scan |
| **Console overrides** | `console.log` tampering check |
| **Excessive third-party scripts** | Script count analysis |

---

## Server SDK

### Express Middleware (auto mode)

```js
const sf = require('@smartfield-dev/server');
const express = require('express');
const app = express();

await sf.init();
app.use(sf.middleware());

// That's it. Now:
// GET  /sf-public-key  → serves your public key
// POST requests        → req.sf has decrypted fields
```

### Manual Mode

```js
await sf.init();

app.get('/api/sf-key', (req, res) => res.json(sf.getPublicKey()));

app.post('/api/login', async (req, res) => {
  const email = await sf.decrypt(req.body.email);
  const password = await sf.decrypt(req.body.password);
  // Only your server sees the plaintext
});
```

### Batch Decrypt

```js
const data = await sf.decryptFields(req.body);
// { email: "user@example.com", password: "secret123" }
```

---

## Use Cases

| Industry | Use Case | Field Types |
|----------|----------|-------------|
| 🏦 **Banking** | Login, transfers | password, account numbers |
| 💳 **Payments** | Checkout forms | card, expiry, cvv |
| 🏥 **Healthcare** | Patient records | SSN, diagnosis, prescriptions |
| 🏛️ **Government** | Tax forms | SSN, income data |
| 🔐 **Crypto** | Wallet import | seed phrases, private keys |
| ⚖️ **Legal** | Client data | case numbers, confidential info |

---

## Comparison

| Feature | `<input>` | Stripe Elements | Password Manager | **SmartField** |
|---------|-----------|----------------|-----------------|----------------|
| Encrypts keystrokes | ❌ | ❌ | ❌ | ✅ |
| Blocks screen recorders | ❌ | ❌ | ❌ | ✅ |
| Blocks keyloggers | ❌ | ❌ | ❌ | ✅ |
| Shadow DOM isolation | ❌ | ✅ iframe | ❌ | ✅ closed |
| Works with any field type | ✅ | ❌ cards only | ❌ passwords only | ✅ |
| Zero data architecture | N/A | ❌ Stripe sees data | ❌ vault provider | ✅ |
| Custom styling | ✅ | ⚠️ limited | ❌ | ✅ CSS vars |
| No iframe overhead | ✅ | ❌ | ✅ | ✅ |
| Self-hosted option | ✅ | ❌ | ❌ | ✅ |
| Anti-bot protection | ❌ | ⚠️ partial | ❌ | ✅ |
| Environment scanning | ❌ | ❌ | ❌ | ✅ |

---

## Encryption Details

| Component | Algorithm | Standard |
|-----------|-----------|----------|
| Data encryption | AES-256-GCM | NIST SP 800-38D |
| Key exchange | RSA-OAEP-2048 | NIST SP 800-56B |
| Random generation | `crypto.getRandomValues()` | Web Crypto API |
| Key storage | WeakMap (client) / `.smartfield/` (server) | — |
| Payload format | `Base64(JSON{v, iv, key, data})` | Versioned |

Each keystroke generates a **new AES key and IV**. Even identical passwords produce completely different ciphertext every time.

---

## Pricing

| Plan | Price | Fields | Badge | Features |
|------|-------|--------|-------|----------|
| **Free** | $0 | 3 per page | Yes | Community support |
| **Pro** | $19/mo | Unlimited | No | Dashboard, SDK, priority support |
| **Enterprise** | Custom | Unlimited | No | Self-hosted, SLA, SSO, compliance |

---

## Security Audit

SmartField has been audited by **Softwebo Security** (March 2026).

- **0 critical vulnerabilities**
- **0 high-severity issues**
- **20/20 attack vectors blocked**
- **Rating: STRONG — PASSED**

[View Full Audit Report →](SECURITY-AUDIT-REPORT.html)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Component | Vanilla JS, Web Components API, Shadow DOM, WeakMap |
| Encryption | Web Crypto API (hardware-accelerated, FIPS-compliant) |
| Server SDK | Node.js 18+, zero dependencies |
| Landing | Static HTML/CSS (no framework) |
| Styling | CSS Custom Properties (`--sf-*`) |

---

## Contributing

SmartField is open source. PRs welcome.

```bash
git clone https://github.com/smartfield-dev/smartfield.git
cd smartfield/api
npm install
node server-sdk.js
# Open http://localhost:3333/demo
```

---

## License

MIT — use it everywhere.

---

<div align="center">

**Built for developers who care about their users' data.**

[Website](https://3wwprotocol.com/landing) · [npm](https://www.npmjs.com/package/@smartfield-dev/server) · [Demo](https://3wwprotocol.com/demo) · [Hacker Challenge](https://3wwprotocol.com/demo/hacker.html)

</div>
