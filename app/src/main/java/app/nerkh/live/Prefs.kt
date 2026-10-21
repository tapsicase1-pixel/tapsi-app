package app.nerkh.live

import android.content.Context

object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("nerkh", Context.MODE_PRIVATE)
    fun save(c: Context, base: String, token: String, role: String) =
        sp(c).edit().putString("base", base.trimEnd('/')).putString("token", token).putString("role", role).apply()
    fun clear(c: Context) = sp(c).edit().clear().apply()
    fun base(c: Context): String = sp(c).getString("base", "") ?: ""
    fun token(c: Context): String = sp(c).getString("token", "") ?: ""
    fun role(c: Context): String = sp(c).getString("role", "") ?: ""
    fun loggedIn(c: Context) = base(c).isNotEmpty() && token(c).isNotEmpty()
    fun soundVer(c: Context): Int = sp(c).getInt("sound_ver", -1)
    fun setSoundVer(c: Context, v: Int) = sp(c).edit().putInt("sound_ver", v).apply()
}
