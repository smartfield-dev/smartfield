// Package smartfield provides server-side decryption for SmartField components.
// ============================================================================
// SmartField Server SDK for Go — v2.7.0
// ============================================================================
//
// Copyright (c) 2026 SmartField — MIT License
// Website:  https://smartfield.dev
// Docs:     https://smartfield.dev/docs
// Support:  support@smartfield.dev
//
// Decrypts data encrypted by the <smart-field> browser component.
// Uses Go standard crypto library (crypto/rsa + crypto/aes). Zero dependencies.
// Keys are generated and stored locally. SmartField never sees your data.
//
// API:
//   sf := smartfield.New()
//   sf.Init()                    — Generate or load RSA-2048 keys
//   sf.GetPublicKey()            — Return public key as JWK map
//   sf.Decrypt(payload)          — Decrypt a single encrypted value
//   sf.DecryptFields(fields)     — Decrypt all encrypted fields
//
// Encryption: AES-256-GCM (NIST SP 800-38D) + RSA-OAEP-2048 (NIST SP 800-56B)
// ============================================================================
package smartfield
import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
)
type SmartField struct {
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	keysDir    string
}
type payload struct {
	V    int    `json:"v"`
	IV   string `json:"iv"`
	Key  string `json:"key"`
	Data string `json:"data"`
}
func New() *SmartField {
	return &SmartField{}
}
func (sf *SmartField) Init(keysDir ...string) error {
	dir := ".smartfield"
	if len(keysDir) > 0 {
		dir = keysDir[0]
	}
	sf.keysDir = dir
	privPath := filepath.Join(dir, "private.pem")
	pubPath := filepath.Join(dir, "public.pem")
	// Load existing keys
	if _, err := os.Stat(privPath); err == nil {
		privPem, err := os.ReadFile(privPath)
		if err != nil {
			return err
		}
		block, _ := pem.Decode(privPem)
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return err
		}
		sf.privateKey = key.(*rsa.PrivateKey)
		sf.publicKey = &sf.privateKey.PublicKey
		fmt.Printf("[SmartField] Keys loaded from %s\n", dir)
		return nil
	}
	// Generate new keys
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}
	sf.privateKey = privateKey
	sf.publicKey = &privateKey.PublicKey
	os.MkdirAll(dir, 0700)
	// Save private key
	privBytes, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return err
	}
	privPem := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privBytes})
	os.WriteFile(privPath, privPem, 0600)
	// Save public key
	pubBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return err
	}
	pubPem := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubBytes})
	os.WriteFile(pubPath, pubPem, 0644)
	fmt.Printf("[SmartField] New keys generated in %s\n", dir)
	return nil
}
func (sf *SmartField) GetPublicKey() map[string]interface{} {
	return map[string]interface{}{
		"kty":     "RSA",
		"alg":     "RSA-OAEP-256",
		"ext":     true,
		"key_ops": []string{"encrypt"},
		"n":       base64URLEncode(sf.publicKey.N.Bytes()),
		"e":       base64URLEncode(big.NewInt(int64(sf.publicKey.E)).Bytes()),
	}
}
func (sf *SmartField) Decrypt(encryptedPayload string) (string, error) {
	if encryptedPayload == "" {
		return "", nil
	}
	jsonBytes, err := base64.StdEncoding.DecodeString(encryptedPayload)
	if err != nil {
		return "", fmt.Errorf("base64 decode failed: %w", err)
	}
	var p payload
	if err := json.Unmarshal(jsonBytes, &p); err != nil {
		return "", fmt.Errorf("JSON parse failed: %w", err)
	}
	iv, _ := base64.StdEncoding.DecodeString(p.IV)
	encKey, _ := base64.StdEncoding.DecodeString(p.Key)
	encData, _ := base64.StdEncoding.DecodeString(p.Data)
	// Decrypt AES key with RSA-OAEP
	aesKeyRaw, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, sf.privateKey, encKey, nil)
	if err != nil {
		return "", fmt.Errorf("RSA decrypt failed: %w", err)
	}
	// Decrypt data with AES-GCM
	block, err := aes.NewCipher(aesKeyRaw)
	if err != nil {
		return "", fmt.Errorf("AES cipher failed: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("GCM failed: %w", err)
	}
	decrypted, err := gcm.Open(nil, iv, encData, nil)
	if err != nil {
		return "", fmt.Errorf("AES decrypt failed: %w", err)
	}
	return string(decrypted), nil
}
func (sf *SmartField) DecryptFields(fields map[string]string) map[string]string {
	result := make(map[string]string)
	for key, value := range fields {
		if len(value) > 50 {
			dec, err := sf.Decrypt(value)
			if err == nil {
				result[key] = dec
			} else {
				result[key] = value
			}
		} else {
			result[key] = value
		}
	}
	return result
}
func base64URLEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}
