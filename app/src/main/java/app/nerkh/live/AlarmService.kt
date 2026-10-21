package app.nerkh.live

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.net.Uri
import android.os.*
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * سرویس پیش‌زمینه‌ی ارزینو: با long-poll از سرور می‌پرسد رزرو جدیدِ دیده‌نشده هست یا نه.
 * اگر بود، مثل ساعت زنگ‌دارِ گوشی روی کانال «آلارم» (USAGE_ALARM) با بلندترین صدا و لرزش پخش می‌شود؛
 * سایلنت/لرزش گوشی آن را قطع نمی‌کند و فقط با «دیدم» (یا تصمیم روی رزرو، یا بسته شدن حساب) خاموش می‌شود.
 * قطعی شبکه/خطای سرور زنگ را خاموش نمی‌کند. صدا را مدیر از پنل انتخاب/بارگذاری می‌کند.
 */
class AlarmService : Service() {
    companion object {
        const val ACT_SEEN = "app.nerkh.live.SEEN"; const val CH_FG = "fg"; const val CH_AL = "al2"
        const val SOUND_FILE = "alarm_snd.bin"
    }

    @Volatile private var running = false
    @Volatile private var ringing = false
    @Volatile private var soundMode = "alarm"
    private var player: MediaPlayer? = null
    private var vib: Vibrator? = null
    private var wake: PowerManager.WakeLock? = null
    private val seen = HashSet<Long>()
    @Volatile private var lastIds: List<Long> = emptyList()

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, f: Int, s: Int): Int {
        createChannels()
        val n = Notification.Builder(this, CH_FG).setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("ارزینو").setContentText("اتصال زنده برقرار است").setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(1, n)
        if (i?.action == ACT_SEEN) { Thread { markSeen() }.start() }
        if (!running) { running = true; Thread { loop() }.start() }
        scheduleWatchdog()
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) { scheduleWatchdog(); super.onTaskRemoved(rootIntent) }

    override fun onDestroy() { running = false; stopRing(); scheduleWatchdog(); super.onDestroy() }

    /** اگر سیستم سرویس را کشت، چند دقیقه بعد دوباره بالا بیاید */
    private fun scheduleWatchdog() {
        try {
            if (!Prefs.loggedIn(this)) return
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = PendingIntent.getForegroundService(this, 9, Intent(this, AlarmService::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 5 * 60 * 1000L, pi)
        } catch (_: Exception) {}
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_FG, "همگام‌سازی", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel(CH_AL, "هشدار رزرو", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null, null); lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
    }

    // ---------- شبکه
    private fun http(path: String, post: String?, timeout: Int): JSONObject? {
        val base = Prefs.base(this); val tok = Prefs.token(this)
        if (base.isEmpty() || tok.isEmpty()) return null
        val c = URL("$base/api/v1$path").openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = timeout
            c.setRequestProperty("Authorization", "Bearer $tok")
            if (post != null) {
                c.requestMethod = "POST"; c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                OutputStreamWriter(c.outputStream, "UTF-8").use { it.write(post) }
            }
            // فقط وقتی سرور صریحاً «نشست باطل» گفت خروج می‌شود؛ هر خطای دیگر = تلاش دوباره (زنگ خاموش نمی‌شود)
            if (c.responseCode == 401) { Prefs.clear(this); running = false; stopRing(); stopSelf(); return null }
            return JSONObject(c.inputStream.bufferedReader().readText())
        } finally { c.disconnect() }
    }

    private fun markSeen() {
        seen.addAll(lastIds)
        stopRing()
        try { http("/alarms/seen", "{}", 10000) } catch (_: Exception) {}
    }

    /** فایل صدای دلخواه مدیر را (اگر نسخه‌اش عوض شده) دانلود می‌کند */
    private fun ensureSound(mode: String, ver: Int) {
        soundMode = mode
        if (mode != "custom") return
        val f = File(filesDir, SOUND_FILE)
        if (f.exists() && Prefs.soundVer(this) == ver) return
        try {
            val c = URL(Prefs.base(this) + "/api/v1/alarm/sound").openConnection() as HttpURLConnection
            c.connectTimeout = 8000; c.readTimeout = 30000
            c.setRequestProperty("Authorization", "Bearer " + Prefs.token(this))
            if (c.responseCode == 200) {
                val tmp = File(filesDir, SOUND_FILE + ".tmp")
                c.inputStream.use { ins -> tmp.outputStream().use { out -> ins.copyTo(out) } }
                if (tmp.length() > 0) { f.delete(); tmp.renameTo(f); Prefs.setSoundVer(this, ver) }
            }
            c.disconnect()
        } catch (_: Exception) {}
    }

    private fun loop() {
        while (running) {
            try {
                val r = http("/alarms/pending?wait=" + (if (ringing) 0 else 20), null, 35000)
                if (r == null) { Thread.sleep(8000); continue }
                val snd = r.optJSONObject("sound")
                if (snd != null) ensureSound(snd.optString("mode", "alarm"), snd.optInt("ver", 0))
                val arr = r.optJSONArray("items")
                val ids = ArrayList<Long>(); var ticker = ""
                for (k in 0 until (arr?.length() ?: 0)) {
                    val o = arr!!.getJSONObject(k); val id = o.getLong("id")
                    if (id in seen) continue
                    ids.add(id); if (ticker.isEmpty()) ticker = o.optString("ticker")
                }
                lastIds = ids
                if (ids.isEmpty()) { stopRing() }
                else if (r.optBoolean("muted")) { notifyOnly(ticker) }
                else { startRing(ticker) }
                if (ringing) { forceVolume(); keepAwake() }
                Thread.sleep(if (ringing) 2500L else if (ids.isEmpty() && (arr?.length() ?: 0) > 0) 3000L else 300L)
            } catch (e: Exception) { Thread.sleep(5000) }
        }
    }

    // ---------- زنگ
    private fun forceVolume() {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
        } catch (_: Exception) {}
    }

    private fun keepAwake() {
        try {
            if (wake?.isHeld != true) {
                wake = (getSystemService(POWER_SERVICE) as PowerManager)
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arzino:ring").apply { acquire(15 * 60 * 1000L) }
            }
        } catch (_: Exception) {}
    }

    private fun alarmIntent(ticker: String): PendingIntent {
        val i = Intent(this, AlarmActivity::class.java).putExtra("ticker", ticker)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(this, 7, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun notifyOnly(ticker: String) {
        stopRing()
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(2, Notification.Builder(this, CH_AL).setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("ارزینو").setContentText(ticker).setAutoCancel(true).setContentIntent(alarmIntent(ticker)).build())
    }

    private fun buildPlayer(): MediaPlayer {
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val mp = MediaPlayer()
        mp.setAudioAttributes(attrs)
        var ok = false
        val f = File(filesDir, SOUND_FILE)
        if (soundMode == "custom" && f.exists()) {
            try {
                FileInputStream(f).use { mp.setDataSource(it.fd) }
                mp.isLooping = true; mp.prepare(); ok = true
            } catch (_: Exception) { mp.reset(); mp.setAudioAttributes(attrs) }
        }
        if (!ok) {
            val type = when (soundMode) {
                "ringtone" -> RingtoneManager.TYPE_RINGTONE
                "notification" -> RingtoneManager.TYPE_NOTIFICATION
                else -> RingtoneManager.TYPE_ALARM
            }
            val uri: Uri = RingtoneManager.getDefaultUri(type) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            mp.setDataSource(this, uri); mp.isLooping = true; mp.prepare()
        }
        mp.setOnErrorListener { _, _, _ -> try { player?.release() } catch (_: Exception) {}; player = null; true }
        mp.start()
        return mp
    }

    private fun startRing(ticker: String) {
        val nm = getSystemService(NotificationManager::class.java)
        val pi = alarmIntent(ticker)
        nm.notify(2, Notification.Builder(this, CH_AL).setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("🔔 رزرو جدید").setContentText(ticker + " — برای قطع زنگ «دیدم» را بزنید")
            .setCategory(Notification.CATEGORY_ALARM).setOngoing(true)
            .setFullScreenIntent(pi, true).setContentIntent(pi)
            .addAction(Notification.Action.Builder(0, "دیدم",
                PendingIntent.getService(this, 8, Intent(this, AlarmService::class.java).setAction(ACT_SEEN),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build()).build())
        if (ringing && player != null) return
        val first = !ringing
        ringing = true
        try {
            forceVolume(); keepAwake()
            try { player?.release() } catch (_: Exception) {}
            player = buildPlayer()
            vib = if (Build.VERSION.SDK_INT >= 31) (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                  else (getSystemService(VIBRATOR_SERVICE) as Vibrator)
            vib?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 800, 600), 0))
        } catch (_: Exception) {}
        if (first) {
            try { startActivity(Intent(this, AlarmActivity::class.java).putExtra("ticker", ticker).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }
    }

    private fun stopRing() {
        if (!ringing && player == null) { try { getSystemService(NotificationManager::class.java).cancel(2) } catch (_: Exception) {}; return }
        ringing = false
        try { player?.stop() } catch (_: Exception) {}
        try { player?.release() } catch (_: Exception) {}
        player = null
        try { vib?.cancel() } catch (_: Exception) {}
        try { if (wake?.isHeld == true) wake?.release() } catch (_: Exception) {}
        try { getSystemService(NotificationManager::class.java).cancel(2) } catch (_: Exception) {}
        try { sendBroadcast(Intent(AlarmActivity.ACT_CLOSE).setPackage(packageName)) } catch (_: Exception) {}
    }
}
