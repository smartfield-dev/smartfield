// SmartField Demo — Go Server
// Run: go run go_server.go
// Port: 7777
package main

import (
	"crypto"
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
	"io"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
)

var privateKey *rsa.PrivateKey
var publicKeyJWK map[string]interface{}

func main() {
	keysDir := filepath.Join(".", ".smartfield-go")
	initKeys(keysDir)

	mux := http.NewServeMux()
	mux.HandleFunc("/sf-key", corsWrap(handlePublicKey))
	mux.HandleFunc("/login", corsWrap(handleLogin))
	mux.HandleFunc("/health", corsWrap(handleHealth))
	// Serve component
	componentDir := filepath.Join("..", "..", "..", "component")
	mux.Handle("/component/", http.StripPrefix("/component/", http.FileServer(http.Dir(componentDir))))

	fmt.Println("\n  SmartField Go Demo Server")
	fmt.Println("  http://localhost:7777")
	fmt.Println("  Key: http://localhost:7777/sf-key\n")
	http.ListenAndServe(":7777", mux)
}

func corsWrap(handler func(http.ResponseWriter, *http.Request)) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		handler(w, r)
	}
}

func handlePublicKey(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(publicKeyJWK)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"server": "Go (net/http)", "status": "ok", "port": 7777})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var data map[string]string
	json.Unmarshal(body, &data)

	decrypted := make(map[string]string)
	for key, value := range data {
		if key == "normalPwd" {
			decrypted[key] = value
			fmt.Printf("[Go]   %s: \"%s\" <- PLAIN TEXT\n", key, value)
		} else if len(value) > 50 {
			plain, err := decrypt(value)
			if err != nil {
				decrypted[key] = "[decrypt failed: " + err.Error() + "]"
				fmt.Printf("[Go]   %s: FAILED - %s\n", key, err.Error())
			} else {
				decrypted[key] = plain
				fmt.Printf("[Go]   %s: \"%s\" <- DECRYPTED\n", key, plain)
			}
		} else {
			decrypted[key] = value
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"server":    "Go (net/http)",
		"status":    "ok",
		"decrypted": decrypted,
		"note":      "Decrypted with Go crypto/rsa + crypto/aes (AES-256-GCM)",
	})
}

func decrypt(encrypted string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}

	var payload struct {
		V    int    `json:"v"`
		IV   string `json:"iv"`
		Key  string `json:"key"`
		Data string `json:"data"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", fmt.Errorf("json parse: %w", err)
	}

	encKey, _ := base64.StdEncoding.DecodeString(payload.Key)
	iv, _ := base64.StdEncoding.DecodeString(payload.IV)
	encData, _ := base64.StdEncoding.DecodeString(payload.Data)

	// RSA-OAEP decrypt AES key
	aesKey, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, privateKey, encKey, nil)
	if err != nil {
		return "", fmt.Errorf("RSA decrypt: %w", err)
	}

	// AES-GCM decrypt
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", fmt.Errorf("AES cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("GCM: %w", err)
	}
	plain, err := gcm.Open(nil, iv, encData, nil)
	if err != nil {
		return "", fmt.Errorf("AES-GCM decrypt: %w", err)
	}

	return string(plain), nil
}

func initKeys(dir string) {
	os.MkdirAll(dir, 0700)
	privPath := filepath.Join(dir, "private.pem")
	pubPath := filepath.Join(dir, "public.json")

	if _, err := os.Stat(privPath); err == nil {
		// Load existing
		data, _ := os.ReadFile(privPath)
		block, _ := pem.Decode(data)
		key, _ := x509.ParsePKCS8PrivateKey(block.Bytes)
		privateKey = key.(*rsa.PrivateKey)

		pubData, _ := os.ReadFile(pubPath)
		json.Unmarshal(pubData, &publicKeyJWK)
		fmt.Printf("[SmartField] Keys loaded from %s\n", dir)
		return
	}

	// Generate new
	var err error
	privateKey, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}

	// Save private key
	privBytes, _ := x509.MarshalPKCS8PrivateKey(privateKey)
	privPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privBytes})
	os.WriteFile(privPath, privPEM, 0600)

	// Build JWK
	pub := privateKey.PublicKey
	publicKeyJWK = map[string]interface{}{
		"kty":     "RSA",
		"alg":     "RSA-OAEP-256",
		"ext":     true,
		"key_ops": []string{"encrypt"},
		"n":       base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		"e":       base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
	}

	pubJSON, _ := json.MarshalIndent(publicKeyJWK, "", "  ")
	os.WriteFile(pubPath, pubJSON, 0644)
	fmt.Printf("[SmartField] New keys generated in %s\n", dir)
}

func init() {
	_ = crypto.SHA256
}
