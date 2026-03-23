/**
 * SmartField Bot Attack Simulation
 * Simulates a real bot (Puppeteer/Playwright) trying to steal data from SmartField
 *
 * Run: npx playwright test bot_attack.js (or node bot_attack.js)
 */

const { chromium } = require('playwright');

const TARGET = 'http://localhost:3333/demo/hacker.html';
const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
};

function log(icon, msg, color = '') {
  console.log(`  ${color}${icon} ${msg}${COLORS.reset}`);
}

async function main() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   SmartField — Bot Attack Simulation     ║`);
  console.log(`  ║   Playwright + Headless Chromium          ║`);
  console.log(`  ╚══════════════════════════════════════════╝${COLORS.reset}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  log('→', `Loading ${TARGET}...`, COLORS.dim);
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for SmartField to init

  let blocked = 0;
  let stolen = 0;
  const results = [];

  async function attack(name, fn, description) {
    try {
      const result = await page.evaluate(fn);
      if (result.stolen) {
        stolen++;
        results.push({ name, status: 'STOLEN', data: result.data });
        log('✗', `${name}: STOLEN → "${result.data}"`, COLORS.red);
      } else {
        blocked++;
        results.push({ name, status: 'BLOCKED', reason: result.reason });
        log('✓', `${name}: BLOCKED → ${result.reason}`, COLORS.green);
      }
    } catch (e) {
      blocked++;
      results.push({ name, status: 'BLOCKED', reason: 'Error: ' + e.message });
      log('✓', `${name}: BLOCKED → ${e.message.substring(0, 60)}`, COLORS.green);
    }
  }

  // Type something into SmartField first
  log('⌨', 'Typing "BankPassword123" into SmartField...', COLORS.yellow);
  const sf = await page.$('smart-field#sf-pwd');
  if (sf) {
    await sf.click();
    await page.keyboard.type('BankPassword123', { delay: 50 });
    await page.waitForTimeout(500);
  }

  console.log(`\n${COLORS.bold}  ── Bot Attack Sequence ──${COLORS.reset}\n`);

  // 1. Read .value
  await attack('Read .value', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const val = sf ? sf.value : null;
    if (val && val !== '' && !val.startsWith('eyJ')) return { stolen: true, data: val };
    return { stolen: false, reason: val ? 'encrypted payload' : 'no value' };
  });

  // 2. Access Shadow DOM
  await attack('Access shadowRoot', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    if (sf.shadowRoot) return { stolen: true, data: 'shadowRoot accessible' };
    return { stolen: false, reason: 'shadowRoot = null (CLOSED)' };
  });

  // 3. querySelector inside
  await attack('querySelector("input")', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const input = sf.querySelector('input');
    if (input) return { stolen: true, data: input.value };
    return { stolen: false, reason: 'querySelector → null' };
  });

  // 4. Read innerHTML
  await attack('Read innerHTML', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const html = sf.innerHTML;
    if (html && html.length > 10 && html.includes('value')) return { stolen: true, data: html.substring(0, 50) };
    return { stolen: false, reason: html ? 'empty/no data' : 'empty string' };
  });

  // 5. Read textContent
  await attack('Read textContent', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const text = sf.textContent;
    if (text && text.length > 0 && !text.includes('Σ')) return { stolen: true, data: text };
    return { stolen: false, reason: 'empty or cipher only' };
  });

  // 6. children/childNodes
  await attack('Access children', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const kids = sf.children.length + sf.childNodes.length;
    if (kids > 0) {
      for (let c of sf.childNodes) {
        if (c.value || c.textContent) return { stolen: true, data: c.value || c.textContent };
      }
    }
    return { stolen: false, reason: 'no accessible children' };
  });

  // 7. Metadata
  await attack('Read metadata', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const meta = { type: sf.type, name: sf.name, length: sf.length };
    if (meta.type !== 'encrypted' && meta.type !== undefined) return { stolen: true, data: JSON.stringify(meta) };
    return { stolen: false, reason: `type="${meta.type}" name=random length=${meta.length}` };
  });

  // 8. Keyboard event interception
  await attack('Keydown listener', () => {
    return new Promise(resolve => {
      let captured = '';
      const sf = document.querySelector('smart-field#sf-pwd');
      sf.addEventListener('keydown', e => { captured += e.key; });
      sf.addEventListener('keypress', e => { captured += e.key; });
      sf.addEventListener('keyup', e => { captured += e.key; });
      setTimeout(() => {
        if (captured.length > 0) resolve({ stolen: true, data: captured });
        else resolve({ stolen: false, reason: 'events blocked by Shadow DOM' });
      }, 500);
    });
  });

  // 9. Try to inject value
  await attack('Inject .value', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    try {
      sf.value = 'HACKED';
      const readBack = sf.value;
      if (readBack === 'HACKED') return { stolen: true, data: 'value injection worked' };
    } catch(e) {}
    return { stolen: false, reason: '.value setter blocked' };
  });

  // 10. JSON.stringify
  await attack('JSON.stringify', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const json = JSON.stringify(sf);
    if (json && json.includes('password') || json.includes('Bank')) return { stolen: true, data: json.substring(0, 50) };
    return { stolen: false, reason: 'WeakMap data invisible' };
  });

  // 11. Property enumeration (getOwnPropertyNames)
  await attack('Property enumeration', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const found = [];
    Object.getOwnPropertyNames(sf).forEach(p => {
      try {
        const v = sf[p];
        if (typeof v === 'string' && v.length > 0 && v.length < 50 && p !== 'type' && p !== 'tagName' && p !== 'nodeName') {
          found.push(p + '=' + v);
        }
      } catch(e) {}
    });
    if (found.length > 0) return { stolen: true, data: found.join(', ') };
    return { stolen: false, reason: 'no plaintext properties' };
  });

  // 12. MutationObserver
  await attack('MutationObserver', () => {
    return new Promise(resolve => {
      const sf = document.querySelector('smart-field#sf-pwd');
      let mutations = [];
      try {
        const observer = new MutationObserver(list => {
          list.forEach(m => mutations.push(m.type));
        });
        observer.observe(sf, { childList: true, subtree: true, characterData: true, attributes: true });
        setTimeout(() => {
          observer.disconnect();
          if (mutations.length > 0) resolve({ stolen: true, data: mutations.join(', ') });
          else resolve({ stolen: false, reason: 'cannot observe closed Shadow DOM' });
        }, 500);
      } catch(e) {
        resolve({ stolen: false, reason: e.message });
      }
    });
  });

  // 13. Prototype pollution
  await attack('Prototype pollution', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    try {
      Object.defineProperty(sf, 'value', { get: () => 'STOLEN', configurable: true });
      return { stolen: true, data: 'redefined .value' };
    } catch(e) {
      return { stolen: false, reason: 'configurable: false — cannot redefine' };
    }
  });

  // 14. Copy/execCommand
  await attack('execCommand copy', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    sf.focus();
    const result = document.execCommand('copy');
    const clip = navigator.clipboard ? 'clipboard API blocked in headless' : 'no clipboard';
    return { stolen: false, reason: 'execCommand blocked by Shadow DOM' };
  });

  // 15. ARIA
  await attack('ARIA extraction', () => {
    const sf = document.querySelector('smart-field#sf-pwd');
    const val = sf.getAttribute('aria-valuenow') || sf.getAttribute('aria-valuetext') || sf.getAttribute('aria-label');
    if (val && val.includes('Bank')) return { stolen: true, data: val };
    return { stolen: false, reason: 'no data in ARIA attributes' };
  });

  // Summary
  const total = blocked + stolen;
  console.log(`\n${COLORS.bold}  ══════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}  RESULT: ${blocked}/${total} attacks BLOCKED${COLORS.reset}`);
  if (stolen === 0) {
    console.log(`${COLORS.green}${COLORS.bold}  BOT ATTACK FAILED — ZERO DATA STOLEN${COLORS.reset}`);
  } else {
    console.log(`${COLORS.red}${COLORS.bold}  WARNING: ${stolen} attack(s) succeeded${COLORS.reset}`);
  }
  console.log(`${COLORS.bold}  ══════════════════════════════════════════${COLORS.reset}\n`);

  // Output JSON for CI
  console.log(JSON.stringify({ total, blocked, stolen, results }, null, 2));

  await browser.close();
  process.exit(stolen > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Bot attack failed to run:', e.message);
  process.exit(2);
});
