package dev.smartfield

import android.util.Base64
import org.json.JSONObject
import java.security.KeyFactory
import java.security.PublicKey
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import java.math.BigInteger
import java.security.spec.RSAPublicKeySpec
import java.security.spec.MGF1ParameterSpec

/**
 * SmartField Crypto Engine for Android
 * AES-256-GCM (data) + RSA-OAEP-2048 (key exchange)
 * Same encryption format as the web component — server SDKs can decrypt both.
 */
object SmartFieldCrypto {

    private var serverPublicKey: PublicKey? = null

    /**
     * Import RSA public key from JWK format (fetched from server /sf-key endpoint)
     */
    fun importPublicKey(jwk: JSONObject): PublicKey {
        val nBase64 = jwk.getString("n")
        val eBase64 = jwk.getString("e")

        // Base64url decode
        val nBytes = base64UrlDecode(nBase64)
        val eBytes = base64UrlDecode(eBase64)

        val modulus = BigInteger(1, nBytes)
        val exponent = BigInteger(1, eBytes)

        val spec = RSAPublicKeySpec(modulus, exponent)
        val factory = KeyFactory.getInstance("RSA")
        val key = factory.generatePublic(spec)
        serverPublicKey = key
        return key
    }

    /**
     * Encrypt plaintext using AES-256-GCM + RSA-OAEP-2048
     * Returns base64-encoded JSON payload identical to the web component format:
     * { v: 1, iv: base64, key: base64, data: base64 }
     */
    fun encrypt(plaintext: String, publicKey: PublicKey? = null): String {
        val key = publicKey ?: serverPublicKey
            ?: throw IllegalStateException("No public key. Call importPublicKey() or fetchPublicKey() first.")

        // Generate random AES-256 key
        val aesKeyGen = KeyGenerator.getInstance("AES")
        aesKeyGen.init(256)
        val aesKey = aesKeyGen.generateKey()

        // Generate random 12-byte IV
        val iv = ByteArray(12)
        java.security.SecureRandom().nextBytes(iv)

        // AES-256-GCM encrypt
        val aesCipher = Cipher.getInstance("AES/GCM/NoPadding")
        aesCipher.init(Cipher.ENCRYPT_MODE, aesKey, GCMParameterSpec(128, iv))
        val encryptedData = aesCipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        // RSA-OAEP encrypt the AES key
        val rsaCipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding")
        val oaepParams = OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT)
        rsaCipher.init(Cipher.ENCRYPT_MODE, key, oaepParams)
        val encryptedKey = rsaCipher.doFinal(aesKey.encoded)

        // Build payload (same format as web component)
        val payload = JSONObject().apply {
            put("v", 1)
            put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
            put("key", Base64.encodeToString(encryptedKey, Base64.NO_WRAP))
            put("data", Base64.encodeToString(encryptedData, Base64.NO_WRAP))
        }

        return Base64.encodeToString(payload.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    }

    /**
     * Check if a public key has been loaded
     */
    fun hasKey(): Boolean = serverPublicKey != null

    private fun base64UrlDecode(input: String): ByteArray {
        // Convert base64url to standard base64
        var base64 = input.replace('-', '+').replace('_', '/')
        // Add padding
        when (base64.length % 4) {
            2 -> base64 += "=="
            3 -> base64 += "="
        }
        return Base64.decode(base64, Base64.DEFAULT)
    }
}
