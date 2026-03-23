/**
 * SmartField v2.7.0 - Secure encrypted input
 * Every keystroke encrypted with AES-256-GCM + RSA-2048
 */
(function () {
  'use strict';

  const CHARS = 'ΣΩΔΨξλμπφψ§∞∑∏∂∇≈≡∫αβγδ';
  const randChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

  // ========== LICENSE SYSTEM ==========

  const License = {
    _state: null,       // { plan, maxFields, badge, sig, ts, exp }
    _fieldCount: 0,     // active smart-field instances on page
    _validated: false,
    _validating: false,

    // Read data-key from the <script> tag that loaded this file
    getDataKey: function() {
      var scripts = document.querySelectorAll('script[src]');
      for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].src && scripts[i].src.indexOf('smartfield') !== -1) {
          return scripts[i].getAttribute('data-key') || null;
        }
      }
      return null;
    },

    // Check sessionStorage cache
    getCached: function() {
      try {
        var cached = sessionStorage.getItem('sf_license');
        if (!cached) return null;
        var data = JSON.parse(cached);
        // Check expiry
        if (data.exp && Date.now() > data.exp) {
          sessionStorage.removeItem('sf_license');
          return null;
        }
        return data;
      } catch(e) { return null; }
    },

    // Cache validation result
    setCache: function(data) {
      try {
        sessionStorage.setItem('sf_license', JSON.stringify(data));
      } catch(e) {}
    },

    // Validate license against server
    validate: function(callback) {
      if (this._validated && this._state) {
        callback(this._state);
        return;
      }

      // Check cache first
      var cached = this.getCached();
      if (cached) {
        this._state = cached;
        this._validated = true;
        callback(cached);
        return;
      }

      var dataKey = this.getDataKey();

      // No key = free plan (no server call needed)
      if (!dataKey) {
        this._state = { valid: true, plan: 'free', maxFields: 3, badge: true, domain: '*' };
        this._validated = true;
        callback(this._state);
        return;
      }

      // Prevent duplicate validation requests
      if (this._validating) {
        var self = this;
        setTimeout(function() { self.validate(callback); }, 100);
        return;
      }
      this._validating = true;

      // Build validation URL
      var validateUrl = this._getValidateUrl();
      var domain = window.location.hostname;
      var url = validateUrl + '?key=' + encodeURIComponent(dataKey) + '&domain=' + encodeURIComponent(domain);

      var self = this;
      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          self._validating = false;
          if (data.valid) {
            self._state = data;
            self._validated = true;
            self.setCache(data);
          } else {
            // Invalid key — fallback to free
            self._state = { valid: true, plan: 'free', maxFields: 3, badge: true, domain: '*', warning: data.error };
            self._validated = true;
          }
          callback(self._state);
        })
        .catch(function() {
          // Server unreachable — graceful fallback to free
          self._validating = false;
          self._state = { valid: true, plan: 'free', maxFields: 3, badge: true, domain: '*', fallback: true };
          self._validated = true;
          callback(self._state);
        });
    },

    // Determine validation API URL
    _getValidateUrl: function() {
      // Check for explicit validate-url on script tag
      var scripts = document.querySelectorAll('script[src]');
      for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].src && scripts[i].src.indexOf('smartfield') !== -1) {
          var url = scripts[i].getAttribute('data-validate-url');
          if (url) return url;
        }
      }
      // Default: same origin
      return '/api/validate';
    },

    // Check if a new field can be registered
    canAddField: function() {
      if (!this._state) return true; // Not validated yet, allow (will check later)
      if (this._state.maxFields === -1) return true; // Unlimited
      return this._fieldCount < this._state.maxFields;
    },

    // Register a new field
    registerField: function() {
      this._fieldCount++;
    },

    // Unregister a field (on disconnect)
    unregisterField: function() {
      this._fieldCount = Math.max(0, this._fieldCount - 1);
    },

    // Should show badge?
    shouldShowBadge: function() {
      if (!this._state) return true; // Default to badge until validated
      return this._state.badge === true;
    },

    // Get plan name
    getPlan: function() {
      return this._state ? this._state.plan : 'free';
    }
  };

  // ========== CRYPTO ==========

  const Crypto = {
    async generateKeys() {
      const rsa = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['encrypt', 'decrypt']
      );
      return { publicKey: rsa.publicKey, privateKey: rsa.privateKey, publicKeyJwk: await crypto.subtle.exportKey('jwk', rsa.publicKey) };
    },
    async importPublicKey(jwk) {
      return crypto.subtle.importKey(
        'jwk', jwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false, ['encrypt']
      );
    },

    async encrypt(publicKey, text) {
      if (text === null || text === undefined) return '';
      const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(text));
      const rawKey = await crypto.subtle.exportKey('raw', aesKey);
      const encKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawKey);
      const b = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
      return btoa(JSON.stringify({ v: 1, iv: b(iv), key: b(encKey), data: b(enc) }));
    },
    // decrypt() removed — decryption must only happen server-side
  };

  // Store sensitive data OUTSIDE the element — invisible to JSON.stringify and property enumeration
  const _secrets = new WeakMap();

  class SmartField extends HTMLElement {
    constructor() {
      super();
      var __shadow = this.attachShadow({ mode: 'closed' });

      // Sensitive data in WeakMap — NOT on the object
      _secrets.set(this, {
        realValue: '',
        encrypted: '',
        keys: null,
        cipherMap: [],
        shadow: __shadow,
        fieldId: 'sf_' + crypto.getRandomValues(new Uint8Array(8)).reduce((s,b) => s + b.toString(16).padStart(2,'0'), '')
      });

      // TRAP: _shadow returns a fake decoy Shadow DOM
      // Attackers who find this get honeypot data, not real internals
      var me = this;
      Object.defineProperty(this, '_shadow', {
        get: function() {
          var fake = document.createElement('div');
          fake.innerHTML = '<input type="text" value="[ENCRYPTED — ACCESS DENIED]" disabled><p>SmartField: unauthorized Shadow DOM access detected.</p>';
          fake.querySelector = function() { return null; };
          fake.querySelectorAll = function() { return []; };
          fake.getElementById = function() { return null; };
          return fake;
        },
        enumerable: false,
        configurable: false
      });

      this._anim = null;
      this._disabled = false; // License limit reached
      this._securityMode = 'max'; // max | peek | brief
      this._isPeeking = false;
      this._peekTimeout = null;
      this._briefRevealed = new Set(); // indices currently showing real chars

      // Protect .value from Object.defineProperty attacks
      var me = this;
      Object.defineProperty(this, 'value', {
        get: function() { return _secrets.get(me).encrypted; },
        set: function() {},
        enumerable: false,
        configurable: false  // CANNOT be overridden by attacker
      });

      // Helper to access secrets - non-enumerable, invisible to JSON.stringify
      Object.defineProperty(this, '_s', {
        value: function(key, val) {
          var s = _secrets.get(me);
          if (val !== undefined) { s[key] = val; return val; }
          return s[key];
        },
        enumerable: false,
        configurable: false
      });

      // Public API for framework integrations (React, Vue, Angular, etc.)
      // Non-enumerable: invisible to JSON.stringify, Object.keys, for..in
      // Returns plaintext value — same as what _s('realValue') returns
      Object.defineProperty(this, 'getRealValue', {
        value: function() { return _secrets.get(me).realValue; },
        enumerable: false,
        configurable: false
      });

      // Public API: check if field has content (without revealing length)
      Object.defineProperty(this, 'hasValue', {
        value: function() { return _secrets.get(me).realValue.length > 0; },
        enumerable: false,
        configurable: false
      });

      // Public API: clear the field programmatically
      Object.defineProperty(this, 'clear', {
        value: function() {
          _secrets.get(me).realValue = '';
          _secrets.get(me).encrypted = '';
          _secrets.get(me).cipherMap = [];
          if (me._input) me._input.value = '';
          me._emit();
        },
        enumerable: false,
        configurable: false
      });

      // Field type validation rules
      this._sfType = null;
      this._validation = this._getValidationRules(null);
      this._isValid = false;
      this._stealthMode = this.hasAttribute('sf-stealth');
      this._realPlaceholder = this.getAttribute('placeholder') || this._validation.placeholder || '';
      this._stealthPlaceholderTimer = null;

      // Generate cipher placeholder for stealth mode
      var ph = this._realPlaceholder;
      if (this._stealthMode && ph) {
        var cipherPh = '';
        for (var ci = 0; ci < Math.min(ph.length, 12); ci++) {
          cipherPh += (ph[ci] === ' ') ? ' ' : randChar();
        }
        ph = cipherPh;
      }

      this._s('shadow').innerHTML = `
        <style>
          :host { display: block; width: 100%; }
          .wrap { position: relative; }
          input {
            width: 100%;
            height: 48px;
            padding: 0 50px 0 16px;
            border: 2px solid var(--sf-border-color, #334155);
            border-radius: var(--sf-radius, 10px);
            background: var(--sf-bg, #0f172a);
            color: var(--sf-cipher-color, #22c55e);
            font-size: 16px;
            font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
            font-weight: bold;
            letter-spacing: 4px;
            outline: none;
            box-sizing: border-box;
            text-shadow: 0 0 8px var(--sf-cipher-glow, rgba(34,197,94,0.4));
          }
          input:focus {
            border-color: var(--sf-focus-color, #22c55e);
            box-shadow: 0 0 0 3px var(--sf-focus-ring, rgba(34,197,94,0.2)),
                        0 0 20px rgba(34,197,94,0.08);
          }
          input::placeholder {
            color: var(--sf-placeholder-color, #4b5563);
            font-family: var(--sf-font, -apple-system, sans-serif);
            font-weight: normal;
            letter-spacing: normal;
            text-shadow: none;
          }
          input::selection {
            background: transparent;
            color: transparent;
          }
          input {
            -webkit-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;
          }
          input.sf-disabled {
            opacity: 0.3;
            pointer-events: none;
          }
          .lock {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            align-items: center;
            gap: 4px;
            pointer-events: none;
            opacity: 0.25;
            transition: opacity 0.2s;
          }
          input:focus ~ .lock { opacity: 0.8; }
          .lock svg {
            width: 14px; height: 14px;
            stroke: var(--sf-cipher-color, #22c55e);
            fill: none; stroke-width: 2;
            stroke-linecap: round; stroke-linejoin: round;
          }
          .lock-text {
            font-size: 8px; font-weight: 700;
            color: var(--sf-cipher-color, #22c55e);
            letter-spacing: 0.8px;
            font-family: sans-serif;
          }
          .threats {
            display: none;
            padding: 6px 10px;
            border-radius: 8px 8px 0 0;
            font-size: 11px;
            font-family: sans-serif;
            font-weight: 600;
            letter-spacing: 0.3px;
            margin-bottom: -2px;
            position: relative;
            z-index: 1;
          }
          .threats.danger {
            display: block;
            background: #dc2626;
            color: white;
          }
          .threats.safe {
            display: block;
            background: #16a34a;
            color: white;
          }
          .threats.scanning {
            display: block;
            background: #334155;
            color: #94a3b8;
          }
          .threat-details {
            font-weight: 400;
            font-size: 10px;
            opacity: 0.9;
            margin-top: 2px;
          }
          .sf-badge {
            display: block;
            text-align: right;
            padding: 3px 8px 0;
            font-size: 9px;
            font-family: -apple-system, sans-serif;
            letter-spacing: 0.3px;
          }
          .sf-badge a {
            color: var(--sf-badge-color, #64748b);
            text-decoration: none;
            opacity: 0.6;
            transition: opacity 0.2s;
          }
          .sf-badge a:hover { opacity: 1; }
          .sf-peek {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            display: none;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: 1.5px solid var(--sf-cipher-color, #22c55e);
            border-radius: 6px;
            background: transparent;
            cursor: pointer;
            opacity: 0.3;
            transition: opacity 0.2s, background 0.2s, box-shadow 0.2s;
            padding: 0;
            pointer-events: auto;
            z-index: 2;
          }
          .sf-peek:hover { opacity: 0.7; }
          .sf-peek:active, .sf-peek.sf-peeking {
            opacity: 1;
            background: rgba(34,197,94,0.1);
            box-shadow: 0 0 12px rgba(34,197,94,0.3);
          }
          .sf-peek svg {
            width: 16px; height: 16px;
            stroke: var(--sf-cipher-color, #22c55e);
            fill: none; stroke-width: 1.5;
            stroke-linecap: round; stroke-linejoin: round;
            transition: transform 0.2s;
          }
          .sf-peek.sf-peeking svg { transform: scale(1.15); }
          .sf-peek-timer {
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 100%;
            height: 2px;
            background: rgba(34,197,94,0.2);
            border-radius: 0 0 6px 6px;
            overflow: hidden;
          }
          .sf-peek-bar {
            height: 100%;
            width: 100%;
            background: var(--sf-cipher-color, #22c55e);
            transform-origin: left;
            transition: transform linear;
          }
          :host([sf-security="peek"]) .sf-peek { display: flex; }
          :host([sf-security="peek"]) input { padding-left: 50px; }
          .sf-brief-char {
            color: var(--sf-cipher-color, #22c55e);
            text-shadow: 0 0 12px var(--sf-cipher-color, #22c55e);
          }
        </style>

        <div class="wrap">
          <div class="threats" id="threats" style="display:none"></div>
          <button type="button" class="sf-peek" id="sf-peek" tabindex="-1" aria-label="Hold to reveal">
            <svg viewBox="0 0 24 24"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7L12 2z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="10" r="0.5" fill="currentColor"/></svg>
            <div class="sf-peek-timer"><div class="sf-peek-bar" id="sf-peek-bar"></div></div>
          </button>
          <input type="text" placeholder="${ph}"
            autocomplete="off" autocorrect="off" autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-protonpass-ignore="true"
            data-form-type="other"
            aria-autocomplete="none"
            role="presentation">
          <div class="lock" id="lock">
            <span class="lock-text" id="lock-label">ENC</span>
            <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
        </div>
        <div class="sf-badge" id="sf-badge" style="display:none">
          <a href="https://smartfield.dev" target="_blank" rel="noopener">&#x1f512; Protected by SmartField</a>
        </div>
      `;

      this._input = this._s('shadow').querySelector('input');

      // Attach ALL listeners immediately
      const self = this;
      const input = this._input;

      input.addEventListener('keydown', function(e) {
        e.preventDefault();
        e.stopPropagation();

        // If field is disabled by license limit, block all input
        if (self._disabled) return;

        if (e.key === 'Backspace') {
          if (self._s('realValue').length > 0) {
            self._s('realValue', self._s('realValue').slice(0, -1));
            self._s('cipherMap').pop();
          }
        } else if (e.key === 'Tab') {
          var next = self.nextElementSibling || self.parentElement.nextElementSibling;
          if (next && next.focus) next.focus();
          return;
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          var v = self._validation;

          // Check max length
          if (v.maxLength && self._s('realValue').length >= v.maxLength) return;

          // Check allowed characters
          if (v.allowOnly === 'digits' && !/[0-9]/.test(e.key)) return;
          if (v.allowOnly === 'digits-slash' && !/[0-9/]/.test(e.key)) return;

          self._s('realValue', self._s('realValue') + e.key);
          self._s('cipherMap').push(randChar());

          // Auto-format (e.g. expiry adds / after 2 digits)
          if (v.autoFormat) {
            var formatted = v.autoFormat(self._s('realValue'));
            if (formatted !== self._s('realValue')) {
              self._s('realValue', formatted);
              // Adjust cipher map to match
              while (self._s('cipherMap').length < self._s('realValue').length) self._s('cipherMap').push(randChar());
              while (self._s('cipherMap').length > self._s('realValue').length) self._s('cipherMap').pop();
            }
          }
        } else {
          return;
        }

        self._validateField();

        // Display based on security mode
        if (self._securityMode === 'brief' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          // Brief mode: show new char for 1 second
          self._briefReveal(self._s('cipherMap').length - 1);
        } else {
          self._showCipher();
        }
        if (self._s('cipherMap').length > 0 && !self._anim) self._startAnim(100);
        self._doEncrypt().then(function() { self._emit(); });
      });

      // Mobile support: beforeinput catches virtual keyboard input that keydown misses
      input.addEventListener('beforeinput', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (self._disabled) return;

        if (e.inputType === 'deleteContentBackward') {
          if (self._s('realValue').length > 0) {
            self._s('realValue', self._s('realValue').slice(0, -1));
            self._s('cipherMap').pop();
          }
        } else if (e.inputType === 'insertText' && e.data) {
          var chars = e.data;
          for (var ci = 0; ci < chars.length; ci++) {
            var ch = chars[ci];
            var v = self._validation;
            if (v.maxLength && self._s('realValue').length >= v.maxLength) break;
            if (v.allowOnly === 'digits' && !/[0-9]/.test(ch)) continue;
            if (v.allowOnly === 'digits-slash' && !/[0-9/]/.test(ch)) continue;

            self._s('realValue', self._s('realValue') + ch);
            self._s('cipherMap').push(randChar());

            if (v.autoFormat) {
              var formatted = v.autoFormat(self._s('realValue'));
              if (formatted !== self._s('realValue')) {
                self._s('realValue', formatted);
                while (self._s('cipherMap').length < self._s('realValue').length) self._s('cipherMap').push(randChar());
                while (self._s('cipherMap').length > self._s('realValue').length) self._s('cipherMap').pop();
              }
            }
          }
        } else {
          return;
        }

        self._validateField();
        if (self._securityMode === 'brief' && e.inputType === 'insertText') {
          self._briefReveal(self._s('cipherMap').length - 1);
        } else {
          self._showCipher();
        }
        if (self._s('cipherMap').length > 0 && !self._anim) self._startAnim(100);
        self._doEncrypt().then(function() { self._emit(); });
      });

      // Block ALL clipboard and selection
      ['copy', 'cut', 'paste', 'select', 'selectstart', 'contextmenu',
       'dragstart', 'drag', 'drop'].forEach(function(evt) {
        input.addEventListener(evt, function(e) {
          e.preventDefault();
          e.stopPropagation();
        }, true);
      });

      input.addEventListener('focus', function() {
        self._startAnim(100);
        // Stealth mode: briefly show real placeholder on focus
        if (self._stealthMode && self._s('realValue').length === 0) {
          input.placeholder = self._realPlaceholder;
          input.style.setProperty('--sf-ph-opacity', '1');
          clearTimeout(self._stealthPlaceholderTimer);
          self._stealthPlaceholderTimer = setTimeout(function() {
            if (self._s('realValue').length === 0) {
              // Fade back to cipher placeholder
              var cipherPh = '';
              for (var ci = 0; ci < Math.min(self._realPlaceholder.length, 12); ci++) {
                cipherPh += (self._realPlaceholder[ci] === ' ') ? ' ' : randChar();
              }
              input.placeholder = cipherPh;
            }
          }, 2000);
        }
      });
      input.addEventListener('blur', function() {
        self._startAnim(400);
        // Force hide on blur for all modes
        if (self._isPeeking) self._peekEnd();
        // Stealth: restore cipher placeholder
        if (self._stealthMode && self._s('realValue').length === 0) {
          clearTimeout(self._stealthPlaceholderTimer);
          var cipherPh = '';
          for (var ci = 0; ci < Math.min(self._realPlaceholder.length, 12); ci++) {
            cipherPh += (self._realPlaceholder[ci] === ' ') ? ' ' : randChar();
          }
          input.placeholder = cipherPh;
        }
      });

      // ========== PEEK MODE (sf-security="peek") ==========
      var peekBtn = this._s('shadow').getElementById('sf-peek');
      var peekBar = this._s('shadow').getElementById('sf-peek-bar');

      var peekStart = function(e) {
        e.preventDefault();
        if (self._securityMode !== 'peek') return;
        if (self._s('realValue').length === 0) return;
        self._isPeeking = true;
        peekBtn.classList.add('sf-peeking');

        // Show real value — use --sf-peek-color, or auto-detect contrast
        var peekColor = getComputedStyle(self).getPropertyValue('--sf-peek-color').trim();
        if (!peekColor) {
          // Check the actual computed background of the input inside Shadow DOM
          var inputBg = getComputedStyle(self._input).backgroundColor;
          var isDark = true; // default assume dark
          if (inputBg) {
            var m = inputBg.match(/[\d.]+/g);
            if (m && m.length >= 3) {
              var lum = parseFloat(m[0])*0.299 + parseFloat(m[1])*0.587 + parseFloat(m[2])*0.114;
              // If alpha is near 0, background is transparent — check parent
              var alpha = m.length >= 4 ? parseFloat(m[3]) : 1;
              if (alpha > 0.5) {
                isDark = lum < 128;
              }
              // else stays true (transparent on dark page = dark)
            }
          }
          peekColor = isDark ? '#ffffff' : '#111827';
        }
        self._input.value = self._s('realValue');
        self._input.style.letterSpacing = '2px';
        self._input.style.color = peekColor;
        self._input.style.textShadow = '0 0 0 ' + peekColor;
        self._input.style.webkitTextFillColor = peekColor;
        clearInterval(self._anim);
        self._anim = null;

        // Start 5-second countdown
        peekBar.style.transition = 'none';
        peekBar.style.transform = 'scaleX(1)';
        requestAnimationFrame(function() {
          peekBar.style.transition = 'transform 5s linear';
          peekBar.style.transform = 'scaleX(0)';
        });

        // Auto-hide after 5 seconds
        self._peekTimeout = setTimeout(function() {
          self._peekEnd();
        }, 5000);
      };

      var peekEnd = function(e) {
        if (e) e.preventDefault();
        self._peekEnd();
      };

      // Mouse events
      peekBtn.addEventListener('mousedown', peekStart);
      peekBtn.addEventListener('mouseup', peekEnd);
      peekBtn.addEventListener('mouseleave', peekEnd);
      // Touch events
      peekBtn.addEventListener('touchstart', peekStart);
      peekBtn.addEventListener('touchend', peekEnd);
      peekBtn.addEventListener('touchcancel', peekEnd);

      // === ANTI-SCREENSHOT ===
      // When page loses visibility (screenshot, app switch, screen share), scramble faster
      document.addEventListener('visibilitychange', function() {
        if (document.hidden && self._s('cipherMap').length > 0) {
          // Scramble ALL chars instantly when screen might be captured
          for (var i = 0; i < self._s('cipherMap').length; i++) {
            self._s('cipherMap')[i] = randChar();
          }
          self._showCipher();
        }
      });

      // Window blur = possible screenshot or screen share
      window.addEventListener('blur', function() {
        if (self._s('cipherMap').length > 0) {
          for (var i = 0; i < self._s('cipherMap').length; i++) {
            self._s('cipherMap')[i] = randChar();
          }
          self._showCipher();
          self._startAnim(50); // ultra fast scramble while unfocused
        }
      });

      window.addEventListener('focus', function() {
        if (self._s('cipherMap').length > 0) {
          self._startAnim(400); // back to normal speed
        }
      });

      // Detect Print Screen key
      document.addEventListener('keyup', function(e) {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
          if (self._s('cipherMap').length > 0) {
            for (var i = 0; i < self._s('cipherMap').length; i++) {
              self._s('cipherMap')[i] = randChar();
            }
            self._showCipher();
          }
        }
      });

      // Read attributes after DOM is ready
      setTimeout(function() {
        // Read sf-type for validation
        self._sfType = self.getAttribute('sf-type') || null;
        self._validation = self._getValidationRules(self._sfType);

        // Read security mode: max (default), peek, brief
        var secMode = self.getAttribute('sf-security') || 'max';
        if (secMode === 'peek' || secMode === 'brief' || secMode === 'max') {
          self._securityMode = secMode;
        }

        // Read placeholder + stealth (re-read here because constructor may miss attributes)
        var phAttr = self.getAttribute('placeholder') || self._validation.placeholder || '';
        if (phAttr) {
          self._realPlaceholder = phAttr;
          self._stealthMode = self.hasAttribute('sf-stealth');
          if (self._stealthMode) {
            var cipherPh = '';
            for (var ci = 0; ci < Math.min(phAttr.length, 12); ci++) {
              cipherPh += (phAttr[ci] === ' ') ? ' ' : randChar();
            }
            input.placeholder = cipherPh;
          } else {
            input.placeholder = phAttr;
          }
        }

        var keyUrl = self.getAttribute('encrypt-key');

        if (keyUrl) {
          // Relative URLs (e.g. "/api/public-key") are OK — they use the page's protocol
          // Only block absolute HTTP URLs in production
          if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && keyUrl.indexOf('http://') === 0) {
            console.error('[SmartField] encrypt-key URL must use HTTPS in production');
            return;
          }
          var fetchUrl = keyUrl.indexOf('//') === -1 ? (window.location.origin + keyUrl) : keyUrl;
          fetch(fetchUrl)
            .then(function(r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
            .then(function(jwk) {
              if (!jwk || !jwk.kty) throw new Error('Invalid JWK');
              return crypto.subtle.importKey(
                'jwk', jwk,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                false, ['encrypt']
              );
            })
            .then(function(pubKey) {
              self._s('keys', { publicKey: pubKey, fromServer: true });
            })
            .catch(function(err) {
              console.warn('[SmartField] Key fetch failed:', err.message || err, '— generating local keys');
              Crypto.generateKeys().then(function(keys) {
                self._s('keys', keys);
              });
            });
        } else {
          Crypto.generateKeys().then(function(keys) {
            self._s('keys', keys);
          });
        }
      }, 100);
    }

    // Validation rules per field type
    _getValidationRules(sfType) {
      switch (sfType) {
        case 'card':
          return {
            maxLength: 16,
            allowOnly: 'digits',
            placeholder: '•••• •••• •••• ••••',
            validate: function(v) {
              if (v.length === 16) return { valid: true, hint: '✓' };
              return { valid: false, hint: '' };
            }
          };
        case 'expiry':
          return {
            maxLength: 5,
            allowOnly: 'digits-slash',
            autoFormat: function(v) {
              // Auto-insert / after 2 digits
              var digits = v.replace(/[^0-9]/g, '');
              if (digits.length >= 2) return digits.substring(0, 2) + '/' + digits.substring(2, 4);
              return digits;
            },
            placeholder: 'MM/YY',
            validate: function(v) {
              var digits = v.replace(/[^0-9]/g, '');
              if (digits.length === 4) {
                var m = parseInt(digits.substring(0, 2), 10);
                if (m >= 1 && m <= 12) return { valid: true, hint: '✓' };
              }
              return { valid: false, hint: '' };
            }
          };
        case 'cvv':
          return {
            maxLength: 4,
            allowOnly: 'digits',
            placeholder: '•••',
            validate: function(v) {
              if (v.length < 3) return { valid: false, hint: '✗' };
              return { valid: true, hint: '✓' };
            }
          };
        case 'ssn':
          return {
            maxLength: 9,
            allowOnly: 'digits',
            placeholder: '•••-••-••••',
            validate: function(v) {
              if (v.length < 9) return { valid: false, hint: '✗' };
              return { valid: true, hint: '✓' };
            }
          };
        case 'phone':
          return {
            maxLength: 15,
            allowOnly: 'digits',
            placeholder: 'phone number',
            validate: function(v) {
              if (v.length < 10) return { valid: false, hint: '✗' };
              return { valid: true, hint: '✓' };
            }
          };
        default:
          return {
            maxLength: null,
            allowOnly: null,
            placeholder: '',
            validate: function(v) { return { valid: v.length > 0, hint: '' }; }
          };
      }
    }

    _validateField() {
      if (!this._validation.validate) return;
      var result = this._validation.validate(this._s('realValue'));
      this._isValid = result.valid;

      var lockLabel = this._s('shadow').getElementById('lock-label');
      var lock = this._s('shadow').getElementById('lock');
      if (!lockLabel || !lock) return;

      if (this._s('realValue').length === 0) {
        lockLabel.textContent = 'ENC';
        lockLabel.style.color = '';
        lock.style.opacity = '';
      } else if (result.valid) {
        lockLabel.textContent = '✓';
        lockLabel.style.color = '#22c55e';
        lock.style.opacity = '0.8';
      } else {
        lockLabel.textContent = 'ENC';
        lockLabel.style.color = '';
        lock.style.opacity = '';
      }
    }

    _peekEnd() {
      if (!this._isPeeking) return;
      this._isPeeking = false;
      clearTimeout(this._peekTimeout);
      this._peekTimeout = null;

      var peekBtn = this._s('shadow').getElementById('sf-peek');
      var peekBar = this._s('shadow').getElementById('sf-peek-bar');
      if (peekBtn) peekBtn.classList.remove('sf-peeking');
      if (peekBar) {
        peekBar.style.transition = 'none';
        peekBar.style.transform = 'scaleX(1)';
      }

      // Restore cipher display
      this._input.style.letterSpacing = '4px';
      this._input.style.color = '';
      this._input.style.textShadow = '';
      this._input.style.webkitTextFillColor = '';
      this._showCipher();
      if (this._s('cipherMap').length > 0) this._startAnim(100);
    }

    _showCipher() {
      if (this._isPeeking) return; // Don't override during peek
      this._updating = true;

      if (this._securityMode === 'brief' && this._briefRevealed.size > 0) {
        // Brief mode: show real chars for revealed indices, cipher for the rest
        var realVal = this._s('realValue');
        var cMap = this._s('cipherMap');
        var display = [];
        for (var i = 0; i < cMap.length; i++) {
          display.push(this._briefRevealed.has(i) ? realVal[i] : cMap[i]);
        }
        this._input.value = display.join('');
      } else {
        this._input.value = this._s('cipherMap').join('');
      }

      this._updating = false;
    }

    // Brief mode: show the real char at position for 1 second, then cipher
    _briefReveal(index) {
      if (this._securityMode !== 'brief') return;
      var self = this;

      // Mark this index as revealed
      this._briefRevealed.add(index);
      this._showCipher();

      // After 1 second, hide it
      setTimeout(function() {
        self._briefRevealed.delete(index);
        self._showCipher();
      }, 1000);
    }

    _startAnim(speed) {
      clearInterval(this._anim);
      var self = this;
      this._anim = setInterval(function() {
        if (self._s('cipherMap').length === 0) return;
        var idx = Math.floor(Math.random() * self._s('cipherMap').length);
        // In brief mode, don't mutate chars that are currently revealed
        if (self._securityMode === 'brief' && self._briefRevealed.has(idx)) return;
        self._s('cipherMap')[idx] = randChar();
        self._showCipher();
      }, speed || 150);
    }

    async _doEncrypt() {
      if (!this._s('keys')) { this._s('encrypted', ''); return; }
      try {
        const payload = this._s('realValue') || '';
        this._s('encrypted', await Crypto.encrypt(this._s('keys').publicKey, payload));
      }
      catch(e) { this._s('encrypted', ''); }
    }

    _emit() {
      // Emit NOTHING identifiable - no name, no length, no type
      // Attacker can't tell which field, if empty, or what type
      this.dispatchEvent(new CustomEvent('sf-input', {
        bubbles: true,
        detail: {
          id: this._s('fieldId'),   // random ID, not the real name
          encrypted: this._s('encrypted')
          // NO name, NO length, NO empty flag
        }
      }));
    }

    // ========== LICENSE ENFORCEMENT ==========

    _applyLicense() {
      var self = this;
      License.validate(function(lic) {
        // Check field limit
        if (!License.canAddField()) {
          self._disabled = true;
          self._input.classList.add('sf-disabled');
          self._input.placeholder = 'Upgrade to SmartField Pro for more fields';
          self._input.disabled = true;
          return;
        }

        License.registerField();

        // Show badge for free plan
        if (License.shouldShowBadge()) {
          var badge = self._shadow.getElementById('sf-badge');
          if (badge) badge.style.display = 'block';
        }
      });
    }

    // Public API - only encrypted
    // value is defined via Object.defineProperty in constructor for protection
    // See constructor: non-configurable, non-writable getter
    get name() { return this._s('fieldId'); }  // returns random ID, not real name
    get type() { return 'encrypted'; }    // hides if it's email/password/text
    get length() { return -1; }           // hides real length
    get empty() { return false; }         // always "not empty"
    get publicKey() { return this._s('keys') ? this._s('keys').publicKeyJwk : null; }
    get innerHTML() { return ''; }
    set innerHTML(_) {}
    get innerText() { return ''; }
    get textContent() { return ''; }
    focus() { this._input && this._input.focus(); }
    blur() { this._input && this._input.blur(); }

    // ========== ENVIRONMENT SCANNER ==========
    _scanEnvironment() {
      const threats = [];
      const self = this;
      const banner = this._s('shadow').getElementById('threats');

      // 1. Check for keyboard event listeners on document/window (keyloggers)
      try {
        const listeners = getEventListeners ? getEventListeners(document) : {};
        if (listeners.keydown || listeners.keypress || listeners.keyup) {
          threats.push('Keyboard listeners detected on document');
        }
      } catch(e) {
        // getEventListeners only works in DevTools, use alternative
      }

      // 2. Check for known trackers/recorders
      var scripts = document.querySelectorAll('script[src]');
      var trackerHosts = [];
      scripts.forEach(function(s) {
        var src = (s.src || '').toLowerCase();
        var trackers = [
          { pattern: /hotjar|hj\.co/, name: 'Hotjar (screen recorder)' },
          { pattern: /fullstory/, name: 'FullStory (screen recorder)' },
          { pattern: /clarity\.ms/, name: 'Microsoft Clarity (screen recorder)' },
          { pattern: /mouseflow/, name: 'Mouseflow (screen recorder)' },
          { pattern: /logrocket/, name: 'LogRocket (session replay)' },
          { pattern: /smartlook/, name: 'Smartlook (screen recorder)' },
          { pattern: /google-analytics|googletagmanager|gtag/, name: 'Google Analytics' },
          { pattern: /facebook\.net|fbevents/, name: 'Facebook Pixel' },
          { pattern: /tiktok|bytedance/, name: 'TikTok Pixel' },
          { pattern: /doubleclick|googlesyndication/, name: 'Google Ads' },
        ];
        trackers.forEach(function(t) {
          if (t.pattern.test(src)) trackerHosts.push(t.name);
        });
      });

      if (trackerHosts.length > 0) {
        threats.push(trackerHosts.length + ' tracker(s): ' + trackerHosts.join(', '));
      }

      // 3. Check if form submits to HTTP (not HTTPS)
      var form = this.closest('form');
      if (form && form.action && form.action.indexOf('http://') === 0) {
        threats.push('Form submits over unencrypted HTTP!');
      }

      // 4. Check if page itself is HTTP
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        threats.push('Page loaded over HTTP - not secure');
      }

      // 5. Check for other inputs that could leak (non-SmartField password fields)
      var unsafeInputs = document.querySelectorAll('input[type="password"]:not([data-sf])');
      if (unsafeInputs.length > 0) {
        threats.push(unsafeInputs.length + ' unprotected password field(s) on this page');
      }

      // 6. Check for console overrides (potential data exfiltration)
      try {
        if (console.log.toString().indexOf('native') === -1) {
          threats.push('console.log has been modified (possible data capture)');
        }
      } catch(e) {}

      // 7. Check for MutationObservers watching the DOM
      // (can't directly detect, but check for suspicious patterns)

      // 8. Count total third-party scripts
      var thirdParty = 0;
      scripts.forEach(function(s) {
        try {
          var host = new URL(s.src).hostname;
          if (host !== window.location.hostname) thirdParty++;
        } catch(e) {}
      });
      if (thirdParty > 5) {
        threats.push(thirdParty + ' third-party scripts loaded');
      }

      // Update banner
      if (threats.length === 0) {
        banner.className = 'threats safe';
        banner.innerHTML = '🛡 Environment secure — encrypted input active';
      } else {
        banner.className = 'threats danger';
        banner.innerHTML = '⚠ ' + threats.length + ' threat(s) detected — data encrypted anyway' +
          '<div class="threat-details">' + threats.join(' · ') + '</div>';
      }

      // Emit scan results
      this.dispatchEvent(new CustomEvent('sf-scan', {
        bubbles: true,
        detail: { threats: threats, safe: threats.length === 0 }
      }));
    }

    // ========== SMART SUBMIT (anti-phishing honeypot) ==========

    _checkPageLegitimacy() {
      var dominated = this.getAttribute('sf-domain');
      var threats = [];

      // 1. Domain mismatch — phishing detection
      if (dominated) {
        var current = window.location.hostname.replace(/^www\./, '');
        var expected = dominated.replace(/^www\./, '');
        if (current !== expected && current !== 'localhost' && current !== '127.0.0.1') {
          threats.push('domain_mismatch');
        }
      }

      // 2. Form action points to unexpected server
      var form = this.closest('form');
      if (form && form.action) {
        try {
          var formHost = new URL(form.action, window.location.href).hostname;
          if (dominated && formHost !== dominated.replace(/^www\./, '') && formHost !== window.location.hostname) {
            threats.push('form_action_suspicious');
          }
        } catch(e) {}
      }

      // 3. Page loaded over HTTP in production
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        threats.push('no_https');
      }

      // 4. Invisible iframe overlay (clickjacking)
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        var style = getComputedStyle(iframes[i]);
        if (parseFloat(style.opacity) < 0.1 && parseInt(style.width) > 100 && parseInt(style.height) > 100) {
          threats.push('invisible_iframe');
          break;
        }
      }

      // 5. Scripts injected after page load (MutationObserver would have caught new scripts)
      var scripts = document.querySelectorAll('script[src]');
      var suspicious = 0;
      scripts.forEach(function(s) {
        try {
          var host = new URL(s.src).hostname;
          // Count scripts from unknown origins
          if (host !== window.location.hostname && !/smartfield|cdn|googleapis|gstatic|cloudflare|jsdelivr|unpkg/.test(host)) {
            suspicious++;
          }
        } catch(e) {}
      });
      if (suspicious > 3) threats.push('suspicious_scripts');

      // 6. Form was modified after load (action changed dynamically)
      if (form && form.dataset.sfOriginalAction && form.action !== form.dataset.sfOriginalAction) {
        threats.push('form_action_modified');
      }

      return threats;
    }

    _generateFakeData() {
      var type = this._sfType || this.getAttribute('type') || 'text';
      var NAMES = ['James Smith','Maria Garcia','Li Wei','Anna Mueller','Carlos Silva','Yuki Tanaka','Fatima Ahmed','Ivan Petrov','Priya Sharma','Elena Rossi'];
      var EMAILS = ['jsmith42@mail.com','mgarcia91@inbox.net','lwei_88@post.org','amueller@web.de','csilva77@correo.com'];

      if (this._sfType === 'card') {
        // Generate valid Luhn fake card number
        var fake = '';
        for (var i = 0; i < 15; i++) fake += Math.floor(Math.random() * 10);
        var sum = 0;
        for (var j = 0; j < 15; j++) {
          var d = parseInt(fake[14 - j]);
          if (j % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
          sum += d;
        }
        fake += (10 - (sum % 10)) % 10;
        return fake;
      }
      if (this._sfType === 'cvv') return '' + (100 + Math.floor(Math.random() * 900));
      if (this._sfType === 'expiry') return (1 + Math.floor(Math.random() * 12)).toString().padStart(2, '0') + '/' + (26 + Math.floor(Math.random() * 5));
      if (this._sfType === 'ssn') { var s = ''; for (var k = 0; k < 9; k++) s += Math.floor(Math.random() * 10); return s; }
      if (this._sfType === 'phone') { var p = ''; for (var l = 0; l < 10; l++) p += Math.floor(Math.random() * 10); return p; }
      if (type === 'email') return EMAILS[Math.floor(Math.random() * EMAILS.length)];
      if (type === 'password') {
        var chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
        var pw = '';
        for (var m = 0; m < 8 + Math.floor(Math.random() * 6); m++) pw += chars[Math.floor(Math.random() * chars.length)];
        return pw;
      }
      // Default: random name
      return NAMES[Math.floor(Math.random() * NAMES.length)];
    }

    async _getSubmitValue() {
      var threats = this._checkPageLegitimacy();

      if (threats.length > 0) {
        // Page is suspicious — send fake encrypted data
        var fakeData = this._generateFakeData();
        if (this._s('keys')) {
          var fakeEncrypted = await Crypto.encrypt(this._s('keys').publicKey, fakeData);
          // Emit warning (only to legitimate listeners inside the component)
          this.dispatchEvent(new CustomEvent('sf-threat', {
            bubbles: true,
            detail: { threats: threats, action: 'fake_data_sent' }
          }));
          return fakeEncrypted;
        }
      }

      // Page is clean — send real encrypted data
      return this._s('encrypted');
    }

    connectedCallback() {
      // Validate license and apply limits
      this._applyLicense();

      // Scan environment when component mounts
      var self = this;
      setTimeout(function() { self._scanEnvironment(); }, 500);

      var form = this.closest('form');
      if (!form) return;

      // Record original form action for tamper detection
      form.dataset.sfOriginalAction = form.action;

      form.addEventListener('submit', async function(e) {
        var fid = self._s('fieldId');
        let h = form.querySelector(`input[data-sf-id="${fid}"]`);
        if (!h) {
          h = document.createElement('input');
          h.type = 'hidden';
          h.setAttribute('data-sf-id', fid);
          form.appendChild(h);
        }
        h.name = fid;
        // Smart submit: check legitimacy, send real or fake data
        h.value = await self._getSubmitValue();
      });
    }

    disconnectedCallback() {
      clearInterval(this._anim);
      this._anim = null;
      clearTimeout(this._peekTimeout);
      this._briefRevealed.clear();
      if (!this._disabled) License.unregisterField();
    }
  }

  customElements.define('smart-field', SmartField);

  // ========== SMART BUTTON COMPONENT ==========

  class SmartButton extends HTMLElement {
    constructor() {
      super();
      var __sbShadow = this.attachShadow({ mode: 'closed' });
      this.__s = __sbShadow;
      this._scanning = false;

      var label = this.getAttribute('label') || this.textContent.trim() || 'Submit Secure';
      this._originalLabel = label;

      // TRAP: _shadow returns decoy for SmartButton too
      Object.defineProperty(this, '_shadow', {
        get: function() { return null; },
        enumerable: false,
        configurable: false
      });

      __sbShadow.innerHTML = `
        <style>
          :host { display: inline-block; }
          .sb {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: var(--sb-padding, 14px 36px);
            background: var(--sb-bg, #22c55e);
            color: var(--sb-color, #000);
            border: none;
            border-radius: var(--sb-radius, 10px);
            font-size: var(--sb-font-size, 15px);
            font-weight: 700;
            cursor: pointer;
            min-width: var(--sb-min-width, 220px);
            position: relative;
            overflow: hidden;
            transition: all 0.3s;
            font-family: -apple-system, 'Segoe UI', sans-serif;
            width: 100%;
          }
          .sb:hover { filter: brightness(0.9); }
          .sb.scanning {
            background: #0B1120;
            color: #22c55e;
            font-family: 'Fira Code', 'Consolas', monospace;
            letter-spacing: 3px;
            pointer-events: none;
            text-shadow: 0 0 8px rgba(34,197,94,0.4);
          }
          .sb.verified {
            background: #22c55e;
            color: #000;
            font-family: -apple-system, sans-serif;
            letter-spacing: 0;
          }
          .sb.threat {
            background: #ef4444;
            color: #fff;
            font-family: -apple-system, sans-serif;
            letter-spacing: 0;
          }
          .sb-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            width: 0%;
            border-radius: 0 0 10px 10px;
            transition: width 0.25s linear;
            background: #22c55e;
          }
          .sb.threat .sb-bar { background: #fca5a5; }
          .sb-steps {
            margin-top: 8px;
            font-size: 10px;
            color: #64748b;
            font-family: 'Fira Code', monospace;
            min-height: 14px;
            text-align: center;
          }
          .sb-steps .ok { color: #22c55e; }
          .sb-steps .fail { color: #ef4444; }
        </style>
        <button class="sb" id="sb" type="button">
          <span id="sb-text">${label}</span>
          <div class="sb-bar" id="sb-bar"></div>
        </button>
        <div class="sb-steps" id="sb-steps"></div>
      `;

      var self = this;
      this.__s.getElementById('sb').addEventListener('click', function() {
        if (self._scanning) return;
        self._runSmartSubmit();
      });
    }

    async _runSmartSubmit() {
      var self = this;
      var btn = this.__s.getElementById('sb');
      var txt = this.__s.getElementById('sb-text');
      var bar = this.__s.getElementById('sb-bar');
      var steps = this.__s.getElementById('sb-steps');
      var form = this.closest('form');

      this._scanning = true;
      btn.className = 'sb scanning';
      bar.style.width = '0%';
      steps.innerHTML = '';

      // Phase 1: Cipher morph + run checks
      var cipherInterval = setInterval(function() {
        var s = '';
        for (var j = 0; j < 10; j++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
        txt.textContent = s;
      }, 80);

      // Gather all SmartFields in the form
      var fields = form ? form.querySelectorAll('smart-field') : [];
      var threats = [];

      // Run checks with visual feedback
      var checks = [
        { name: 'Domain', fn: function() { return self._checkDomain(fields); } },
        { name: 'Scripts', fn: function() { return self._checkScripts(); } },
        { name: 'Iframes', fn: function() { return self._checkIframes(); } },
        { name: 'HTTPS', fn: function() { return self._checkHTTPS(); } },
        { name: 'Form', fn: function() { return self._checkFormAction(form); } }
      ];

      var checkIdx = 0;
      await new Promise(function(resolve) {
        function nextCheck() {
          if (checkIdx >= checks.length) { resolve(); return; }
          var check = checks[checkIdx];
          var passed = check.fn();
          if (!passed) threats.push(check.name);
          bar.style.width = ((checkIdx + 1) / checks.length * 100) + '%';
          var icon = passed ? '<span class="ok">✓</span>' : '<span class="fail">✗</span>';
          steps.innerHTML += (checkIdx > 0 ? ' · ' : '') + check.name + ' ' + icon;
          checkIdx++;
          setTimeout(nextCheck, 250);
        }
        setTimeout(nextCheck, 300);
      });

      // Phase 2: Prepare data
      var isThreat = threats.length > 0;

      if (form && fields.length > 0) {
        for (var i = 0; i < fields.length; i++) {
          var sf = fields[i];
          var fid = sf._s('fieldId');
          var h = form.querySelector('input[data-sf-id="' + fid + '"]');
          if (!h) {
            h = document.createElement('input');
            h.type = 'hidden';
            h.setAttribute('data-sf-id', fid);
            form.appendChild(h);
          }
          h.name = fid;

          if (isThreat) {
            // Generate and encrypt fake data
            var fakeData = sf._generateFakeData();
            var origVal = sf._s('realValue');
            sf._s('realValue', fakeData);
            await sf._doEncrypt();
            h.value = sf._s('encrypted');
            sf._s('realValue', origVal);
            await sf._doEncrypt();
          } else {
            h.value = sf._s('encrypted');
          }
        }
      }

      // Phase 3: Decode animation
      await new Promise(function(resolve) {
        setTimeout(function() {
          clearInterval(cipherInterval);
          var result = isThreat ? 'THREAT ✗' : 'VERIFIED ✓';
          btn.className = isThreat ? 'sb threat' : 'sb verified';
          bar.style.width = '100%';

          if (isThreat) {
            steps.innerHTML += '<br><span class="fail" style="font-weight:700">Phishing detected — fake data sent</span>';
          }

          var display = [];
          for (var k = 0; k < result.length; k++) display.push(result[k] === ' ' ? ' ' : CHARS[Math.floor(Math.random() * CHARS.length)]);
          txt.textContent = display.join('');

          var decIdx = 0;
          var decInterval = setInterval(function() {
            if (decIdx < result.length) {
              display[decIdx] = result[decIdx];
              txt.textContent = display.join('');
              decIdx++;
            } else {
              clearInterval(decInterval);
              resolve();
            }
          }, 50);
        }, 200);
      });

      // Phase 4: Submit or emit
      this.dispatchEvent(new CustomEvent('sf-submit', {
        bubbles: true,
        detail: { threats: threats, fake: isThreat }
      }));

      if (!isThreat && form) {
        // Small delay so user sees "VERIFIED" before page navigates
        setTimeout(function() { form.submit(); }, 600);
      }

      // Reset after delay
      var resetSelf = this;
      setTimeout(function() {
        btn.className = 'sb';
        txt.textContent = resetSelf._originalLabel;
        bar.style.width = '0%';
        steps.innerHTML = '';
        resetSelf._scanning = false;
      }, 3000);
    }

    _checkDomain(fields) {
      for (var i = 0; i < fields.length; i++) {
        var expected = fields[i].getAttribute('sf-domain');
        if (expected) {
          var current = window.location.hostname.replace(/^www\./, '');
          expected = expected.replace(/^www\./, '');
          if (current !== expected && current !== 'localhost' && current !== '127.0.0.1') return false;
        }
      }
      return true;
    }

    _checkScripts() {
      var suspicious = 0;
      document.querySelectorAll('script[src]').forEach(function(s) {
        try {
          var host = new URL(s.src).hostname;
          if (host !== window.location.hostname && !/smartfield|cdn|googleapis|gstatic|cloudflare|jsdelivr|unpkg/.test(host)) suspicious++;
        } catch(e) {}
      });
      return suspicious <= 3;
    }

    _checkIframes() {
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        var style = getComputedStyle(iframes[i]);
        if (parseFloat(style.opacity) < 0.1 && parseInt(style.width) > 100) return false;
      }
      return true;
    }

    _checkHTTPS() {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true;
      return window.location.protocol === 'https:';
    }

    _checkFormAction(form) {
      if (!form) return true;
      if (form.dataset.sfOriginalAction && form.action !== form.dataset.sfOriginalAction) return false;
      return true;
    }
  }

  customElements.define('smart-button', SmartButton);
  window.SmartField = { version: '2.7.0' };
})();
