package dev.smartfield

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.AttributeSet
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.widget.EditText
import android.widget.FrameLayout
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * SmartFieldView — Encrypted input field for Android
 *
 * Every keystroke is intercepted. The real value is stored in memory.
 * The EditText only ever shows cipher characters (ΣΩΔψξλ).
 * .encryptedValue returns AES-256-GCM + RSA-2048 encrypted payload.
 */
class SmartFieldView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    enum class SecurityMode { MAX, PEEK, BRIEF }

    private val CIPHER_CHARS = "ΣΩΔΨξλμπφψ§∞∑∏∂∇≈≡∫αβγδ"
    private val random = java.security.SecureRandom()

    // The real value — never displayed
    private val realValue = StringBuilder()
    // Cipher map — one cipher char per real char
    private val cipherMap = mutableListOf<Char>()

    private val handler = Handler(Looper.getMainLooper())
    private var animRunnable: Runnable? = null
    private var isPeeking = false
    private var briefIndex = -1

    // The display field
    private val display: EditText

    var securityMode: SecurityMode = SecurityMode.MAX
    var accentColor: Int = Color.parseColor("#00B88A")

    var encryptKeyUrl: String? = null

    val encryptedValue: String
        get() {
            if (!SmartFieldCrypto.hasKey() || realValue.isEmpty()) return ""
            return try { SmartFieldCrypto.encrypt(realValue.toString()) } catch (_: Exception) { "" }
        }

    val hasValue: Boolean get() = realValue.isNotEmpty()

    init {
        isFocusable = true
        isFocusableInTouchMode = true

        display = object : EditText(context) {
            override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
                outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI
                return SmartFieldInputConnection(this@SmartFieldView, true)
            }
        }.apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
            typeface = Typeface.MONOSPACE
            textSize = 16f
            setTextColor(accentColor)
            setHintTextColor(Color.parseColor("#4B5563"))
            setPadding(dp(16), dp(14), dp(48), dp(14))
            background = null
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            isSingleLine = true
            showSoftInputOnFocus = true
            isCursorVisible = true
        }

        addView(display)
        startCipherAnimation()
    }

    /** Called by our custom InputConnection when user types a character */
    internal fun onCharTyped(char: Char) {
        if (isPeeking) return
        realValue.append(char)
        val cipher = randomCipher()
        cipherMap.add(cipher)

        if (securityMode == SecurityMode.BRIEF) {
            // Show real char for 1s then replace with cipher
            cipherMap[cipherMap.lastIndex] = char
            updateDisplay()
            val idx = cipherMap.lastIndex
            briefIndex = idx
            handler.postDelayed({
                if (idx < cipherMap.size) {
                    cipherMap[idx] = randomCipher()
                    briefIndex = -1
                    updateDisplay()
                }
            }, 1000)
        } else {
            updateDisplay()
        }
    }

    /** Called by our custom InputConnection when user presses backspace */
    internal fun onBackspace() {
        if (isPeeking || realValue.isEmpty()) return
        realValue.deleteCharAt(realValue.lastIndex)
        cipherMap.removeAt(cipherMap.lastIndex)
        updateDisplay()
    }

    private fun updateDisplay() {
        val text = cipherMap.joinToString("")
        display.setText(text)
        display.setSelection(text.length)
    }

    fun fetchPublicKey(url: String, callback: ((Boolean) -> Unit)? = null) {
        encryptKeyUrl = url
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                val response = conn.inputStream.bufferedReader().readText()
                SmartFieldCrypto.importPublicKey(JSONObject(response))
                withContext(Dispatchers.Main) { callback?.invoke(true) }
            } catch (_: Exception) {
                withContext(Dispatchers.Main) { callback?.invoke(false) }
            }
        }
    }

    fun clear() {
        realValue.clear()
        cipherMap.clear()
        display.setText("")
    }

    fun setPlaceholder(text: String) { display.hint = text }

    // --- Peek mode ---
    fun startPeek() {
        isPeeking = true
        display.setText(realValue.toString())
        display.setSelection(realValue.length)
        display.setTextColor(Color.WHITE)
        handler.postDelayed({ stopPeek() }, 3000)
    }

    fun stopPeek() {
        if (!isPeeking) return
        isPeeking = false
        display.setTextColor(accentColor)
        updateDisplay()
    }

    // --- Cipher animation ---
    private fun startCipherAnimation() {
        animRunnable = object : Runnable {
            override fun run() {
                if (!isPeeking && cipherMap.isNotEmpty()) {
                    val count = (1..2).random().coerceAtMost(cipherMap.size)
                    repeat(count) {
                        val idx = (0 until cipherMap.size).random()
                        if (idx != briefIndex) cipherMap[idx] = randomCipher()
                    }
                    val pos = display.selectionStart.coerceIn(0, cipherMap.size)
                    display.setText(cipherMap.joinToString(""))
                    display.setSelection(pos.coerceIn(0, display.text.length))
                }
                handler.postDelayed(this, 150)
            }
        }
        handler.postDelayed(animRunnable!!, 150)
    }

    private fun randomCipher(): Char = CIPHER_CHARS[random.nextInt(CIPHER_CHARS.length)]
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animRunnable?.let { handler.removeCallbacks(it) }
    }

    /**
     * Custom InputConnection that intercepts all keyboard input.
     * Characters never reach the EditText directly — we control everything.
     */
    private class SmartFieldInputConnection(
        private val field: SmartFieldView,
        fullEditor: Boolean
    ) : BaseInputConnection(field.display, fullEditor) {

        private var composingLength = 0

        override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
            android.util.Log.d("SmartField", "commitText: '$text' composing=$composingLength")
            // Remove any composing chars first
            repeat(composingLength) { field.onBackspace() }
            composingLength = 0
            // Add committed chars
            text?.forEach { field.onCharTyped(it) }
            return true
        }

        override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
            android.util.Log.d("SmartField", "setComposingText: '$text' prevComposing=$composingLength")
            // Remove previous composing chars
            repeat(composingLength) { field.onBackspace() }
            composingLength = text?.length ?: 0
            // Add new composing chars
            text?.forEach { field.onCharTyped(it) }
            return true
        }

        override fun finishComposingText(): Boolean {
            android.util.Log.d("SmartField", "finishComposingText composing=$composingLength")
            composingLength = 0
            return true
        }

        override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
            android.util.Log.d("SmartField", "deleteSurrounding before=$beforeLength after=$afterLength")
            repeat(beforeLength) { field.onBackspace() }
            return true
        }

        override fun sendKeyEvent(event: KeyEvent): Boolean {
            if (event.action == KeyEvent.ACTION_DOWN) {
                android.util.Log.d("SmartField", "keyEvent: ${event.keyCode}")
                when (event.keyCode) {
                    KeyEvent.KEYCODE_DEL -> {
                        field.onBackspace()
                        return true
                    }
                    else -> {
                        val char = event.unicodeChar
                        if (char > 0) {
                            field.onCharTyped(char.toChar())
                            return true
                        }
                    }
                }
            }
            return super.sendKeyEvent(event)
        }

        override fun getEditable(): android.text.Editable? {
            return field.display.text
        }
    }
}
