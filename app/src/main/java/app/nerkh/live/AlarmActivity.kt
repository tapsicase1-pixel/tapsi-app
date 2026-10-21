package app.nerkh.live

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** صفحه‌ی تمام‌صفحه‌ی زنگ؛ تا وقتی «دیدم» زده نشود زنگ ادامه دارد (با Back بسته نمی‌شود). */
class AlarmActivity : Activity() {
    companion object { const val ACT_CLOSE = "app.nerkh.live.CLOSE_ALARM" }

    private val closer = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) { finish() }
    }

    private fun pill(color: String): GradientDrawable =
        GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = 70f }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        val ticker = intent.getStringExtra("ticker") ?: "رزرو جدید"
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0B1220")); setPadding(48, 48, 48, 48)
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        root.addView(TextView(this).apply {
            text = "🔔"; textSize = 64f; gravity = Gravity.CENTER
        })
        root.addView(TextView(this).apply {
            text = "رزرو جدید"; textSize = 30f; setTextColor(Color.parseColor("#F5C242")); gravity = Gravity.CENTER
        })
        root.addView(TextView(this).apply {
            text = ticker; textSize = 18f; setTextColor(Color.parseColor("#9FB0C3")); gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 24 })
        root.addView(Button(this).apply {
            text = "دیدم"; textSize = 24f; setTextColor(Color.WHITE); background = pill("#1FAA59")
            setOnClickListener {
                startService(Intent(this@AlarmActivity, AlarmService::class.java).setAction(AlarmService.ACT_SEEN))
                finish()
            }
        }, LinearLayout.LayoutParams(-1, 230).apply { topMargin = 96 })
        root.addView(Button(this).apply {
            text = "ورود به برنامه"; textSize = 16f; setTextColor(Color.WHITE); background = pill("#27384B")
            setOnClickListener { startActivity(Intent(this@AlarmActivity, MainActivity::class.java)); finish() }
        }, LinearLayout.LayoutParams(-1, 140).apply { topMargin = 32 })
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(closer, IntentFilter(ACT_CLOSE), Context.RECEIVER_NOT_EXPORTED)
        else registerReceiver(closer, IntentFilter(ACT_CLOSE))
    }
    override fun onDestroy() { try { unregisterReceiver(closer) } catch (_: Exception) {}; super.onDestroy() }
    override fun onNewIntent(i: Intent?) { super.onNewIntent(i); setIntent(i) }
    override fun onBackPressed() { /* با Back بسته نمی‌شود؛ فقط «دیدم» */ }
}
