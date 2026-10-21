package app.nerkh.live

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.ValueCallback

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        web.webViewClient = WebViewClient()
        web.settings.allowContentAccess = true
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(w: WebView?, cb: ValueCallback<Array<Uri>>?, p: FileChooserParams?): Boolean {
                fileCb?.onReceiveValue(null); fileCb = cb
                return try { startActivityForResult(p!!.createIntent(), 77); true } catch (e: Exception) { fileCb = null; false }
            }
        }
        web.addJavascriptInterface(Bridge(), "Android")
        setContentView(web)
        web.loadUrl("file:///android_asset/www/index.html")
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        if (Prefs.loggedIn(this)) startAlarm()
    }

    override fun onActivityResult(rc: Int, res: Int, data: Intent?) {
        if (rc == 77) { fileCb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null }
        else super.onActivityResult(rc, res, data)
    }

    private fun startAlarm() {
        val s = Intent(this, AlarmService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(s) else startService(s)
    }

    override fun onBackPressed() {
        web.evaluateJavascript("window.onBackKey && window.onBackKey()") { r -> if (r != "true") super.onBackPressed() }
    }

    inner class Bridge {
        @JavascriptInterface fun saveSession(base: String, token: String, role: String) {
            Prefs.save(this@MainActivity, base, token, role); runOnUiThread { startAlarm() }
        }
        @JavascriptInterface fun clearSession() {
            Prefs.clear(this@MainActivity); stopService(Intent(this@MainActivity, AlarmService::class.java))
        }
        @JavascriptInterface fun seen() {
            startService(Intent(this@MainActivity, AlarmService::class.java).setAction(AlarmService.ACT_SEEN))
        }
        @JavascriptInterface fun isNative(): Boolean = true
        @JavascriptInterface fun batterySettings() {
            runOnUiThread {
                try {
                    val pm = getSystemService(POWER_SERVICE) as PowerManager
                    if (!pm.isIgnoringBatteryOptimizations(packageName))
                        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                    else startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                } catch (_: Exception) {}
            }
        }
        @JavascriptInterface fun fullScreenSettings() {
            runOnUiThread {
                try {
                    if (Build.VERSION.SDK_INT >= 34)
                        startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
                } catch (_: Exception) {}
            }
        }
    }
}
