#!/usr/bin/env node
/**
 * SmartField SEO Page Generator
 * Generates 48 static HTML pages from templates + data
 * Run: node landing/data/build.js
 */

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));
const site = data.site;
const outDir = path.join(__dirname, '..');

let sitemapEntries = [];
let generated = 0;

// ========== SHARED STYLES ==========
const sharedStyles = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;background:#fff;color:#111;line-height:1.7}
.container{max-width:800px;margin:0 auto;padding:40px 20px}
h1{font-size:36px;font-weight:800;color:#0B1120;margin-bottom:12px;line-height:1.2}
h2{font-size:24px;font-weight:700;color:#0B1120;margin-top:40px;margin-bottom:12px}
h3{font-size:18px;font-weight:700;color:#0B1120;margin-top:24px;margin-bottom:8px}
p{font-size:17px;color:#444;margin-bottom:16px;line-height:1.7}
ul{padding-left:20px;margin-bottom:16px}
li{font-size:16px;color:#444;margin-bottom:8px;line-height:1.6}
a{color:#00B88A;text-decoration:none;font-weight:600}
a:hover{text-decoration:underline}
.badge{display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;margin-bottom:16px}
.badge-green{background:#d1fae5;color:#065f46}
.badge-red{background:#fee2e2;color:#991b1b}
.badge-blue{background:#dbeafe;color:#1e40af}
.code-block{background:#0B1120;color:#e2e8f0;border-radius:10px;padding:20px;margin:12px 0 20px;overflow-x:auto;font-size:14px;line-height:1.6;font-family:'Fira Code',monospace}
.code-inline{background:#f0f0f0;color:#0B1120;padding:2px 6px;border-radius:4px;font-size:13px;font-family:'Fira Code',monospace}
.card{background:#f8fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px}
.cta{display:inline-block;padding:14px 32px;background:#00B88A;color:#fff;font-size:16px;font-weight:700;border-radius:10px;margin-top:24px;transition:opacity .2s}
.cta:hover{opacity:.85;text-decoration:none}
.faq-item{border-bottom:1px solid #e5e7eb;padding:16px 0;cursor:pointer}
.faq-q{font-size:17px;font-weight:600;color:#0B1120;display:flex;justify-content:space-between;align-items:center}
.faq-a{display:none;font-size:16px;color:#555;margin-top:10px;line-height:1.7}
.faq-item.open .faq-a{display:block}
.breadcrumb{font-size:14px;color:#888;margin-bottom:24px}
.breadcrumb a{color:#00B88A;font-weight:500}
nav{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 20px;z-index:100;display:flex;justify-content:space-between;align-items:center}
nav a.logo{font-size:18px;font-weight:800;color:#0B1120;text-decoration:none}
nav a.logo span{color:#00B88A}
nav .nav-cta{padding:8px 20px;background:#0B1120;color:#fff;font-size:13px;font-weight:700;border-radius:8px;text-decoration:none}
.spacer{height:70px}
footer{border-top:1px solid #e5e7eb;padding:40px 20px;text-align:center;font-size:14px;color:#888;margin-top:60px}
.related{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
.related a{display:block;padding:16px;background:#f8fafb;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;font-weight:600;color:#0B1120;text-decoration:none;transition:border-color .2s}
.related a:hover{border-color:#00B88A}
@media(max-width:768px){.related{grid-template-columns:1fr}h1{font-size:28px}}
`;

const sharedNav = `
<nav>
  <a href="/landing/" class="logo">Smart<span>Field</span></a>
  <a href="/landing/#demo" class="nav-cta">Try Demo</a>
</nav>
<div class="spacer"></div>
`;

const sharedFooter = `
<footer>
  <p>${site.name}. ${site.tagline} <a href="/landing/">Home</a> &middot; <a href="/landing/docs.html">Docs</a> &middot; <a href="https://github.com/smartfield-dev/smartfield">GitHub</a></p>
</footer>
`;

const faqScript = `
<script>document.querySelectorAll('.faq-item').forEach(i=>i.addEventListener('click',()=>i.classList.toggle('open')))</script>
`;

function faqHTML(faqs) {
  if (!faqs || faqs.length === 0) return '';
  return `<h2>Frequently Asked Questions</h2>
<div class="faq-list">
${faqs.map(f => `  <div class="faq-item">
    <div class="faq-q">${f.q}<span>+</span></div>
    <div class="faq-a">${f.a}</div>
  </div>`).join('\n')}
</div>`;
}

function faqSchema(faqs, url) {
  if (!faqs || faqs.length === 0) return '';
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  })}</script>`;
}

function relatedLinks(current, allPages, type) {
  const others = allPages.filter(p => p.slug !== current.slug).slice(0, 3);
  return `<h2>Related Pages</h2>
<div class="related">
${others.map(p => `  <a href="/landing/${type}/${p.slug}.html">${p.title}</a>`).join('\n')}
</div>`;
}

function writePage(dir, slug, title, metaDesc, canonical, bodyHTML, schemaJSON) {
  const filePath = path.join(outDir, dir, `${slug}.html`);
  const fullUrl = `${site.url}/landing/${dir}/${slug}.html`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | ${site.name}</title>
<meta name="description" content="${metaDesc}">
<link rel="canonical" href="${canonical || fullUrl}">
<style>${sharedStyles}</style>
${schemaJSON || ''}
</head>
<body>
${sharedNav}
<div class="container">
${bodyHTML}
</div>
${sharedFooter}
${faqScript}
</body>
</html>`;

  fs.writeFileSync(filePath, html);
  sitemapEntries.push(fullUrl);
  generated++;
}

// ========== GENERATE USE CASES ==========
console.log('Generating use-case pages...');
data.useCases.forEach(uc => {
  const metaDesc = `${uc.title}. Encrypt ${uc.dataTypes.slice(0,3).join(', ')} with AES-256-GCM + RSA-2048. Protect against ${uc.threats.slice(0,2).join(' and ')}. ${uc.regulations.join(', ')} ready.`;
  const body = `
<div class="breadcrumb"><a href="/landing/">Home</a> / <a href="/landing/use-cases/">Use Cases</a> / ${uc.vertical}</div>
<span class="badge badge-green">${uc.vertical}</span>
<h1>${uc.h1}</h1>
<p>${uc.intro}</p>

<h2>What Data This Protects</h2>
<ul>${uc.dataTypes.map(d => `<li><strong>${d}</strong></li>`).join('\n')}</ul>

<h2>Threats Blocked</h2>
<div class="card">
<ul>${uc.threats.map(t => `<li>${t}</li>`).join('\n')}</ul>
</div>

<h2>How It Works</h2>
<p>Replace your standard HTML input with SmartField. 2 lines of code:</p>
<div class="code-block">&lt;script src="https://cdn.smartfield.dev/v1/smartfield.js"&gt;&lt;/script&gt;

&lt;smart-field type="password" placeholder="password"
  encrypt-key="/api/sf-key"&gt;&lt;/smart-field&gt;</div>
<p>Every keystroke is encrypted with AES-256-GCM. The AES key is wrapped with RSA-2048. Only your server can decrypt.</p>

<h2>Why Standard Inputs Fail</h2>
<div class="card">
<p>A standard <span class="code-inline">&lt;input&gt;</span> stores plaintext in the DOM. Any JavaScript on the page can read it:</p>
<div class="code-block">document.querySelector('input').value
// "MyBankPassword123"  &larr; stolen</div>
<p>With SmartField, the same code returns:</p>
<div class="code-block">document.querySelector('smart-field').value
// "eyJ2IjoxLCJpdiI6IkNx..."  &larr; encrypted</div>
</div>

<h2>Compliance</h2>
<p>SmartField helps meet requirements for: <strong>${uc.regulations.join(', ')}</strong></p>
<ul>
<li>AES-256-GCM (NIST SP 800-38D)</li>
<li>RSA-2048 (NIST SP 800-56B)</li>
<li>Zero-data architecture. SmartField never sees your data.</li>
</ul>

${faqHTML(uc.faq)}

${relatedLinks(uc, data.useCases, 'use-cases')}

<div style="text-align:center;margin-top:40px">
  <a href="${site.ctaUrl}" class="cta">${site.cta}</a>
</div>`;

  writePage('use-cases', uc.slug, uc.title, metaDesc, null, body, faqSchema(uc.faq));
});

// ========== GENERATE THREATS ==========
console.log('Generating threat pages...');
data.threats.forEach(t => {
  const metaDesc = `Protect web forms from ${t.threat}. SmartField encrypts input data with AES-256-GCM inside a closed Shadow DOM. ${t.threat} cannot read, capture, or extract sensitive data.`;
  const defaultFaq = [
    {q: `How does SmartField protect against ${t.threat.toLowerCase()}?`, a: t.description},
    {q: "Does this require changes to my server?", a: "Minimal. Install our server SDK (Node.js, Python, Java, Go, PHP, or Ruby). Call sf.decrypt() on the encrypted payload. Your existing authentication and business logic stays the same."},
    {q: "Does it work with React, Vue, and Angular?", a: "Yes. SmartField is a standard Web Component. It works with any framework or no framework at all."}
  ];
  const body = `
<div class="breadcrumb"><a href="/landing/">Home</a> / <a href="/landing/threats/">Threats</a> / ${t.threat}</div>
<span class="badge badge-red">${t.threat}</span>
<h1>${t.h1}</h1>
<p style="font-size:19px;color:#333">${t.description}</p>

<h2>The Attack</h2>
<div class="card">
<p>When ${t.threat.toLowerCase()} targets a standard HTML input, the attacker can read the plaintext value directly from the DOM:</p>
<div class="code-block">// ${t.threat} attack:
document.querySelector('input').value
// "SensitiveData123"  &larr; stolen</div>
</div>

<h2>The Protection</h2>
<div class="card">
<p>With SmartField, the same attack returns encrypted data:</p>
<div class="code-block">// Same attack against SmartField:
document.querySelector('smart-field').value
// "eyJ2IjoxLCJpdiI6..."  &larr; AES-256-GCM encrypted</div>
<p>The attacker gets 600+ characters of encrypted gibberish. Useless without the server's RSA-2048 private key.</p>
</div>

<h2>13 Security Layers</h2>
<p>SmartField does not rely on any single defense. It combines 13 independent security layers:</p>
<ul>
<li>Closed Shadow DOM (shadowRoot = null)</li>
<li>AES-256-GCM authenticated encryption</li>
<li>RSA-2048 key exchange</li>
<li>WeakMap data isolation</li>
<li>Event propagation blocking</li>
<li>Anti copy/paste/select/drag</li>
<li>Cipher character display</li>
<li>Anti-screenshot scrambling</li>
<li>Hidden metadata (type, name, length)</li>
<li>Value injection blocking</li>
<li>Non-configurable properties</li>
<li>Anti-bot architecture</li>
<li>HTTPS enforcement</li>
</ul>

<h2>Implementation</h2>
<div class="code-block">&lt;!-- 2 lines. That's it. --&gt;
&lt;script src="https://cdn.smartfield.dev/v1/smartfield.js"&gt;&lt;/script&gt;

&lt;smart-field type="password" encrypt-key="/api/sf-key"&gt;&lt;/smart-field&gt;</div>

${faqHTML(defaultFaq)}

${relatedLinks(t, data.threats, 'threats')}

<div style="text-align:center;margin-top:40px">
  <a href="${site.ctaUrl}" class="cta">${site.cta}</a>
</div>`;

  writePage('threats', t.slug, t.title, metaDesc, null, body, faqSchema(defaultFaq));
});

// ========== GENERATE DATA TYPES ==========
console.log('Generating data-type pages...');
data.dataTypes.forEach(dt => {
  const metaDesc = `Encrypt ${dt.dataType} in the browser with SmartField. AES-256-GCM + RSA-2048 encryption at the keystroke level. Invisible to JavaScript, trackers, bots, and screen recorders.`;
  const defaultFaq = [
    {q: `How does SmartField encrypt ${dt.dataType.toLowerCase()}?`, a: `SmartField generates a new AES-256 key and IV for every encryption. ${dt.dataType} are encrypted before they exist in the DOM. The AES key is wrapped with RSA-2048. Only your server can decrypt.`},
    {q: `Can trackers like Hotjar capture ${dt.dataType.toLowerCase()}?`, a: `No. Hotjar records DOM content. SmartField stores ${dt.dataType.toLowerCase()} in a WeakMap inside a closed Shadow DOM. Hotjar only captures cipher characters.`},
    {q: "What server languages are supported?", a: "SmartField provides SDKs for Node.js, Python, Java, Go, PHP, and Ruby. All tested and verified."}
  ];
  const body = `
<div class="breadcrumb"><a href="/landing/">Home</a> / <a href="/landing/data-types/">Data Types</a> / ${dt.dataType}</div>
<span class="badge badge-blue">${dt.dataType}</span>
<h1>${dt.h1}</h1>
<p style="font-size:19px;color:#333">${dt.description}</p>

<h2>The Problem</h2>
<div class="card">
<p>${dt.dataType} entered in a standard HTML input are immediately accessible to any JavaScript on the page:</p>
<div class="code-block">// Any script, extension, or tracker:
document.querySelector('input').value
// Your ${dt.dataType.toLowerCase()} in plaintext</div>
</div>

<h2>The Solution</h2>
<div class="code-block">&lt;smart-field type="password" encrypt-key="/api/sf-key"
  placeholder="Enter ${dt.dataType.toLowerCase()}"&gt;&lt;/smart-field&gt;</div>
<p>Now the same attack returns AES-256-GCM encrypted data. The ${dt.dataType.toLowerCase()} never exist as plaintext in the browser.</p>

<h2>What the User Sees</h2>
<div class="card">
<p>The user types normally. The screen shows animated cipher characters: <strong style="font-family:monospace;color:#00B88A;font-size:20px">ΣΩΔψξλμπ</strong></p>
<p>The real ${dt.dataType.toLowerCase()} are stored in a WeakMap (invisible to JavaScript) and encrypted with AES-256-GCM (unreadable without the server key).</p>
</div>

<h2>Server-Side Decryption</h2>
<div class="code-block">// Node.js
const sf = require('@smartfield-dev/server');
await sf.init();
const data = await sf.decrypt(req.body.field);
// Your ${dt.dataType.toLowerCase()} in plaintext, server-side only</div>

${faqHTML(defaultFaq)}

${relatedLinks(dt, data.dataTypes, 'data-types')}

<div style="text-align:center;margin-top:40px">
  <a href="${site.ctaUrl}" class="cta">${site.cta}</a>
</div>`;

  writePage('data-types', dt.slug, dt.title, metaDesc, null, body, faqSchema(defaultFaq));
});

// ========== GENERATE DEVELOPERS ==========
console.log('Generating developer pages...');
data.developers.forEach(dev => {
  const metaDesc = `SmartField ${dev.language} SDK. Decrypt encrypted browser input with ${dev.framework}. AES-256-GCM + RSA-2048. Install, init, decrypt. 3 steps.`;
  const body = `
<div class="breadcrumb"><a href="/landing/">Home</a> / <a href="/landing/developers/">Developers</a> / ${dev.language}</div>
<span class="badge badge-green">${dev.language}</span>
<h1>SmartField SDK for ${dev.language}</h1>
<p style="font-size:19px;color:#333">Decrypt SmartField encrypted data with ${dev.language}. Works with ${dev.framework}. Tested on port ${dev.port}.</p>

<h2>Installation</h2>
<div class="code-block">${dev.install}</div>

<h2>Initialize</h2>
<div class="code-block">${dev.initCode}</div>
<p>This generates RSA-2048 keys locally. Keys are stored in <span class="code-inline">.smartfield/</span> and never sent anywhere.</p>

<h2>Decrypt</h2>
<div class="code-block">${dev.decryptCode}</div>
<p>That's it. The encrypted payload from the browser is decrypted server-side. Only your server has the private key.</p>

<h2>How It Works</h2>
<div class="card">
<ol style="padding-left:20px">
<li style="margin-bottom:8px">Browser: SmartField encrypts user input with AES-256-GCM</li>
<li style="margin-bottom:8px">Browser: AES key is wrapped with your server's RSA-2048 public key</li>
<li style="margin-bottom:8px">Network: Encrypted payload sent to your ${dev.language} server</li>
<li style="margin-bottom:8px">Server: RSA private key unwraps the AES key</li>
<li style="margin-bottom:8px">Server: AES key decrypts the data</li>
<li>Server: Plaintext available only here</li>
</ol>
</div>

<h2>Frontend Setup</h2>
<div class="code-block">&lt;script src="https://cdn.smartfield.dev/v1/smartfield.js"&gt;&lt;/script&gt;

&lt;smart-field type="password"
  encrypt-key="/api/sf-key"
  placeholder="password"&gt;&lt;/smart-field&gt;</div>

<h2>Encryption Details</h2>
<ul>
<li><strong>Data encryption:</strong> AES-256-GCM (NIST SP 800-38D)</li>
<li><strong>Key exchange:</strong> RSA-OAEP-2048 (NIST SP 800-56B)</li>
<li><strong>Random generation:</strong> Cryptographically secure (Web Crypto API)</li>
<li><strong>Payload format:</strong> Base64(JSON{v, iv, key, data})</li>
<li><strong>New key per encryption:</strong> Forward secrecy per keystroke</li>
</ul>

${relatedLinks(dev, data.developers, 'developers')}

<div style="text-align:center;margin-top:40px">
  <a href="/landing/docs.html" class="cta">Full Documentation</a>
</div>`;

  writePage('developers', dev.slug, dev.title, metaDesc, null, body, '');
});

// ========== GENERATE COMPARISONS ==========
console.log('Generating comparison pages...');
data.compare.forEach(c => {
  const metaDesc = `${c.title}. ${c.competitorDesc} ${c.advantage}`;
  const defaultFaq = [
    {q: `Why choose SmartField over ${c.competitor}?`, a: c.advantage},
    {q: "Can I use both together?", a: `In most cases, yes. SmartField complements existing security measures. It adds encryption at the input level, which ${c.competitor} does not provide.`},
    {q: "How hard is it to switch?", a: "SmartField is a drop-in replacement. Change your input tag to smart-field and add the script. 2 lines of code. Your backend receives encrypted data and decrypts with one function call."}
  ];
  const body = `
<div class="breadcrumb"><a href="/landing/">Home</a> / <a href="/landing/compare/">Compare</a> / vs ${c.competitor}</div>
<h1>${c.title}</h1>
<p style="font-size:19px;color:#333">A direct comparison of SmartField and ${c.competitor} for protecting sensitive form data.</p>

<h2>${c.competitor}</h2>
<div class="card" style="border-left:3px solid #ef4444">
<p>${c.competitorDesc}</p>
<div class="code-block">// With ${c.competitor}:
document.querySelector('input').value
// "SensitiveData123"  &larr; readable</div>
</div>

<h2>SmartField</h2>
<div class="card" style="border-left:3px solid #00B88A">
<p>${c.advantage}</p>
<div class="code-block">// With SmartField:
document.querySelector('smart-field').value
// "eyJ2IjoxLCJpdiI6..."  &larr; AES-256 encrypted</div>
</div>

<h2>Comparison</h2>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<thead><tr style="border-bottom:2px solid #e5e7eb">
<th style="text-align:left;padding:12px;font-size:15px">Feature</th>
<th style="text-align:center;padding:12px;color:#ef4444;font-size:15px">${c.competitor}</th>
<th style="text-align:center;padding:12px;color:#00B88A;font-size:15px">SmartField</th>
</tr></thead>
<tbody>
<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:12px;font-size:16px">Encrypts keystrokes</td><td style="text-align:center;color:#ef4444;font-weight:700;font-size:16px">No</td><td style="text-align:center;color:#00B88A;font-weight:700;font-size:16px">Yes</td></tr>
<tr style="border-bottom:1px solid #f0f0f0;background:#f8fafb"><td style="padding:12px;font-size:16px">Blocks JavaScript access</td><td style="text-align:center;color:#ef4444;font-weight:700;font-size:16px">No</td><td style="text-align:center;color:#00B88A;font-weight:700;font-size:16px">Yes</td></tr>
<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:12px;font-size:16px">Blocks screen recorders</td><td style="text-align:center;color:#ef4444;font-weight:700;font-size:16px">No</td><td style="text-align:center;color:#00B88A;font-weight:700;font-size:16px">Yes</td></tr>
<tr style="border-bottom:1px solid #f0f0f0;background:#f8fafb"><td style="padding:12px;font-size:16px">Blocks bots</td><td style="text-align:center;color:#ef4444;font-weight:700;font-size:16px">No</td><td style="text-align:center;color:#00B88A;font-weight:700;font-size:16px">Yes</td></tr>
<tr><td style="padding:12px;font-size:16px">Works for any field type</td><td style="text-align:center;color:#ef4444;font-weight:700;font-size:16px">Limited</td><td style="text-align:center;color:#00B88A;font-weight:700;font-size:16px">Yes</td></tr>
</tbody></table>

<h2>The Bottom Line</h2>
<p>${c.advantage} SmartField uses AES-256-GCM + RSA-2048 encryption inside a closed Shadow DOM with WeakMap isolation. 13 independent security layers. 20/20 attacks blocked.</p>

${faqHTML(defaultFaq)}

${relatedLinks(c, data.compare, 'compare')}

<div style="text-align:center;margin-top:40px">
  <a href="${site.ctaUrl}" class="cta">${site.cta}</a>
</div>`;

  writePage('compare', c.slug, c.title, metaDesc, null, body, faqSchema(defaultFaq));
});

// ========== GENERATE HUB PAGES ==========
console.log('Generating hub pages...');

function writeHub(dir, title, desc, items, slugPrefix) {
  const body = `
<h1>${title}</h1>
<p style="font-size:19px;color:#333;margin-bottom:32px">${desc}</p>
<div class="related" style="grid-template-columns:1fr 1fr">
${items.map(i => `  <a href="/landing/${dir}/${i.slug}.html" style="padding:20px">
    <div style="font-size:17px;font-weight:700;margin-bottom:4px">${i.title}</div>
    <div style="font-size:14px;color:#666;font-weight:400">${i.description || i.intro || i.competitorDesc || ''}</div>
  </a>`).join('\n')}
</div>
<div style="text-align:center;margin-top:40px">
  <a href="${site.ctaUrl}" class="cta">${site.cta}</a>
</div>`;
  writePage(dir, 'index', title, desc, null, body, '');
}

writeHub('use-cases', 'SmartField Use Cases', 'Encrypted input fields for every industry.', data.useCases, 'use-cases');
writeHub('threats', 'Threats SmartField Blocks', 'Every attack vector SmartField protects against.', data.threats, 'threats');
writeHub('data-types', 'Sensitive Data Types', 'Every type of sensitive data SmartField encrypts.', data.dataTypes, 'data-types');
writeHub('developers', 'Developer SDKs', 'SmartField server SDKs for 6 languages.', data.developers, 'developers');
writeHub('compare', 'SmartField Comparisons', 'How SmartField compares to existing solutions.', data.compare, 'compare');

// ========== GENERATE SITEMAP ==========
console.log('Generating sitemap.xml...');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site.url}/landing/</loc><priority>1.0</priority></url>
  <url><loc>${site.url}/landing/docs.html</loc><priority>0.8</priority></url>
${sitemapEntries.map(u => `  <url><loc>${u}</loc><priority>0.7</priority></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(outDir, '..', 'sitemap.xml'), sitemap);

console.log(`\nDone! Generated ${generated} pages + sitemap.xml`);
