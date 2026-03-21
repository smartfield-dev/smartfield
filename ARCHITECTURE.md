# SmartField — Complete Architecture & Documentation
## Date: 2026-03-21 | Status: Working Prototype v0.1

---

## What Is SmartField?

A Web Component (`<smart-field>`) that replaces standard HTML `<input>` elements.
Every keystroke is encrypted with AES-256-GCM + RSA-2048 inside a closed Shadow DOM.
No JavaScript, tracker, screen recorder, bot, or hacker can read the user's data.

**Market validation:** No commercial product does this. Academic research (ShadowCrypt 2014) was abandoned. Gap confirmed.

**Pitch:** "Hotjar is recording your users' passwords. 2 lines of code fix it."

---

## Project Structure

```
/home/kovi/Desktop/SmartField/
│
├── component/
│   └── smartfield.js              # The Web Component (frontend)
│                                    - Closed Shadow DOM (mode: 'closed')
│                                    - AES-256-GCM + RSA-2048 hybrid encryption
│                                    - WeakMap for sensitive data (invisible to JSON.stringify)
│                                    - Animated cipher characters (ΣΩΔψ)
│                                    - Anti copy/paste/select/drag/context-menu
│                                    - Anti-screenshot (scramble on visibility change)
│                                    - Anti-bot (Shadow DOM blocks querySelector)
│                                    - Anti-autosave (browser can't read real value)
│                                    - Environment threat scanner (Hotjar, GA, FB detection)
│                                    - Field validation (sf-type: card, expiry, cvv, ssn, phone)
│                                    - Fetches server public key via encrypt-key attribute
│                                    - 20/20 hack attacks blocked (verified)
│
├── sdk/
│   ├── package.json               # npm package: @smartfield/server
│   ├── index.js                   # Server-side SDK
│   │                                - sf.init() → generates RSA keys locally
│   │                                - sf.decrypt() → decrypts SmartField data
│   │                                - sf.decryptFields() → batch decrypt
│   │                                - sf.middleware() → Express auto-decrypt
│   │                                - sf.getPublicKey() → serve to frontend
│   │                                - Keys stored in .smartfield/ (auto-gitignored)
│   └── README.md                  # SDK documentation
│
├── api/
│   ├── package.json               # Express + cors
│   ├── server.js                  # Original demo server
│   ├── server-sdk.js              # Demo server using SDK (USE THIS ONE)
│   └── .smartfield/               # Auto-generated keys (NEVER commit)
│       ├── private.json           # RSA private key (mode 0600)
│       └── public.json            # RSA public key
│
├── landing/
│   ├── index.html                 # Main landing page
│   │                                - Hero: "Every Keystroke, Encrypted"
│   │                                - Stats: AES-256, RSA-2048, Zero Copy, Anti-AI, Anti-Save
│   │                                - Live Demo: side-by-side comparison with attack simulation
│   │                                - Use Cases: Banking, Payments, Healthcare, Crypto, Legal, Anti-Bot
│   │                                - Comparison table: SmartField vs input vs Stripe vs PwdMgr (13 features)
│   │                                - "Your Brand, Your Colors": 4 themed mockups
│   │                                - "Works Everywhere": phone + tablet mockups
│   │                                - Pricing: Free/$49/$299 with monthly/annual toggle (20% discount)
│   │                                - FAQ: 10 questions with answers
│   │                                - Signup form (uses SmartField itself)
│   │                                - Footer: logo, links, legal, social
│   │
│   ├── usecases.html              # Detailed use case simulations
│   │                                - Banking: account statement with encrypted balances (5s reveal)
│   │                                - Payments: checkout with sf-type card/expiry/cvv
│   │                                - Healthcare: patient records with encrypted diagnosis (5s reveal)
│   │                                - Government: tax form with SSN
│   │                                - Crypto: wallet import with seed phrase
│   │
│   ├── signup.html                # Registration page
│   │                                - Plan selector (Free/Pro/Enterprise)
│   │                                - Name, email, company, industry
│   │                                - Password field uses SmartField (meta!)
│   │                                - Google signup button
│   │                                - Terms & Privacy links
│   │
│   ├── privacy.html               # Privacy Policy
│   └── terms.html                 # Terms of Service
│
├── demo/
│   ├── index.html                 # Side-by-side comparison demo
│   ├── test.html                  # Basic functionality test (3 tests)
│   └── hacker.html                # 20-attack automated hack challenge
│
├── smartfield-logo-kit.html       # Logo kit (grid icon + wordmark)
│
└── ARCHITECTURE.md                # This file
```

---

## How To Run

```bash
# Start the server
cd /home/kovi/Desktop/SmartField/api
node server-sdk.js

# Opens at:
# Landing:     http://localhost:3333/landing
# Use Cases:   http://localhost:3333/landing/usecases.html
# Signup:      http://localhost:3333/landing/signup.html
# Demo:        http://localhost:3333/demo
# Hacker test: http://localhost:3333/demo/hacker.html
# Public key:  http://localhost:3333/api/public-key
# Health:      http://localhost:3333/api/health
```

---

## Technical Architecture

### Encryption Flow

```
User types "A"
    ↓
keydown captured inside closed Shadow DOM
    ↓
Real value stored in WeakMap (NOT on element object)
    ↓
Display shows random cipher char: "Σ" (animated, mutating)
    ↓
AES-256-GCM key generated (random per encryption)
    ↓
Data encrypted with AES key
    ↓
AES key encrypted with server's RSA-2048 public key
    ↓
Output: base64(JSON{v, iv, encryptedKey, encryptedData})
    ↓
.value returns ONLY the encrypted payload
    ↓
Form submit → encrypted payload sent to server
    ↓
Server decrypts AES key with RSA private key
    ↓
Server decrypts data with AES key
    ↓
Server has: "A" (plaintext, only here)
```

### Security Layers (all 20/20 attacks blocked)

| # | Layer | Protection |
|---|-------|-----------|
| 1 | Shadow DOM (closed) | .shadowRoot = null, querySelector = null |
| 2 | AES-256-GCM | Military-grade symmetric encryption |
| 3 | RSA-2048 | Asymmetric key exchange |
| 4 | WeakMap storage | Sensitive data invisible to JSON.stringify & property enumeration |
| 5 | Event blocking | stopPropagation on all keyboard/clipboard events |
| 6 | Anti-copy/paste | preventDefault on copy, cut, paste, select, drag, context menu |
| 7 | Cipher display | Screen recorders see ΣΩΔψ, not real text |
| 8 | Anti-screenshot | Auto-scramble on visibility change, window blur, Print Screen |
| 9 | Anti-bot | Bots can't find or fill the input (Shadow DOM blocks all queries) |
| 10 | Anti-autosave | Browser saves cipher chars "ΣΩΔψ", not password |
| 11 | Hidden metadata | .type="encrypted", .name=random, .length=-1, .empty=false |
| 12 | Anti-injection | .value setter blocked |
| 13 | Anti-MutationObserver | Can't observe inside closed Shadow DOM |

### Zero Data Architecture

```
                    SmartField (us)
                   ┌──────────────┐
                   │ CDN          │ ← serves smartfield.js
                   │ npm          │ ← serves @smartfield/server
                   │              │
                   │ ZERO DATA    │ ← we never see passwords
                   │ ZERO KEYS    │ ← we never see private keys
                   │ ZERO PII     │ ← we never see user data
                   └──────────────┘

  User's Browser                    Client's Server
  ┌──────────────┐                 ┌──────────────────┐
  │ smartfield.js│──encrypted─────→│ @smartfield/server│
  │              │                 │ sf.decrypt()      │
  │              │                 │ THEIR private key │
  │              │                 │ THEIR server      │
  └──────────────┘                 └──────────────────┘
```

If we get hacked: nothing to steal. No passwords. No keys. No user data.

---

## How a Client Integrates

### Frontend (2 lines)
```html
<script src="https://cdn.smartfield.dev/v1/smartfield.js"
        data-key="sf_live_abc123"></script>

<smart-field type="password" placeholder="password"></smart-field>
```

### Server (3 lines)
```javascript
const sf = require('@smartfield/server');
await sf.init();
const password = await sf.decrypt(req.body.password);
```

### Field Types
```html
<smart-field sf-type="card">     <!-- 16 digits only, Luhn validation -->
<smart-field sf-type="expiry">   <!-- MM/YY auto-format -->
<smart-field sf-type="cvv">      <!-- 3-4 digits only -->
<smart-field sf-type="ssn">      <!-- 9 digits only -->
<smart-field sf-type="phone">    <!-- 10-15 digits -->
<smart-field type="password">    <!-- any text, hidden -->
<smart-field type="email">       <!-- any text -->
<smart-field>                    <!-- any text, no limits -->
```

### Custom Styling
```css
smart-field {
  --sf-bg: #ffffff;
  --sf-border-color: #006a4e;
  --sf-focus-color: #006a4e;
  --sf-cipher-color: #006a4e;
  --sf-radius: 8px;
  --sf-padding: 12px 16px;
  --sf-font-size: 14px;
}
```

---

## License System (TODO - implement next)

```
FREE: No data-key → 3 fields per page, badge shown
PAID: data-key="sf_live_xxx" → validates against API

Validation:
  GET api.smartfield.dev/validate?key=sf_live_xxx
  → checks: key valid? domain match? plan active?
  → returns: { plan, fields, badge }

Key tied to domain:
  key registered for: banco.com
  used on: banco.com → OK
  used on: hacker.com → falls back to free plan
```

---

## Business Model

### Pricing
| Plan | Monthly | Annual (20% off) | Features |
|------|---------|------------------|----------|
| Starter | $0 | $0 | 3 fields, badge, community |
| Pro | $49/mo | $39/mo ($468/yr) | Unlimited, no badge, dashboard, SDK |
| Enterprise | $299/mo | $239/mo ($2,868/yr) | Self-hosted, compliance, SLA, SSO |

### Revenue Model
- SaaS B2B recurring monthly/annual
- Free users = marketing (badge = ads)
- Pro = developers, small companies
- Enterprise = banks, hospitals, government

### Growth Strategy
```
Free (Pedro's Bakery) → badge on 1000 websites
    → developers see badge → try SmartField
    → 2% convert to Pro ($49)
    → enterprise discovers → $299+
```

### Target Customers
- Banks & Finance (compliance)
- Healthcare (HIPAA)
- E-commerce (PCI-DSS)
- Crypto/DeFi (seed phrases)
- Government (tax, SSN)
- Any SaaS with forms

---

## What's Built vs Pending

### ✅ DONE
- [x] Web Component with closed Shadow DOM
- [x] AES-256-GCM + RSA-2048 hybrid encryption
- [x] WeakMap storage (invisible to JSON.stringify)
- [x] 20/20 hack attacks blocked
- [x] Animated cipher characters (continuously mutating)
- [x] Anti copy/paste/select/drag/context-menu
- [x] Anti-screenshot (scramble on blur/visibility)
- [x] Anti-bot (Shadow DOM blocks all queries)
- [x] Anti-autosave (browser saves cipher chars)
- [x] Environment threat scanner (Hotjar, GA, FB detection)
- [x] Field validation (sf-type: card, expiry, cvv, ssn, phone)
- [x] Server-side SDK (@smartfield/server)
- [x] End-to-end working: encrypt → send → decrypt
- [x] Landing page (hero, demo, use cases, pricing, FAQ, signup)
- [x] Use cases page (banking, payments, healthcare, gov, crypto)
- [x] Signup page with plan selection
- [x] Privacy Policy & Terms of Service
- [x] Hacker Challenge (20 automated attacks)
- [x] Logo kit (grid icon)
- [x] Monthly/Annual pricing toggle
- [x] Footer with legal links
- [x] This documentation

### ⬜ TODO
- [ ] License key validation in component (data-key + domain check)
- [ ] Git repo (private first, then public)
- [ ] Deploy to Vercel + domain (smartfield.dev)
- [ ] npm publish @smartfield/server
- [ ] Subresource Integrity (SRI) for script loading
- [ ] Key rotation mechanism
- [ ] Dashboard (threat analytics, field usage)
- [ ] Stripe payment integration
- [ ] SDKs: Python, PHP, Java, Go
- [ ] sf-type="message" (encrypted textarea)
- [ ] Hacker News launch post
- [ ] Mobile testing

---

## CRITICAL: Don't Break What Works

When continuing development in a new session:

1. **smartfield.js works** — don't restructure without testing
2. **WeakMap** stores all sensitive data — NOT on the element object
3. **setTimeout(100ms)** in constructor reads attributes (encrypt-key, sf-type)
4. **keydown handler** uses `e.preventDefault()` + `e.stopPropagation()`
5. **Cipher animation** uses `setInterval` with `_s('cipherMap')` array
6. **`_s()` helper** accesses WeakMap — defined with `Object.defineProperty` (non-enumerable)
7. **Server uses server-sdk.js** not server.js — `node api/server-sdk.js`
8. **Keys in .smartfield/** — never commit, auto-gitignored
9. All landing/demo pages served from localhost:3333 via Express
10. The component script loads from `/component/smartfield.js`

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend component | Vanilla JS, Web Components API, Shadow DOM, WeakMap |
| Encryption | Web Crypto API (browser-native, hardware-accelerated) |
| Algorithms | AES-256-GCM (data) + RSA-OAEP-2048 (key exchange) |
| Demo server | Node.js 18+ + Express |
| Landing page | Static HTML/CSS (no framework) |
| Styling | CSS Custom Properties (--sf-*) |
| Logo | SVG grid icon (data matrix pattern) |

---

## Related Projects

### Rx (X-Ray Browser)
Location: `/home/kovi/Desktop/X-Ray/rx/`
Status: Working prototype
Purpose: Validates the PROBLEM that SmartField SOLVES
- Electron app that scans websites for security issues
- Shows what happens behind web pages (code, trackers, cookies)
- Found real vulnerabilities in InPrices, Temu, Instagram, Twitter

Rx shows the problem → SmartField is the solution.
