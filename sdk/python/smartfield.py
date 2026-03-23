"""
============================================================================
SmartField Server SDK for Python — v2.7.0
============================================================================

Copyright (c) 2026 SmartField — MIT License
Website:  https://smartfield.dev
Docs:     https://smartfield.dev/docs
Support:  support@smartfield.dev

Decrypts data encrypted by the <smart-field> browser component.
Keys are generated and stored locally. SmartField never sees your data.

Quick start:
    pip install cryptography

    from smartfield import SmartField
    sf = SmartField()
    sf.init()

    # Flask
    @app.route('/sf-key')
    def key(): return jsonify(sf.get_public_key())

    @app.route('/login', methods=['POST'])
    def login():
        email = sf.decrypt(request.json['email'])
        password = sf.decrypt(request.json['password'])

API:
    sf.init(keys_dir)        — Generate or load RSA-2048 keys
    sf.get_public_key()      — Return public key as JWK dict
    sf.decrypt(payload)      — Decrypt a single encrypted value
    sf.decrypt_fields(dict)  — Decrypt all encrypted fields

Encryption: AES-256-GCM (NIST SP 800-38D) + RSA-OAEP-2048 (NIST SP 800-56B)
============================================================================
"""

import json
import os
import base64
import stat
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend


class SmartField:
    def __init__(self):
        self._private_key = None
        self._public_key = None
        self._public_key_jwk = None
        self._keys_dir = None

    def init(self, keys_dir='.smartfield'):
        """Generate or load RSA-2048 keys. Keys stored locally, never sent anywhere."""
        self._keys_dir = keys_dir
        priv_path = os.path.join(keys_dir, 'private.pem')
        pub_path = os.path.join(keys_dir, 'public.json')

        if os.path.exists(priv_path) and os.path.exists(pub_path):
            # Load existing keys
            with open(priv_path, 'rb') as f:
                self._private_key = serialization.load_pem_private_key(f.read(), password=None)
            self._public_key = self._private_key.public_key()
            with open(pub_path, 'r') as f:
                self._public_key_jwk = json.load(f)
            print(f'[SmartField] Keys loaded from {keys_dir}')
            return

        # Generate new keys
        self._private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        self._public_key = self._private_key.public_key()

        # Save keys
        os.makedirs(keys_dir, exist_ok=True)

        # Private key (PEM)
        pem = self._private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        with open(priv_path, 'wb') as f:
            f.write(pem)
        os.chmod(priv_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600

        # Public key (JWK)
        self._public_key_jwk = self._key_to_jwk(self._public_key)
        with open(pub_path, 'w') as f:
            json.dump(self._public_key_jwk, f, indent=2)

        # Add to .gitignore
        gitignore = os.path.join(os.getcwd(), '.gitignore')
        if os.path.exists(gitignore):
            with open(gitignore, 'r') as f:
                content = f.read()
            if '.smartfield' not in content:
                with open(gitignore, 'a') as f:
                    f.write('\n# SmartField keys - NEVER commit\n.smartfield/\n')

        print(f'[SmartField] New keys generated in {keys_dir}')

    def get_public_key(self):
        """Return public key as JWK dict. Serve this to your frontend."""
        if not self._public_key_jwk:
            raise Exception('[SmartField] Not initialized. Call init() first.')
        return self._public_key_jwk

    def decrypt(self, encrypted_payload):
        """Decrypt a single SmartField encrypted value."""
        if not self._private_key:
            raise Exception('[SmartField] Not initialized. Call init() first.')
        if not encrypted_payload or not isinstance(encrypted_payload, str):
            return ''

        try:
            payload = json.loads(base64.b64decode(encrypted_payload))

            iv = base64.b64decode(payload['iv'])
            encrypted_key = base64.b64decode(payload['key'])
            encrypted_data = base64.b64decode(payload['data'])

            # Decrypt AES key with RSA
            aes_key_raw = self._private_key.decrypt(
                encrypted_key,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )

            # Decrypt data with AES-GCM
            aesgcm = AESGCM(aes_key_raw)
            decrypted = aesgcm.decrypt(iv, encrypted_data, None)

            return decrypted.decode('utf-8')
        except Exception as e:
            raise Exception(f'[SmartField] Decryption failed: {e}')

    def decrypt_fields(self, data):
        """Decrypt all encrypted fields in a dict."""
        if not self._private_key:
            raise Exception('[SmartField] Not initialized. Call init() first.')

        result = {}
        for key, value in data.items():
            if isinstance(value, str) and len(value) > 50:
                try:
                    result[key] = self.decrypt(value)
                except:
                    result[key] = value
            else:
                result[key] = value
        return result

    def _key_to_jwk(self, public_key):
        """Convert RSA public key to JWK format."""
        numbers = public_key.public_numbers()
        e = numbers.e.to_bytes((numbers.e.bit_length() + 7) // 8, 'big')
        n = numbers.n.to_bytes((numbers.n.bit_length() + 7) // 8, 'big')
        return {
            'kty': 'RSA',
            'alg': 'RSA-OAEP-256',
            'ext': True,
            'key_ops': ['encrypt'],
            'e': base64.urlsafe_b64encode(e).rstrip(b'=').decode(),
            'n': base64.urlsafe_b64encode(n).rstrip(b'=').decode()
        }
