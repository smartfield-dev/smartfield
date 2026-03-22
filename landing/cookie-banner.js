/**
 * SmartField Cookie Consent Banner
 * GDPR/ePrivacy compliant
 *
 * Usage: <script src="/landing/cookie-banner.js"></script>
 * That's it. Banner shows automatically if consent not given.
 *
 * API:
 *   CookieConsent.hasConsent('analytics')  → true/false
 *   CookieConsent.hasConsent('marketing')  → true/false
 *   CookieConsent.reset()                  → clear consent, show banner again
 */
(function() {
  'use strict';

  var COOKIE_NAME = 'sf_cookie_consent';
  var COOKIE_DAYS = 365;

  var CookieConsent = {
    _prefs: null,

    init: function() {
      this._prefs = this._load();
      if (!this._prefs) {
        this._showBanner();
      }
    },

    hasConsent: function(category) {
      if (!this._prefs) return false;
      if (category === 'necessary') return true;
      return this._prefs[category] === true;
    },

    reset: function() {
      document.cookie = COOKIE_NAME + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      this._prefs = null;
      this._showBanner();
    },

    _save: function(prefs) {
      this._prefs = prefs;
      var expires = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = COOKIE_NAME + '=' + JSON.stringify(prefs) + '; expires=' + expires + '; path=/; SameSite=Lax';
    },

    _load: function() {
      var match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
      if (!match) return null;
      try { return JSON.parse(decodeURIComponent(match[1])); } catch(e) { return null; }
    },

    _acceptAll: function() {
      this._save({ necessary: true, analytics: true, marketing: true, timestamp: new Date().toISOString() });
      this._removeBanner();
    },

    _rejectOptional: function() {
      this._save({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() });
      this._removeBanner();
    },

    _saveSettings: function() {
      var a = document.getElementById('sf-ck-analytics');
      var m = document.getElementById('sf-ck-marketing');
      this._save({
        necessary: true,
        analytics: a ? a.checked : false,
        marketing: m ? m.checked : false,
        timestamp: new Date().toISOString()
      });
      this._removeBanner();
    },

    _toggleSettings: function() {
      var panel = document.getElementById('sf-ck-settings');
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },

    _removeBanner: function() {
      var el = document.getElementById('sf-cookie-banner');
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        setTimeout(function() { el.remove(); }, 300);
      }
    },

    _showBanner: function() {
      var self = this;

      var banner = document.createElement('div');
      banner.id = 'sf-cookie-banner';
      banner.innerHTML = ''
        + '<style>'
        + '#sf-cookie-banner{'
        + '  position:fixed;bottom:20px;left:20px;right:20px;max-width:480px;z-index:10000;'
        + '  background:#111827;border:1px solid #1e293b;border-radius:16px;padding:24px;'
        + '  font-family:-apple-system,"Segoe UI",sans-serif;color:#e2e8f0;'
        + '  box-shadow:0 20px 60px rgba(0,0,0,0.5);'
        + '  transition:opacity 0.3s,transform 0.3s;'
        + '}'
        + '#sf-cookie-banner h3{font-size:16px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px}'
        + '#sf-cookie-banner p{font-size:13px;color:#94a3b8;line-height:1.5;margin-bottom:16px}'
        + '#sf-cookie-banner a{color:#22c55e;text-decoration:underline}'
        + '.sf-ck-btns{display:flex;gap:8px;flex-wrap:wrap}'
        + '.sf-ck-btn{padding:10px 18px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}'
        + '.sf-ck-accept{background:#22c55e;color:#000}.sf-ck-accept:hover{background:#16a34a}'
        + '.sf-ck-reject{background:#1e293b;color:#94a3b8;border:1px solid #334155}.sf-ck-reject:hover{background:#334155;color:#e2e8f0}'
        + '.sf-ck-settings-btn{background:none;color:#64748b;font-size:12px;padding:8px 0;border:none;cursor:pointer;text-decoration:underline}'
        + '.sf-ck-settings-btn:hover{color:#e2e8f0}'
        + '#sf-ck-settings{display:none;margin-top:16px;padding-top:16px;border-top:1px solid #1e293b}'
        + '.sf-ck-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1e293b}'
        + '.sf-ck-row:last-child{border-bottom:none}'
        + '.sf-ck-label{font-size:13px;font-weight:600}'
        + '.sf-ck-desc{font-size:11px;color:#64748b;margin-top:2px}'
        + '.sf-ck-toggle{position:relative;width:40px;height:22px;flex-shrink:0}'
        + '.sf-ck-toggle input{opacity:0;width:0;height:0}'
        + '.sf-ck-slider{position:absolute;top:0;left:0;right:0;bottom:0;background:#334155;border-radius:11px;cursor:pointer;transition:0.2s}'
        + '.sf-ck-slider:before{content:"";position:absolute;width:16px;height:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:0.2s}'
        + '.sf-ck-toggle input:checked+.sf-ck-slider{background:#22c55e}'
        + '.sf-ck-toggle input:checked+.sf-ck-slider:before{transform:translateX(18px)}'
        + '.sf-ck-toggle input:disabled+.sf-ck-slider{opacity:0.5;cursor:default}'
        + '.sf-ck-save{margin-top:12px;width:100%;padding:10px;background:#22c55e;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}'
        + '.sf-ck-save:hover{background:#16a34a}'
        + '</style>'
        + '<h3>'
        + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7L12 2z"/></svg>'
        + 'Cookie Preferences</h3>'
        + '<p>We use cookies to keep you logged in and improve your experience. We <strong>never</strong> track your keystrokes or personal data. '
        + '<a href="/landing/privacy.html">Privacy Policy</a></p>'
        + '<div class="sf-ck-btns">'
        + '  <button class="sf-ck-btn sf-ck-accept" id="sf-ck-accept">Accept All</button>'
        + '  <button class="sf-ck-btn sf-ck-reject" id="sf-ck-reject">Necessary Only</button>'
        + '</div>'
        + '<button class="sf-ck-settings-btn" id="sf-ck-toggle-settings">Cookie Settings</button>'
        + '<div id="sf-ck-settings">'
        + '  <div class="sf-ck-row">'
        + '    <div><div class="sf-ck-label">Necessary</div><div class="sf-ck-desc">Authentication, security, basic functionality</div></div>'
        + '    <label class="sf-ck-toggle"><input type="checkbox" checked disabled><span class="sf-ck-slider"></span></label>'
        + '  </div>'
        + '  <div class="sf-ck-row">'
        + '    <div><div class="sf-ck-label">Analytics</div><div class="sf-ck-desc">Usage statistics to improve the product</div></div>'
        + '    <label class="sf-ck-toggle"><input type="checkbox" id="sf-ck-analytics"><span class="sf-ck-slider"></span></label>'
        + '  </div>'
        + '  <div class="sf-ck-row">'
        + '    <div><div class="sf-ck-label">Marketing</div><div class="sf-ck-desc">Personalized content and ads</div></div>'
        + '    <label class="sf-ck-toggle"><input type="checkbox" id="sf-ck-marketing"><span class="sf-ck-slider"></span></label>'
        + '  </div>'
        + '  <button class="sf-ck-save" id="sf-ck-save">Save Preferences</button>'
        + '</div>';

      document.body.appendChild(banner);

      // Events
      document.getElementById('sf-ck-accept').addEventListener('click', function() { self._acceptAll(); });
      document.getElementById('sf-ck-reject').addEventListener('click', function() { self._rejectOptional(); });
      document.getElementById('sf-ck-toggle-settings').addEventListener('click', function() { self._toggleSettings(); });
      document.getElementById('sf-ck-save').addEventListener('click', function() { self._saveSettings(); });
    }
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { CookieConsent.init(); });
  } else {
    CookieConsent.init();
  }

  // Expose globally
  window.CookieConsent = CookieConsent;
})();
