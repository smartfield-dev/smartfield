<?php
/**
 * SmartField Server SDK for PHP
 *
 * Usage:
 *   require_once 'SmartField.php';
 *   $sf = new SmartField();
 *   $sf->init();
 *
 *   // Laravel route
 *   Route::get('/sf-key', fn() => response()->json($sf->getPublicKey()));
 *   Route::post('/login', function(Request $r) use ($sf) {
 *       $email = $sf->decrypt($r->input('email'));
 *       $password = $sf->decrypt($r->input('password'));
 *   });
 */

class SmartField {
    private $privateKey = null;
    private $publicKey = null;
    private $publicKeyJwk = null;
    private $keysDir = null;

    public function init($keysDir = '.smartfield') {
        $this->keysDir = $keysDir;
        $privPath = $keysDir . '/private.pem';
        $pubPath = $keysDir . '/public.json';

        if (file_exists($privPath) && file_exists($pubPath)) {
            $this->privateKey = openssl_pkey_get_private(file_get_contents($privPath));
            $this->publicKeyJwk = json_decode(file_get_contents($pubPath), true);
            echo "[SmartField] Keys loaded from $keysDir\n";
            return;
        }

        // Generate new keys
        $config = [
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ];
        $res = openssl_pkey_new($config);
        openssl_pkey_export($res, $privPem);
        $details = openssl_pkey_get_details($res);

        $this->privateKey = $res;

        // Save keys
        if (!is_dir($keysDir)) mkdir($keysDir, 0700, true);
        file_put_contents($privPath, $privPem);
        chmod($privPath, 0600);

        // Public key as JWK
        $this->publicKeyJwk = [
            'kty' => 'RSA',
            'alg' => 'RSA-OAEP-256',
            'ext' => true,
            'key_ops' => ['encrypt'],
            'n' => $this->base64UrlEncode($details['rsa']['n']),
            'e' => $this->base64UrlEncode($details['rsa']['e']),
        ];
        file_put_contents($pubPath, json_encode($this->publicKeyJwk, JSON_PRETTY_PRINT));

        // Add to .gitignore
        $gitignore = getcwd() . '/.gitignore';
        if (file_exists($gitignore) && strpos(file_get_contents($gitignore), '.smartfield') === false) {
            file_put_contents($gitignore, "\n# SmartField keys\n.smartfield/\n", FILE_APPEND);
        }

        echo "[SmartField] New keys generated in $keysDir\n";
    }

    public function getPublicKey() {
        if (!$this->publicKeyJwk) throw new Exception('[SmartField] Not initialized');
        return $this->publicKeyJwk;
    }

    public function decrypt($encryptedPayload) {
        if (!$this->privateKey) throw new Exception('[SmartField] Not initialized');
        if (empty($encryptedPayload)) return '';

        $payload = json_decode(base64_decode($encryptedPayload), true);

        $iv = base64_decode($payload['iv']);
        $encryptedKey = base64_decode($payload['key']);
        $encryptedData = base64_decode($payload['data']);

        // Decrypt AES key with RSA-OAEP
        $aesKeyRaw = '';
        if (!openssl_private_decrypt($encryptedKey, $aesKeyRaw, $this->privateKey, OPENSSL_PKCS1_OAEP_PADDING)) {
            throw new Exception('[SmartField] RSA decryption failed');
        }

        // Decrypt data with AES-256-GCM
        // GCM tag is last 16 bytes of encrypted data
        $tagLength = 16;
        $tag = substr($encryptedData, -$tagLength);
        $ciphertext = substr($encryptedData, 0, -$tagLength);

        $decrypted = openssl_decrypt($ciphertext, 'aes-256-gcm', $aesKeyRaw, OPENSSL_RAW_DATA, $iv, $tag);

        if ($decrypted === false) {
            throw new Exception('[SmartField] AES decryption failed');
        }

        return $decrypted;
    }

    public function decryptFields($data) {
        if (!$this->privateKey) throw new Exception('[SmartField] Not initialized');

        $result = [];
        foreach ($data as $key => $value) {
            if (is_string($value) && strlen($value) > 50) {
                try {
                    $result[$key] = $this->decrypt($value);
                } catch (Exception $e) {
                    $result[$key] = $value;
                }
            } else {
                $result[$key] = $value;
            }
        }
        return $result;
    }

    private function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
