#!/usr/bin/env node
/**
 * SmartField SEO Phase 2 - Combinatorial Pages
 * 9 verticals × 4 data types × 2 threats = 72 pages
 */

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));
const outDir = path.join(__dirname, '..');
let sitemapNew = [];
let count = 0;

const verticals = [
  {slug: 'banking', name: 'Banking', dataTypes: ['password', 'account-number', 'wire-transfer', 'pin'], threats: ['xss', 'session-replay']},
  {slug: 'payments', name: 'Payments', dataTypes: ['credit-card', 'cvv', 'expiry', 'billing'], threats: ['magecart', 'javascript-skimmer']},
  {slug: 'healthcare', name: 'Healthcare', dataTypes: ['diagnosis', 'prescription', 'lab-results', 'insurance-id'], threats: ['session-replay', 'tracker-capture']},
  {slug: 'government', name: 'Government', dataTypes: ['ssn', 'tax-id', 'income', 'government-id'], threats: ['xss', 'extension-scraping']},
  {slug: 'crypto', name: 'Crypto', dataTypes: ['seed-phrase', 'private-key', 'recovery-code', 'wallet-address'], threats: ['clipboard-hijack', 'extension-theft']},
  {slug: 'hr', name: 'HR & Payroll', dataTypes: ['ssn', 'salary', 'bank-account', 'tax-form'], threats: ['analytics-capture', 'xss']},
  {slug: 'insurance', name: 'Insurance', dataTypes: ['policy-number', 'medical-history', 'beneficiary', 'claim-details'], threats: ['session-replay', 'script-injection']},
  {slug: 'real-estate', name: 'Real Estate', dataTypes: ['ssn', 'income', 'bank-statement', 'employer'], threats: ['tracker-capture', 'xss']},
  {slug: 'immigration', name: 'Immigration', dataTypes: ['passport', 'travel-history', 'visa-data', 'employment-history'], threats: ['extension-scraping', 'session-replay']}
];

const threatNames = {
  'xss': 'XSS Protection',
  'session-replay': 'Session Replay Protection',
  'magecart': 'Magecart Protection',
  'javascript-skimmer': 'JavaScript Skimmer Protection',
  'tracker-capture': 'Tracker Protection',
  'extension-scraping': 'Extension Protection',
  'clipboard-hijack': 'Clipboard Protection',
  'extension-theft': 'Extension Theft Protection',
  'analytics-capture': 'Analytics Protection',
  'script-injection': 'Script Injection Protection'
};

const dataTypeNames = {
  'password': 'Password', 'account-number': 'Account Number', 'wire-transfer': 'Wire Transfer',
  'pin': 'PIN', 'credit-card': 'Credit Card', 'cvv': 'CVV', 'expiry': 'Expiry Date',
  'billing': 'Billing Address', 'diagnosis': 'Diagnosis', 'prescription': 'Prescription',
  'lab-results': 'Lab Results', 'insurance-id': 'Insurance ID', 'ssn': 'SSN',
  'tax-id': 'Tax ID', 'income': 'Income Data', 'government-id': 'Government ID',
  'seed-phrase': 'Seed Phrase', 'private-key': 'Private Key', 'recovery-code': 'Recovery Code',
  'wallet-address': 'Wallet Address', 'salary': 'Salary', 'bank-account': 'Bank Account',
  'tax-form': 'Tax Form', 'policy-number': 'Policy Number', 'medical-history': 'Medical History',
  'beneficiary': 'Beneficiary Data', 'claim-details': 'Claim Details', 'bank-statement': 'Bank Statement',
  'employer': 'Employer Info', 'passport': 'Passport', 'travel-history': 'Travel History',
  'visa-data': 'Visa Data', 'employment-history': 'Employment History'
};

const sharedStyles = fs.readFileSync(path.join(outDir, 'use-cases', 'banking-secure-login-fields.html'), 'utf8')
  .match(/<style>([\s\S]*?)<\/style>/)[1];

verticals.forEach(v => {
  const vDir = path.join(outDir, v.slug);
  fs.mkdirSync(vDir, {recursive: true});

  v.dataTypes.forEach(dt => {
    v.threats.forEach(threat => {
      const slug = `${dt}-${threat}`;
      const dtName = dataTypeNames[dt] || dt;
      const threatName = threatNames[threat] || threat;
      const title = `Secure ${dtName} Input for ${v.name}: ${threatName}`;
      const h1 = `Protect ${dtName} Fields in ${v.name} from ${threatName.replace(' Protection', '')}`;
      const metaDesc = `Encrypt ${dtName.toLowerCase()} data in ${v.name.toLowerCase()} forms. SmartField provides ${threatName.toLowerCase()} with AES-256-GCM + RSA-2048 encryption at the keystroke level.`;

      const faq = [
        {q: `How does SmartField protect ${dtName.toLowerCase()} in ${v.name.toLowerCase()}?`, a: `SmartField encrypts ${dtName.toLowerCase()} at the keystroke level using AES-256-GCM. The data never exists as plaintext in the browser DOM. ${threatName} is achieved through 13 independent security layers including closed Shadow DOM and WeakMap isolation.`},
        {q: `Can ${threat.replace('-', ' ')} attacks steal ${dtName.toLowerCase()}?`, a: `Not with SmartField. The .value property returns encrypted payloads only. The real ${dtName.toLowerCase()} is stored in a WeakMap inside a closed Shadow DOM, invisible to any JavaScript including ${threat.replace('-', ' ')} attacks.`},
        {q: "How do I implement this?", a: "Replace your standard input with smart-field. 2 lines of HTML. Install the server SDK (Node.js, Python, Java, Go, PHP, or Ruby) to decrypt on your backend."}
      ];

      const faqSchema = `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faq.map(f => ({"@type": "Question", "name": f.q, "acceptedAnswer": {"@type": "Answer", "text": f.a}}))
      })}</script>`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | SmartField</title>
<meta name="description" content="${metaDesc}">
<link rel="canonical" href="https://3wwprotocol.com/landing/${v.slug}/${slug}.html">
<style>${sharedStyles}</style>
${faqSchema}
</head>
<body>
<nav>
  <a href="/landing/" class="logo">Smart<span>Field</span></a>
  <a href="/landing/#demo" class="nav-cta">Try Demo</a>
</nav>
<div class="spacer"></div>
<div class="container">
<div class="breadcrumb"><a href="/landing/">Home</a> / <a href="/landing/use-cases/">Use Cases</a> / <a href="/landing/use-cases/${v.slug}-secure-login-fields.html">${v.name}</a> / ${dtName}</div>
<span class="badge badge-green">${v.name}</span>
<h1>${h1}</h1>
<p style="font-size:19px;color:#333">In ${v.name.toLowerCase()}, ${dtName.toLowerCase()} is one of the most targeted data types. Standard HTML inputs expose it to ${threat.replace('-', ' ')} attacks. SmartField encrypts it at the keystroke level.</p>

<h2>The Risk</h2>
<div class="card">
<p>${dtName} entered in a standard form is immediately accessible:</p>
<div class="code-block">// ${threatName.replace(' Protection', '')} attack:
document.querySelector('input').value
// "${dtName} data here"  &larr; stolen</div>
</div>

<h2>The Fix</h2>
<div class="code-block">&lt;smart-field type="password" encrypt-key="/api/sf-key"
  placeholder="${dtName.toLowerCase()}"&gt;&lt;/smart-field&gt;</div>
<p>Now the same attack returns AES-256-GCM encrypted data. The ${dtName.toLowerCase()} never exists as plaintext in the browser.</p>

<h2>What the Attacker Gets</h2>
<div class="card" style="border-left:3px solid #00B88A">
<div class="code-block">document.querySelector('smart-field').value
// "eyJ2IjoxLCJpdiI6IkNxT3..."  &larr; 600+ chars of encrypted gibberish</div>
<p>Useless without your server's RSA-2048 private key.</p>
</div>

<h2>Compliance</h2>
<p>SmartField uses NIST-approved algorithms: AES-256-GCM (SP 800-38D) and RSA-2048 (SP 800-56B). Compatible with PCI-DSS, HIPAA, GDPR, SOX, and FISMA requirements.</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
${faq.map(f => `  <div class="faq-item">
    <div class="faq-q">${f.q}<span>+</span></div>
    <div class="faq-a">${f.a}</div>
  </div>`).join('\n')}
</div>

<h2>Related</h2>
<div class="related">
  <a href="/landing/use-cases/${v.slug}-secure-login-fields.html">${v.name} Use Case</a>
  <a href="/landing/threats/${threat === 'xss' ? 'xss-resistant-input-fields' : threat === 'session-replay' ? 'session-replay-safe-input-fields' : 'anti-bot-form-fields'}.html">${threatName}</a>
  <a href="/landing/data-types/secure-${dt === 'ssn' ? 'ssn' : dt === 'credit-card' ? 'credit-card' : 'password'}-input.html">${dtName} Data Type</a>
</div>

<div style="text-align:center;margin-top:40px">
  <a href="/landing/#demo" class="cta">Try Live Demo</a>
</div>
</div>
<footer>
  <p>SmartField. Every Keystroke, Encrypted. <a href="/landing/">Home</a> &middot; <a href="/landing/docs.html">Docs</a></p>
</footer>
<script>document.querySelectorAll('.faq-item').forEach(i=>i.addEventListener('click',()=>i.classList.toggle('open')))</script>
</body>
</html>`;

      fs.writeFileSync(path.join(vDir, `${slug}.html`), html);
      sitemapNew.push(`https://3wwprotocol.com/landing/${v.slug}/${slug}.html`);
      count++;
    });
  });
});

// Append to sitemap
const existingSitemap = fs.readFileSync(path.join(outDir, '..', 'sitemap.xml'), 'utf8');
const newEntries = sitemapNew.map(u => `  <url><loc>${u}</loc><priority>0.6</priority></url>`).join('\n');
const updatedSitemap = existingSitemap.replace('</urlset>', newEntries + '\n</urlset>');
fs.writeFileSync(path.join(outDir, '..', 'sitemap.xml'), updatedSitemap);

console.log(`Phase 2: Generated ${count} combinatorial pages`);
console.log(`Sitemap updated with ${sitemapNew.length} new URLs`);
console.log(`Total sitemap entries: ${updatedSitemap.split('<url>').length - 1}`);
