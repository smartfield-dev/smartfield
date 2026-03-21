package dev.smartfield;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;
import org.json.JSONObject;

/**
 * SmartField Server SDK for Java
 *
 * Usage:
 *   SmartField sf = new SmartField();
 *   sf.init();
 *   String publicKeyJson = sf.getPublicKeyJson();
 *   String password = sf.decrypt(encryptedPayload);
 */
public class SmartField {
    private PrivateKey privateKey;
    private PublicKey publicKey;
    private String keysDir;

    public SmartField() {}

    public void init() throws Exception {
        init(".smartfield");
    }

    public void init(String keysDir) throws Exception {
        this.keysDir = keysDir;
        Path privPath = Paths.get(keysDir, "private.der");
        Path pubPath = Paths.get(keysDir, "public.der");

        if (Files.exists(privPath) && Files.exists(pubPath)) {
            // Load existing keys
            KeyFactory kf = KeyFactory.getInstance("RSA");
            privateKey = kf.generatePrivate(new PKCS8EncodedKeySpec(Files.readAllBytes(privPath)));
            publicKey = kf.generatePublic(new X509EncodedKeySpec(Files.readAllBytes(pubPath)));
            System.out.println("[SmartField] Keys loaded from " + keysDir);
            return;
        }

        // Generate new keys
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();
        privateKey = pair.getPrivate();
        publicKey = pair.getPublic();

        Files.createDirectories(Paths.get(keysDir));
        Files.write(privPath, privateKey.getEncoded());
        Files.write(pubPath, publicKey.getEncoded());

        System.out.println("[SmartField] New keys generated in " + keysDir);
    }

    public Map<String, Object> getPublicKey() {
        RSAPublicKey rsaPub = (RSAPublicKey) publicKey;
        Map<String, Object> jwk = new HashMap<>();
        jwk.put("kty", "RSA");
        jwk.put("alg", "RSA-OAEP-256");
        jwk.put("ext", true);
        jwk.put("key_ops", Collections.singletonList("encrypt"));
        jwk.put("e", base64UrlEncode(rsaPub.getPublicExponent().toByteArray()));
        jwk.put("n", base64UrlEncode(rsaPub.getModulus().toByteArray()));
        return jwk;
    }

    public String getPublicKeyJson() {
        return new JSONObject(getPublicKey()).toString();
    }

    public String decrypt(String encryptedPayload) throws Exception {
        if (encryptedPayload == null || encryptedPayload.isEmpty()) return "";

        String jsonStr = new String(Base64.getDecoder().decode(encryptedPayload), StandardCharsets.UTF_8);
        JSONObject payload = new JSONObject(jsonStr);

        byte[] iv = Base64.getDecoder().decode(payload.getString("iv"));
        byte[] encryptedKey = Base64.getDecoder().decode(payload.getString("key"));
        byte[] encryptedData = Base64.getDecoder().decode(payload.getString("data"));

        // Decrypt AES key with RSA-OAEP
        Cipher rsaCipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
        rsaCipher.init(Cipher.DECRYPT_MODE, privateKey);
        byte[] aesKeyRaw = rsaCipher.doFinal(encryptedKey);

        // Decrypt data with AES-GCM
        Cipher aesCipher = Cipher.getInstance("AES/GCM/NoPadding");
        SecretKeySpec aesKey = new SecretKeySpec(aesKeyRaw, "AES");
        GCMParameterSpec gcmSpec = new GCMParameterSpec(128, iv);
        aesCipher.init(Cipher.DECRYPT_MODE, aesKey, gcmSpec);
        byte[] decrypted = aesCipher.doFinal(encryptedData);

        return new String(decrypted, StandardCharsets.UTF_8);
    }

    public Map<String, String> decryptFields(Map<String, String> fields) {
        Map<String, String> result = new HashMap<>();
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            try {
                if (entry.getValue() != null && entry.getValue().length() > 50) {
                    result.put(entry.getKey(), decrypt(entry.getValue()));
                } else {
                    result.put(entry.getKey(), entry.getValue());
                }
            } catch (Exception e) {
                result.put(entry.getKey(), entry.getValue());
            }
        }
        return result;
    }

    private String base64UrlEncode(byte[] data) {
        // Remove leading zero byte if present
        if (data[0] == 0) {
            data = Arrays.copyOfRange(data, 1, data.length);
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }
}
