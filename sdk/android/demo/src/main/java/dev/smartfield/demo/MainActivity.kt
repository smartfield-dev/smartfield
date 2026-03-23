package dev.smartfield.demo

import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import dev.smartfield.SmartFieldView
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    // Change this to your server URL
    // For local testing with emulator, use 10.0.2.2 (host machine's localhost)
    private val SERVER_URL = "http://10.0.2.2:3333"

    private lateinit var standardInput: EditText
    private lateinit var sfMax: SmartFieldView
    private lateinit var sfPeek: SmartFieldView
    private lateinit var sfBrief: SmartFieldView
    private lateinit var submitBtn: MaterialButton
    private lateinit var resultText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        standardInput = findViewById(R.id.standardInput)
        sfMax = findViewById(R.id.sfMax)
        sfPeek = findViewById(R.id.sfPeek)
        sfBrief = findViewById(R.id.sfBrief)
        submitBtn = findViewById(R.id.submitBtn)
        resultText = findViewById(R.id.resultText)

        // Configure security modes
        sfMax.securityMode = SmartFieldView.SecurityMode.MAX
        sfMax.setPlaceholder("MAX — fully encrypted...")

        sfPeek.securityMode = SmartFieldView.SecurityMode.PEEK
        sfPeek.setPlaceholder("PEEK — hold to reveal...")

        sfBrief.securityMode = SmartFieldView.SecurityMode.BRIEF
        sfBrief.setPlaceholder("BRIEF — flash then hide...")

        // Fetch server public key
        val keyUrl = "$SERVER_URL/api/public-key"
        sfMax.fetchPublicKey(keyUrl) { success ->
            if (success) {
                submitBtn.isEnabled = true
                submitBtn.text = "Submit to Server"
            } else {
                submitBtn.text = "Key fetch failed — check server"
            }
        }
        sfPeek.fetchPublicKey(keyUrl)
        sfBrief.fetchPublicKey(keyUrl)

        // Submit
        submitBtn.isEnabled = false
        submitBtn.text = "Loading key..."

        submitBtn.setOnClickListener {
            submitToServer()
        }
    }

    private fun submitToServer() {
        resultText.visibility = View.VISIBLE
        resultText.text = "Sending..."

        val body = JSONObject().apply {
            put("standard_password", standardInput.text.toString())
            put("sf_max", sfMax.encryptedValue)
            put("sf_peek", sfPeek.encryptedValue)
            put("sf_brief", sfBrief.encryptedValue)
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$SERVER_URL/api/stack-login")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                conn.outputStream.write(body.toString().toByteArray())
                val response = conn.inputStream.bufferedReader().readText()
                val json = JSONObject(response)

                withContext(Dispatchers.Main) {
                    resultText.text = json.toString(2)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    resultText.text = "Error: ${e.message}\n\nMake sure Node server is running:\ncd api && node server-sdk.js"
                }
            }
        }
    }
}
