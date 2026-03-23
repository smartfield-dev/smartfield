// Shared HTML template generator for stack demos
// Usage: generateDemoHTML({ name, color, accent, bgGradient, port, keyEndpoint })

function generateDemoHTML(config) {
  const { name, color, accent, bgGradient, port, keyEndpoint, loginEndpoint } = config;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartField + ${name}</title>
<script src="/component/smartfield.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:${bgGradient};color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.container{max-width:520px;width:100%}
.header{text-align:center;margin-bottom:32px}
.header h1{font-size:28px;font-weight:800;color:${accent};margin-bottom:4px}
.header .stack{font-size:13px;color:#999;margin-bottom:16px}
.header .port{font-family:monospace;font-size:11px;color:#555;background:#ffffff10;padding:3px 8px;border-radius:4px}
.section{background:#ffffff08;border:1px solid #ffffff15;border-radius:16px;padding:24px;margin-bottom:20px}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${accent};margin-bottom:16px;display:flex;align-items:center;gap:8px}
.section-title .dot{width:6px;height:6px;border-radius:50%;background:${accent}}
.field{margin-bottom:14px}
.field label{display:block;font-size:12px;font-weight:600;color:#aaa;margin-bottom:5px}
.field-note{font-size:10px;color:#666;margin-top:3px;font-style:italic}

/* Standard input with eye icon */
.input-wrapper{position:relative}
.input-wrapper input{width:100%;padding:10px 40px 10px 14px;background:#ffffff10;border:1px solid #ffffff20;border-radius:8px;color:#fff;font-size:14px;outline:none;transition:border .2s}
.input-wrapper input:focus{border-color:${accent}}
.input-wrapper input::placeholder{color:#555}
.eye-btn{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;color:#666;transition:color .2s}
.eye-btn:hover{color:${accent}}
.eye-btn svg{width:20px;height:20px}

/* SmartField styling */
smart-field{
  --sf-bg:#ffffff08;
  --sf-border-color:#ffffff20;
  --sf-focus-color:${accent};
  --sf-cipher-color:${accent};
  --sf-cipher-glow:${accent}40;
  --sf-radius:8px;
  --sf-padding:10px 14px;
  --sf-font-size:14px;
  --sf-placeholder-color:#555;
}

button[type="submit"]{width:100%;padding:12px;background:${accent};color:#000;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s;margin-top:8px}
button[type="submit"]:hover{opacity:.85}
.back{display:block;text-align:center;color:#555;font-size:12px;margin-top:20px;text-decoration:none}
.back:hover{color:${accent}}
#result{margin-top:16px;padding:16px;background:#000;border:1px solid #ffffff15;border-radius:10px;font-family:'Fira Code',monospace;font-size:12px;color:${accent};white-space:pre-wrap;display:none;max-height:300px;overflow-y:auto}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.compare>div{text-align:center}
.vs{font-size:10px;color:#444;text-align:center;margin-bottom:10px;text-transform:uppercase;letter-spacing:2px}
.tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;margin-bottom:6px}
.tag-danger{background:#ff000020;color:#ff6b6b}
.tag-safe{background:${accent}20;color:${accent}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>SmartField + ${name}</h1>
    <div class="stack">Server decrypts with ${name} SDK &bull; AES-256-GCM + RSA-2048</div>
    <span class="port">localhost:${port}</span>
  </div>

  <form id="demoForm">
    <!-- COMPARISON: Standard vs SmartField -->
    <div class="section">
      <div class="section-title"><span class="dot"></span>Standard Input vs SmartField</div>
      <div class="vs">see the difference</div>
      <div class="compare">
        <div>
          <span class="tag tag-danger">EXPOSED</span>
          <div class="field">
            <label>Standard Password</label>
            <div class="input-wrapper">
              <input type="password" id="normalPwd" placeholder="type here..." autocomplete="off">
              <button type="button" class="eye-btn" onclick="toggleEye(this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            <div class="field-note">Any JS can read: document.querySelector('input').value</div>
          </div>
        </div>
        <div>
          <span class="tag tag-safe">ENCRYPTED</span>
          <div class="field">
            <label>SmartField (max)</label>
            <smart-field id="sf-compare" type="password" encrypt-key="${keyEndpoint}" sf-security="max" placeholder="type here..."></smart-field>
            <div class="field-note">.value returns AES-256-GCM encrypted payload</div>
          </div>
        </div>
      </div>
    </div>

    <!-- THREE SECURITY MODES -->
    <div class="section">
      <div class="section-title"><span class="dot"></span>Three Security Modes</div>

      <div class="field">
        <label>Mode: MAX — Full cipher, nothing visible</label>
        <smart-field id="sf-max" type="password" encrypt-key="${keyEndpoint}" sf-security="max" placeholder="max security..."></smart-field>
      </div>

      <div class="field">
        <label>Mode: PEEK — Hold eye icon to reveal (3s)</label>
        <smart-field id="sf-peek" type="password" encrypt-key="${keyEndpoint}" sf-security="peek" placeholder="peek mode..."></smart-field>
      </div>

      <div class="field">
        <label>Mode: BRIEF — Shows char briefly, then encrypts</label>
        <smart-field id="sf-brief" type="password" encrypt-key="${keyEndpoint}" sf-security="brief" placeholder="brief mode..."></smart-field>
      </div>
    </div>

    <!-- EMAIL FIELD -->
    <div class="section">
      <div class="section-title"><span class="dot"></span>Email (also encrypted)</div>
      <div class="field">
        <label>Email</label>
        <smart-field id="sf-email" type="email" encrypt-key="${keyEndpoint}" sf-security="peek" placeholder="you@company.com"></smart-field>
      </div>

      <button type="submit">Decrypt on ${name} Server</button>
    </div>
  </form>

  <div id="result"></div>
  <a href="/demo/stacks/" class="back">&larr; Back to all stacks</a>
</div>

<script>
function toggleEye(btn) {
  const input = btn.parentElement.querySelector('input');
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

document.getElementById('demoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fields = document.querySelectorAll('smart-field');
  const data = {};
  fields.forEach(f => { data[f.id] = f.value; });
  data['normalPwd'] = document.getElementById('normalPwd').value;

  try {
    const res = await fetch('${loginEndpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    const el = document.getElementById('result');
    el.style.display = 'block';
    el.textContent = JSON.stringify(json, null, 2);
  } catch (err) {
    const el = document.getElementById('result');
    el.style.display = 'block';
    el.textContent = 'Error: ' + err.message + '\\nMake sure the ${name} server is running on port ${port}';
  }
});
<\/script>
</body>
</html>`;
}

module.exports = { generateDemoHTML };
