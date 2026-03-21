/**
 * SmartField v0.1 - Secure encrypted input
 */
(function () {
  'use strict';

  const CHARS = 'ΣΩΔΨξλμπφψ§∞∑∏∂∇≈≡∫αβγδ';
  const randChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

  // Crypto
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
    async decrypt(privateKey, payload) {
      const p = JSON.parse(atob(payload));
      const ub = s => { const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
      const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ub(p.key));
      const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub(p.iv) }, aesKey, ub(p.data)));
    }
  };

  // Store sensitive data OUTSIDE the element — invisible to JSON.stringify and property enumeration
  const _secrets = new WeakMap();

  class SmartField extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'closed' });

      // Sensitive data in WeakMap — NOT on the object
      _secrets.set(this, {
        realValue: '',
        encrypted: '',
        keys: null,
        cipherMap: [],
        fieldId: 'sf_' + crypto.getRandomValues(new Uint8Array(8)).reduce((s,b) => s + b.toString(16).padStart(2,'0'), '')
      });

      this._anim = null;

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

      // Field type validation rules
      this._sfType = null;
      this._validation = this._getValidationRules(null);
      this._isValid = false;

      const ph = this.getAttribute('placeholder') || this._validation.placeholder || '';

      this._shadow.innerHTML = `
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
        </style>

        <div class="wrap">
          <div class="threats" id="threats" style="display:none"></div>
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
      `;

      this._input = this._shadow.querySelector('input');
      console.log('[SmartField] input element:', this._input ? 'found' : 'NOT FOUND');

      // Attach ALL listeners immediately
      const self = this;
      const input = this._input;

      input.addEventListener('keydown', function(e) {
        e.preventDefault();
        e.stopPropagation();

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

        self._showCipher();
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

      input.addEventListener('focus', function() { self._startAnim(100); });
      input.addEventListener('blur', function() { self._startAnim(400); });

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
        console.log('[SmartField] sf-type:', self._sfType, 'maxLength:', self._validation.maxLength);

        var keyUrl = self.getAttribute('encrypt-key');

        if (keyUrl) {
          console.log('[SmartField] Fetching server key...');
          fetch(keyUrl)
            .then(function(r) {
              console.log('[SmartField] Key response status:', r.status);
              return r.json();
            })
            .then(function(jwk) {
              console.log('[SmartField] Got JWK, importing...');
              return crypto.subtle.importKey(
                'jwk', jwk,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                false, ['encrypt']
              );
            })
            .then(function(pubKey) {
              self._s('keys', { publicKey: pubKey, fromServer: true });
              console.log('[SmartField] SERVER key loaded OK');
            })
            .catch(function(e) {
              console.error('[SmartField] Server key FAILED:', e);
              Crypto.generateKeys().then(function(keys) {
                self._s('keys', keys);
                console.log('[SmartField] Fallback: local keys');
              });
            });
        } else {
          Crypto.generateKeys().then(function(keys) {
            self._s('keys', keys);
            console.log('[SmartField] Local keys (no encrypt-key attr)');
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

      var lockLabel = this._shadow.getElementById('lock-label');
      var lock = this._shadow.getElementById('lock');
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

    _showCipher() {
      this._updating = true;
      this._input.value = this._s('cipherMap').join('');
      this._updating = false;
    }

    _startAnim(speed) {
      clearInterval(this._anim);
      var self = this;
      this._anim = setInterval(function() {
        if (self._s('cipherMap').length === 0) return;
        var idx = Math.floor(Math.random() * self._s('cipherMap').length);
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
      const banner = this._shadow.getElementById('threats');

      // 1. Check for keyboard event listeners on document/window (keyloggers)
      try {
        const listeners = getEventListeners ? getEventListeners(document) : {};
        if (listeners.keydown || listeners.keypress || listeners.keyup) {
          threats.push('Keyboard listeners detected on document');
        }
      } catch(e) {
        // getEventListeners only works in DevTools, use alternative
        // Check if there are suspicious global handlers
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

    connectedCallback() {
      // Scan environment when component mounts
      var self = this;
      setTimeout(function() { self._scanEnvironment(); }, 500);

      var form = this.closest('form');
      if (!form) return;
      form.addEventListener('submit', function() {
        // Use random ID as field name - server maps it back with the field registry
        var fid = self._s('fieldId');
        let h = form.querySelector(`input[data-sf-id="${fid}"]`);
        if (!h) {
          h = document.createElement('input');
          h.type = 'hidden';
          h.setAttribute('data-sf-id', fid);
          form.appendChild(h);
        }
        h.name = fid;
        h.value = self._s('encrypted');
      });
    }

    disconnectedCallback() { clearInterval(this._anim); this._anim = null; }
  }

  customElements.define('smart-field', SmartField);
  window.SmartField = { version: '0.1.0' };
})();
