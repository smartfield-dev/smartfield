"""
SmartField Demo — Python (Flask) Server
Run: python3 python_server.py
Port: 5555
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'sdk', 'python'))

from flask import Flask, request, jsonify, send_from_directory
from smartfield import SmartField

app = Flask(__name__)
sf = SmartField()

COMPONENT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'component')
KEYS_DIR = os.path.join(os.path.dirname(__file__), '.smartfield-python')

@app.after_request
def cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

@app.route('/sf-key')
def public_key():
    return jsonify(sf.get_public_key())

@app.route('/component/<path:filename>')
def serve_component(filename):
    return send_from_directory(COMPONENT_DIR, filename)

@app.route('/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.json or {}
    decrypted = {}
    for key, value in data.items():
        if key == 'normalPwd':
            decrypted[key] = value
            print(f'[Python]   {key}: "{value}" <- PLAIN TEXT')
        elif isinstance(value, str) and len(value) > 50:
            try:
                decrypted[key] = sf.decrypt(value)
                print(f'[Python]   {key}: "{decrypted[key]}" <- DECRYPTED')
            except Exception as e:
                decrypted[key] = f'[decrypt failed: {e}]'
                print(f'[Python]   {key}: FAILED - {e}')
        else:
            decrypted[key] = value

    return jsonify({
        'server': 'Python (Flask)',
        'status': 'ok',
        'decrypted': decrypted,
        'note': 'Decrypted with Python cryptography library (RSA-OAEP + AES-256-GCM)'
    })

@app.route('/health')
def health():
    return jsonify({'server': 'Python (Flask)', 'status': 'ok', 'port': 5555})

if __name__ == '__main__':
    sf.init(KEYS_DIR)
    print('\n  SmartField Python Demo Server')
    print('  http://localhost:5555')
    print('  Key: http://localhost:5555/sf-key\n')
    app.run(port=5555, debug=False)
