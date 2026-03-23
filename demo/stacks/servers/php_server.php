<?php
/**
 * SmartField Demo — PHP Server
 * Run: php -S localhost:8888 php_server.php
 * Port: 8888
 */

$KEYS_DIR = __DIR__ . '/.smartfield-php';
$COMPONENT_DIR = realpath(__DIR__ . '/../../../component');
$privateKey = null;
$publicKeyJWK = null;

function initKeys() {
    global $KEYS_DIR, $privateKey, $publicKeyJWK;

    if (!is_dir($KEYS_DIR)) {
        mkdir($KEYS_DIR, 0700, true);
    }

    $privPath = $KEYS_DIR . '/private.pem';
    $pubPath = $KEYS_DIR . '/public.json';

    if (file_exists($privPath) && file_exists($pubPath)) {
        $privateKey = openssl_pkey_get_private(file_get_contents($privPath));
        $publicKeyJWK = json_decode(file_get_contents($pubPath), true);
        error_log("[SmartField] Keys loaded from $KEYS_DIR");
        return;
    }

    // Generate new RSA-2048 key pair
    $config = [
        'private_key_bits' => 2048,
        'private_key_type' => OPENSSL_KEYTYPE_RSA,
    ];
    $res = openssl_pkey_new($config);
    openssl_pkey_export($res, $privPEM);
    file_put_contents($privPath, $privPEM);
    chmod($privPath, 0600);

    $privateKey = openssl_pkey_get_private($privPEM);
    $details = openssl_pkey_get_details($res);

    // Build JWK
    $n = rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '=');
    $e = rtrim(strtr(base64_encode($details['rsa']['e']), '+/', '-_'), '=');

    $publicKeyJWK = [
        'kty' => 'RSA',
        'alg' => 'RSA-OAEP-256',
        'ext' => true,
        'key_ops' => ['encrypt'],
        'n' => $n,
        'e' => $e,
    ];

    file_put_contents($pubPath, json_encode($publicKeyJWK, JSON_PRETTY_PRINT));
    error_log("[SmartField] New keys generated in $KEYS_DIR");
}

function smartfieldDecrypt($encrypted) {
    global $privateKey;

    if (empty($encrypted) || strlen($encrypted) < 50) return $encrypted;

    $payload = json_decode(base64_decode($encrypted), true);
    if (!$payload || !isset($payload['iv'], $payload['key'], $payload['data'])) {
        throw new Exception('Invalid payload format');
    }

    $iv = base64_decode($payload['iv']);
    $encKey = base64_decode($payload['key']);
    $encData = base64_decode($payload['data']);

    // RSA-OAEP decrypt AES key
    $aesKey = '';
    if (!openssl_private_decrypt($encKey, $aesKey, $privateKey, OPENSSL_PKCS1_OAEP_PADDING)) {
        throw new Exception('RSA decrypt failed');
    }

    // AES-256-GCM decrypt
    // GCM tag is the last 16 bytes of encrypted data
    $tagLength = 16;
    $tag = substr($encData, -$tagLength);
    $ciphertext = substr($encData, 0, -$tagLength);

    $decrypted = openssl_decrypt($ciphertext, 'aes-256-gcm', $aesKey, OPENSSL_RAW_DATA, $iv, $tag);
    if ($decrypted === false) {
        throw new Exception('AES-GCM decrypt failed');
    }

    return $decrypted;
}

// Initialize keys
initKeys();

// Router
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Serve component files
if (strpos($uri, '/component/') === 0) {
    global $COMPONENT_DIR;
    $file = $COMPONENT_DIR . '/' . basename(substr($uri, 11));
    if (file_exists($file)) {
        header('Content-Type: application/javascript');
        readfile($file);
        exit;
    }
    http_response_code(404);
    exit;
}

header('Content-Type: application/json');

if ($uri === '/sf-key' && $method === 'GET') {
    echo json_encode($publicKeyJWK);
    exit;
}

if ($uri === '/health' && $method === 'GET') {
    echo json_encode(['server' => 'PHP (built-in)', 'status' => 'ok', 'port' => 8888]);
    exit;
}

if ($uri === '/login' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $decrypted = [];

    foreach ($input as $key => $value) {
        if ($key === 'normalPwd') {
            $decrypted[$key] = $value;
            error_log("[PHP]   $key: \"$value\" <- PLAIN TEXT");
        } elseif (is_string($value) && strlen($value) > 50) {
            try {
                $decrypted[$key] = smartfieldDecrypt($value);
                error_log("[PHP]   $key: \"{$decrypted[$key]}\" <- DECRYPTED");
            } catch (Exception $e) {
                $decrypted[$key] = '[decrypt failed: ' . $e->getMessage() . ']';
                error_log("[PHP]   $key: FAILED - " . $e->getMessage());
            }
        } else {
            $decrypted[$key] = $value;
        }
    }

    echo json_encode([
        'server' => 'PHP (built-in server)',
        'status' => 'ok',
        'decrypted' => $decrypted,
        'note' => 'Decrypted with PHP openssl extension (RSA-OAEP + AES-256-GCM)',
    ]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
