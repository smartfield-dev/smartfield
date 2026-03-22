"""
SmartField Python SDK Test Server
Run: python3 test_server.py
Open: http://localhost:5555
"""
from flask import Flask, request, jsonify, send_from_directory
from smartfield import SmartField
import os

app = Flask(__name__)
sf = SmartField()
sf.init(os.path.join(os.path.dirname(__file__), '.smartfield-test'))

# Serve public key
@app.route('/sf-key')
def public_key():
    return jsonify(sf.get_public_key())

# Serve SmartField component
@app.route('/component/<path:filename>')
def serve_component(filename):
    return send_from_directory('../../component', filename)

# Login page
@app.route('/')
def index():
    return '''<!DOCTYPE html>
<html><head><title>SmartField Python Test</title>
<script src="/component/smartfield.js"></script>
<style>
body{font-family:sans-serif;max-width:500px;margin:60px auto;padding:20px;background:#f9fafb}
h1{font-size:22px;color:#111;margin-bottom:4px}
p{color:#666;font-size:14px;margin-bottom:24px}
label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px}
.field{margin-bottom:16px}
button{width:100%;padding:12px;background:#00B88A;color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}
button:hover{background:#00a57d}
#result{margin-top:24px;padding:16px;background:#111;color:#00B88A;border-radius:8px;font-family:monospace;font-size:13px;white-space:pre-wrap;display:none}
.badge{display:inline-block;padding:3px 8px;background:#d1fae5;color:#065f46;border-radius:4px;font-size:11px;font-weight:600;margin-bottom:16px}
</style></head><body>
<h1>SmartField + Python (Flask)</h1>
<span class="badge">SDK TEST</span>
<p>Type something, submit, and see the decrypted values below.</p>
<form id="form">
  <div class="field">
    <label>Email</label>
    <smart-field id="sf-email" type="email" encrypt-key="/sf-key" sf-security="peek"
      style="--sf-bg:white;--sf-border-color:#e5e7eb;--sf-radius:8px;--sf-focus-color:#00B88A;--sf-cipher-color:#00B88A;--sf-placeholder-color:#999"
      placeholder="you@example.com"></smart-field>
  </div>
  <div class="field">
    <label>Password</label>
    <smart-field id="sf-pwd" type="password" encrypt-key="/sf-key" sf-security="peek"
      style="--sf-bg:white;--sf-border-color:#e5e7eb;--sf-radius:8px;--sf-focus-color:#00B88A;--sf-cipher-color:#00B88A;--sf-placeholder-color:#999"
      placeholder="your password"></smart-field>
  </div>
  <button type="submit">Decrypt on Server (Python)</button>
</form>
<div id="result"></div>
<script>
document.getElementById('form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const fields = document.querySelectorAll('smart-field');
  const data = {};
  fields.forEach(f => { data[f.name] = f.value; });

  const res = await fetch('/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  const json = await res.json();
  const el = document.getElementById('result');
  el.style.display = 'block';
  el.textContent = JSON.stringify(json, null, 2);
});
</script>
</body></html>'''

# Decrypt login
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    decrypted = sf.decrypt_fields(data)
    values = list(decrypted.values())
    return jsonify({
        'status': 'ok',
        'sdk': 'Python (Flask)',
        'decrypted_fields': decrypted,
        'email': values[0] if len(values) > 0 else '',
        'password': values[1] if len(values) > 1 else '',
        'message': 'SmartField decryption successful with Python SDK!'
    })

if __name__ == '__main__':
    print('\n  SmartField Python SDK Test')
    print('  Open http://localhost:5555\n')
    app.run(port=5555, debug=False)
