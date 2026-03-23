/**
 * SmartField Demo — Java Server
 * Compile: javac -cp .:json.jar JavaServer.java
 * Run: java -cp .:json.jar JavaServer
 * Port: 6666
 *
 * Requires: org.json library (json.jar)
 * Download: curl -O https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar
 */

import com.sun.net.httpserver.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.io.*;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.*;
import java.security.spec.*;
import java.util.*;
import org.json.*;

public class JavaServer {
    static PrivateKey privateKey;
    static JSONObject publicKeyJWK;
    static final String KEYS_DIR = ".smartfield-java";
    static final int PORT = 6666;

    public static void main(String[] args) throws Exception {
        initKeys();

        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/sf-key", withCors(JavaServer::handlePublicKey));
        server.createContext("/login", withCors(JavaServer::handleLogin));
        server.createContext("/health", withCors(JavaServer::handleHealth));
        server.createContext("/component/", withCors(JavaServer::handleComponent));
        server.setExecutor(null);

        System.out.println("\n  SmartField Java Demo Server");
        System.out.println("  http://localhost:" + PORT);
        System.out.println("  Key: http://localhost:" + PORT + "/sf-key\n");
        server.start();
    }

    static HttpHandler withCors(HttpHandler handler) {
        return exchange -> {
            exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
            exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            handler.handle(exchange);
        };
    }

    static void handlePublicKey(HttpExchange exchange) throws IOException {
        sendJson(exchange, publicKeyJWK.toString());
    }

    static void handleHealth(HttpExchange exchange) throws IOException {
        sendJson(exchange, new JSONObject()
            .put("server", "Java (HttpServer)")
            .put("status", "ok")
            .put("port", PORT).toString());
    }

    static void handleComponent(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath().replace("/component/", "");
        File file = new File("../../../component/" + path);
        if (!file.exists()) {
            exchange.sendResponseHeaders(404, 0);
            exchange.getResponseBody().close();
            return;
        }
        byte[] bytes = Files.readAllBytes(file.toPath());
        exchange.getResponseHeaders().add("Content-Type", "application/javascript");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.getResponseBody().close();
    }

    static void handleLogin(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes());
        JSONObject data = new JSONObject(body);
        JSONObject decrypted = new JSONObject();

        for (String key : data.keySet()) {
            String value = data.getString(key);
            if ("normalPwd".equals(key)) {
                decrypted.put(key, value);
                System.out.println("[Java]   " + key + ": \"" + value + "\" <- PLAIN TEXT");
            } else if (value.length() > 50) {
                try {
                    String plain = decrypt(value);
                    decrypted.put(key, plain);
                    System.out.println("[Java]   " + key + ": \"" + plain + "\" <- DECRYPTED");
                } catch (Exception e) {
                    decrypted.put(key, "[decrypt failed: " + e.getMessage() + "]");
                    System.out.println("[Java]   " + key + ": FAILED - " + e.getMessage());
                }
            } else {
                decrypted.put(key, value);
            }
        }

        sendJson(exchange, new JSONObject()
            .put("server", "Java (HttpServer)")
            .put("status", "ok")
            .put("decrypted", decrypted)
            .put("note", "Decrypted with javax.crypto (RSA-OAEP + AES-256-GCM)")
            .toString());
    }

    static String decrypt(String encrypted) throws Exception {
        byte[] raw = Base64.getDecoder().decode(encrypted);
        JSONObject payload = new JSONObject(new String(raw));

        byte[] iv = Base64.getDecoder().decode(payload.getString("iv"));
        byte[] encKey = Base64.getDecoder().decode(payload.getString("key"));
        byte[] encData = Base64.getDecoder().decode(payload.getString("data"));

        // RSA-OAEP decrypt AES key
        Cipher rsaCipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
        OAEPParameterSpec oaepParams = new OAEPParameterSpec("SHA-256", "MGF1",
            MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT);
        rsaCipher.init(Cipher.DECRYPT_MODE, privateKey, oaepParams);
        byte[] aesKey = rsaCipher.doFinal(encKey);

        // AES-GCM decrypt
        Cipher aesCipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec gcmSpec = new GCMParameterSpec(128, iv);
        aesCipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(aesKey, "AES"), gcmSpec);
        byte[] plain = aesCipher.doFinal(encData);

        return new String(plain);
    }

    static void initKeys() throws Exception {
        File dir = new File(KEYS_DIR);
        dir.mkdirs();
        File privFile = new File(dir, "private.der");
        File pubFile = new File(dir, "public.json");

        if (privFile.exists() && pubFile.exists()) {
            byte[] privBytes = Files.readAllBytes(privFile.toPath());
            PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(privBytes);
            privateKey = KeyFactory.getInstance("RSA").generatePrivate(spec);
            publicKeyJWK = new JSONObject(Files.readString(pubFile.toPath()));
            System.out.println("[SmartField] Keys loaded from " + KEYS_DIR);
            return;
        }

        // Generate new RSA-2048
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();
        privateKey = pair.getPrivate();

        Files.write(privFile.toPath(), privateKey.getEncoded());

        // Build JWK
        RSAPublicKey pub = (RSAPublicKey) pair.getPublic();
        String n = Base64.getUrlEncoder().withoutPadding().encodeToString(toUnsignedBytes(pub.getModulus()));
        String e = Base64.getUrlEncoder().withoutPadding().encodeToString(toUnsignedBytes(pub.getPublicExponent()));

        publicKeyJWK = new JSONObject();
        publicKeyJWK.put("kty", "RSA");
        publicKeyJWK.put("alg", "RSA-OAEP-256");
        publicKeyJWK.put("ext", true);
        publicKeyJWK.put("key_ops", new JSONArray().put("encrypt"));
        publicKeyJWK.put("n", n);
        publicKeyJWK.put("e", e);

        Files.writeString(pubFile.toPath(), publicKeyJWK.toString(2));
        System.out.println("[SmartField] New keys generated in " + KEYS_DIR);
    }

    static byte[] toUnsignedBytes(BigInteger bigInt) {
        byte[] bytes = bigInt.toByteArray();
        if (bytes[0] == 0) {
            return Arrays.copyOfRange(bytes, 1, bytes.length);
        }
        return bytes;
    }

    static void sendJson(HttpExchange exchange, String json) throws IOException {
        byte[] bytes = json.getBytes();
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.getResponseBody().close();
    }
}
