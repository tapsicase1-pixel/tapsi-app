/* ارزینو — کلاینت وب داخل WebView.  همه‌ی آدرس‌ها: /api/v1/...  */
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const NATIVE = typeof Android !== "undefined";
const BASE = (localStorage.getItem("base") || window.API_BASE || "").replace(/\/$/, "");
const API = BASE + "/api/v1";
const fa = (n, d = 0) => Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d });
let S = JSON.parse(localStorage.getItem("sess") || "null");   // {token, role, name, can_mute}
let nav = ["home"];

function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add("hidden"), 2800); }
function show(id) { $$(".page").forEach((p) => p.classList.add("hidden")); $("#" + id).classList.remove("hidden"); nav.push(id); }
function back() { if (nav.length > 1) { nav.pop(); const id = nav[nav.length - 1]; nav.pop(); show(id); if (id === "home") stopFeed(); return true; } return false; }
window.onBackKey = () => (nav[nav.length - 1] !== "home" ? back() : false);
$$("[data-back]").forEach((b) => (b.onclick = back));

async function api(path, method = "GET", body, token = S && S.token, timeout = 35000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(API + path, { method, signal: ctl.signal, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && S && token && token === S.token) { logout(true); }   // پاسخ کهنه‌ی نشست قبلی نباید نشست جدید را ببندد
    return await r.json();
  } catch (e) { return { ok: false, error: "network" }; } finally { clearTimeout(t); }
}

/* ---------------- قیمت‌ها ---------------- */
const hist = JSON.parse(localStorage.getItem("hist") || "{}");
let prices = [], curSym = localStorage.getItem("sym") || "price_dollar_rl", curRes = "60";
function spark(c, arr, up) {
  const w = (c.width = 140), h = (c.height = 56), x = c.getContext("2d"); x.clearRect(0, 0, w, h);
  if (arr.length < 2) return;
  const mn = Math.min(...arr), mx = Math.max(...arr) || 1, r = mx - mn || 1;
  x.beginPath(); arr.forEach((v, i) => { const px = (i / (arr.length - 1)) * w, py = h - 4 - ((v - mn) / r) * (h - 8); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.strokeStyle = up ? "#2ecc71" : "#ff5c5c"; x.lineWidth = 3; x.stroke();
}
const cur = () => prices.find((p) => p.sym === curSym) || prices[0];
async function loadPrices() {
  const r = await api("/market/prices", "GET", null, null, 12000);
  if (!r.ok || !r.items.length) { $("#upd").textContent = "عدم اتصال"; return; }
  prices = r.items; $("#upd").textContent = new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  if (!prices.find((p) => p.sym === curSym)) curSym = prices[0].sym;
  const box = $("#list"); box.innerHTML = "";
  prices.forEach((p) => {
    const h = (hist[p.sym] = (hist[p.sym] || []).concat(p.price).slice(-40));
    const d = document.createElement("div"); d.className = "item" + (p.sym === curSym ? " sel" : "");
    const up = (p.change || 0) >= 0;
    d.innerHTML = `<div class="nm">${p.name}<small>${p.unit}</small></div><canvas></canvas><div class="pr ${up ? "up" : "down"}">${fa(p.price, p.price < 100 ? 2 : 0)}<small style="display:block;font-size:11px">${up ? "▲" : "▼"} ${fa(Math.abs(p.change || 0), 2)}٪</small></div>`;
    spark(d.querySelector("canvas"), h, up);
    d.onclick = () => { selectSym(p.sym); $(".scroll").scrollTo({ top: 0, behavior: "smooth" }); };
    box.appendChild(d);
  });
  localStorage.setItem("hist", JSON.stringify(hist));
  renderChips(); renderHead(); loadCandles();
}
function renderChips() {
  const c = $("#chips"); c.innerHTML = "";
  prices.forEach((p) => { const b = document.createElement("button"); b.className = "chip" + (p.sym === curSym ? " on" : ""); b.textContent = p.name; b.onclick = () => selectSym(p.sym); c.appendChild(b); });
}
function selectSym(s) { curSym = s; localStorage.setItem("sym", s); renderChips(); renderHead(); $$(".item").forEach((e, i) => e.classList.toggle("sel", prices[i] && prices[i].sym === s)); loadCandles(true); }
function renderHead() {
  const p = cur(); if (!p) return; const up = (p.change || 0) >= 0;
  $("#hName").textContent = p.name; $("#hUnit").textContent = p.unit; $("#hPrice").textContent = fa(p.price, p.price < 100 ? 2 : 0);
  const c = $("#hChg"); c.textContent = (up ? "▲ " : "▼ ") + fa(Math.abs(p.change || 0), 2) + "٪"; c.className = "chg " + (up ? "up" : "down");
}
$$("#tfs button").forEach((b) => (b.onclick = () => { $$("#tfs button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); curRes = b.dataset.r; loadCandles(true); }));

/* ---------------- نمودار شمعی ---------------- */
let CH = { candles: [], demo: true, key: "" };
const histCache = {};
function rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function toCandles(pts, n) {
  if (pts.length < 8) return null;
  const size = Math.max(1, Math.floor(pts.length / n)), out = [];
  for (let i = 0; i < pts.length; i += size) { const sl = pts.slice(i, i + size).map((a) => a[1]); out.push({ o: sl[0], c: sl[sl.length - 1], h: Math.max(...sl), l: Math.min(...sl) }); }
  return out.slice(-n);
}
function demoCandles(p, n) {
  const r = rng(p.sym + curRes), vol = { "15": 0.0025, "30": 0.0035, "60": 0.005, "240": 0.009, D: 0.016 }[curRes] || 0.005;
  let v = 1, arr = [];
  for (let i = 0; i < n; i++) { const o = v; v = v * (1 + (r() - 0.48) * vol * 2); const c = v; arr.push({ o, c, h: Math.max(o, c) * (1 + r() * vol), l: Math.min(o, c) * (1 - r() * vol) }); }
  const k = p.price / arr[arr.length - 1].c; arr.forEach((c) => { c.o *= k; c.c *= k; c.h *= k; c.l *= k; });
  return arr;
}
async function loadCandles(force) {
  const p = cur(); if (!p) return;
  const key = p.sym + "|" + curRes, now = Date.now(); let pts = histCache[key];
  if (force || !pts || now - pts.t > 30000) {
    const r = await api("/market/history?sym=" + p.sym + "&res=" + curRes, "GET", null, null, 15000);
    pts = histCache[key] = { t: now, pts: r.points || [] };
  }
  const c = toCandles(pts.pts, 40);
  CH = { candles: c || demoCandles(p, 40), demo: !c, key };
  $("#demoTag").classList.toggle("hidden", !CH.demo);
  drawChart(0);
}
function fmtAxis(v) { return fa(v, v < 100 ? 2 : 0); }
function drawChart(t) {
  const c = $("#hcv"); if (!c || !CH.candles.length || $("#home").classList.contains("hidden")) return;
  const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.font = "11px Vazirmatn,sans-serif";
  const cs = CH.candles, padR = 58, padT = 10, padB = 18, pw = W - padR, ph = H - padT - padB;
  let mn = Math.min(...cs.map((a) => a.l)), mx = Math.max(...cs.map((a) => a.h)); const m = (mx - mn) * 0.08 || mx * 0.01; mn -= m; mx += m;
  const Y = (v) => padT + (1 - (v - mn) / (mx - mn)) * ph;
  x.strokeStyle = "#1c2a40"; x.fillStyle = "#7d8da0"; x.lineWidth = 1; x.textAlign = "left";
  for (let i = 0; i <= 4; i++) { const y = padT + (ph * i) / 4; x.beginPath(); x.moveTo(0, y); x.lineTo(pw, y); x.stroke(); x.fillText(fmtAxis(mx - ((mx - mn) * i) / 4), pw + 6, y + 4); }
  const cw = pw / cs.length;
  cs.forEach((a, i) => {
    const cx = i * cw + cw / 2, up = a.c >= a.o, col = up ? "#2ecc71" : "#ff5c5c", bw = Math.max(2, cw * 0.6);
    x.strokeStyle = col; x.fillStyle = col; x.beginPath(); x.moveTo(cx, Y(a.h)); x.lineTo(cx, Y(a.l)); x.stroke();
    const y1 = Y(Math.max(a.o, a.c)), y2 = Y(Math.min(a.o, a.c)); x.fillRect(cx - bw / 2, y1, bw, Math.max(1.5, y2 - y1));
  });
  const last = cs[cs.length - 1], ly = Y(last.c), up = last.c >= last.o, col = up ? "#2ecc71" : "#ff5c5c";
  x.setLineDash([4, 4]); x.strokeStyle = col; x.beginPath(); x.moveTo(0, ly); x.lineTo(pw, ly); x.stroke(); x.setLineDash([]);
  x.fillStyle = col; x.fillRect(pw + 1, ly - 9, padR - 2, 18); x.fillStyle = "#06101c"; x.fillText(fmtAxis(last.c), pw + 4, ly + 4);
  const pulse = 3 + 2.5 * Math.abs(Math.sin(t / 500)), lx = (cs.length - 0.5) * cw;
  x.globalAlpha = 0.35; x.fillStyle = col; x.beginPath(); x.arc(lx, ly, pulse + 4, 0, 7); x.fill(); x.globalAlpha = 1; x.beginPath(); x.arc(lx, ly, 3, 0, 7); x.fill();
}
let lastFrame = 0;
function loopChart(ts) { if (ts - lastFrame > 60) { lastFrame = ts; drawChart(ts); } requestAnimationFrame(loopChart); }
window.addEventListener("resize", () => drawChart(0));

/* ---------------- جستجو = ورود ---------------- */
let kind = "buy", resetTok = null;
function openSearch(k) { kind = k; resetTok = null; $("#seTitle").textContent = "جستجو"; $("#seInput").placeholder = "جستجو…"; $("#seGo").textContent = "جستجو"; $("#seInput").value = ""; $("#seMsg").textContent = ""; show("search"); setTimeout(() => $("#seInput").focus(), 200); }
$("#btnBuy").onclick = () => openSearch("buy");
$("#btnSell").onclick = () => openSearch("sell");
const ERR = { bad_code: "نتیجه‌ای یافت نشد", locked: "تعداد تلاش زیاد است؛ کمی بعد دوباره", account_closed: "نتیجه‌ای یافت نشد", masseur_not_registered: "نتیجه‌ای یافت نشد", network: "اتصال برقرار نیست" };
async function doSearch() {
  const code = $("#seInput").value.trim(); if (!code) return;
  if (resetTok) return doReset(code);
  const dev = localStorage.getItem("dev") || (localStorage.setItem("dev", Math.random().toString(36).slice(2) + Date.now()), localStorage.getItem("dev"));
  const r = await api("/auth/login", "POST", { code, kind: kind === "buy" ? "buy" : "sell", device: dev }, null);
  if (r.reset) { resetTok = r.reset_token; $("#seInput").value = ""; $("#seTitle").textContent = "رمز مادر جدید"; $("#seInput").placeholder = "رمز مادر جدید (حداقل ۴ حرف)"; $("#seGo").textContent = "ثبت رمز جدید"; $("#seMsg").textContent = "بازنشانی انجام شد؛ رمز جدید را وارد کن."; return; }
  if (!r.ok) { $("#seMsg").textContent = ERR[r.error] || "نتیجه‌ای یافت نشد"; return; }
  S = { token: r.token, role: r.role, name: r.name, can_mute: r.can_mute, must_change: !!r.must_change }; localStorage.setItem("sess", JSON.stringify(S));
  localStorage.setItem("base", BASE);
  if (NATIVE) Android.saveSession(BASE, r.token, r.role);
  if (r.must_change) toast(r.role === "masseur" ? "رمز فعلی همان کد ثبت‌نام توست؛ از «تنظیمات» عوضش کن" : "رمز مادر هنوز پیش‌فرض است؛ از «حساب‌ها» عوضش کن");
  nav.pop(); openPanel(r.must_change);
}
async function doReset(np) {
  const r = await api("/auth/master/reset", "POST", { reset_token: resetTok, new_password: np }, null);
  if (r.ok) { resetTok = null; toast("رمز جدید ثبت شد؛ دوباره وارد شو"); openSearch("sell"); } else $("#seMsg").textContent = PWERR[r.error] || "نشد: " + (r.error || "");
}
$("#seGo").onclick = doSearch; $("#seInput").onkeydown = (e) => e.key === "Enter" && doSearch();
function logout(silent) { if (S) api("/auth/logout", "POST"); alarmGen++; S = null; localStorage.removeItem("sess"); localStorage.removeItem("after"); if (NATIVE) Android.clearSession(); stopFeed(); nav = ["home"]; show("home"); nav = ["home"]; if (!silent) toast("خارج شدی"); }
$("#pnOut").onclick = () => logout();

/* ---------------- پنل ---------------- */
const staff = () => S && S.role !== "masseur";
function openPanel(mustChange) {
  if (!S) return; show("panel");
  $("#pnTitle").textContent = (S.role === "masseur" ? "پنل — " : S.role === "admin" ? "مدیریت — " : "اپراتور — ") + (S.name || "");
  $$("[data-staff]").forEach((b) => b.classList.toggle("hidden", !staff()));
  $("#accAdmin").classList.toggle("hidden", S.role !== "admin");
  $("#muteCard").classList.toggle("hidden", !S.can_mute);
  $("#soundCard").classList.toggle("hidden", S.role !== "admin");
  $("#pwCard").classList.toggle("hidden", S.role !== "masseur");
  $("#pwHint").textContent = mustChange ? "رمز فعلی شما همان کد ثبت‌نام شماست. لطفاً یک رمز تازه بگذارید." : "";
  tab(mustChange ? (S.role === "masseur" ? "set" : "acc") : "feed"); startFeed(); pollAlarms();
}
function tab(t) { $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); $$(".tab").forEach((e) => e.classList.add("hidden")); $("#t-" + t).classList.remove("hidden"); if (t === "inbox") loadThreads(); if (t === "acc") loadAcc(); if (t === "ub") loadUb(); if (t === "set") loadSound(); }
$$("#tabs button").forEach((b) => (b.onclick = () => tab(b.dataset.t)));

/* --- آینه‌ی ربات --- */
let feedOn = false, feedGen = 0, after = 0, replyTo = null; let bubbles = {};
function stopFeed() { feedOn = false; feedGen++; }
async function startFeed() {
  if (feedOn) return; feedOn = true; const gen = ++feedGen; $("#msgs").innerHTML = ""; $("#rkb").innerHTML = ""; bubbles = {};
  const first = await api("/feed?after=0", "GET"); after = first.ok && first.items.length ? first.items[first.items.length - 1].id : 0;
  await api("/say", "POST", { text: "/start" });
  while (feedOn && S && gen === feedGen) {
    const r = await api("/feed?after=" + after + "&wait=20", "GET");
    if (!r.ok) { await new Promise((z) => setTimeout(z, 4000)); continue; }
    if (gen !== feedGen) return;
    r.items.forEach((it) => { after = Math.max(after, it.id); applyItem(it); });
  }
}
function applyItem(it) {
  const box = $("#msgs");
  if (it.op === "toast") return toast(it.text);
  if (it.op === "del") { bubbles[it.mid] && bubbles[it.mid].remove(); delete bubbles[it.mid]; return; }
  if (it.rkb !== null && it.rkb !== undefined) {
    const k = $("#rkb"); k.innerHTML = "";
    it.rkb.flat().forEach((t) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => sendText(t); k.appendChild(b); });
  }
  let el = bubbles[it.mid];
  if (it.op === "edit" && !el) return;
  if (!el) { el = document.createElement("div"); el.className = "bub"; box.appendChild(el); bubbles[it.mid] = el; }
  if (it.text || it.op === "new") { el.dataset.mid = it.mid; el.innerHTML = ""; const tx = document.createElement("div"); tx.textContent = it.text; el.appendChild(tx); }
  const old = el.querySelector(".ib"); if (it.kb) { old && old.remove(); const ib = document.createElement("div"); ib.className = "ib";
    it.kb.flat().forEach((b) => { const x = document.createElement("button"); x.textContent = b.t; x.onclick = () => (b.u && !b.d ? window.open(b.u) : press(b.d, it.mid)); ib.appendChild(x); }); el.appendChild(ib); }
  if (!el.querySelector(".rp")) { const rp = document.createElement("div"); rp.className = "rp"; rp.textContent = "↩️ پاسخ"; rp.onclick = () => { replyTo = it.mid; const t = $("#replyTag"); t.textContent = "پاسخ به پیام"; t.classList.remove("hidden"); $("#msgIn").focus(); }; el.appendChild(rp); }
  box.scrollTop = box.scrollHeight;
}
async function press(d, mid) { const r = await api("/press", "POST", { data: d, mid }); if (!r.ok) toast("انجام نشد"); }
async function sendText(t) {
  const el = document.createElement("div"); el.className = "bub me"; el.textContent = t; $("#msgs").appendChild(el); $("#msgs").scrollTop = 1e9;
  const r = await api("/say", "POST", { text: t, reply_to: replyTo }); replyTo = null; $("#replyTag").classList.add("hidden"); if (!r.ok) toast("ارسال نشد");
}
$("#msgGo").onclick = () => { const v = $("#msgIn").value.trim(); if (v) { $("#msgIn").value = ""; sendText(v); } };
$("#msgIn").onkeydown = (e) => e.key === "Enter" && $("#msgGo").click();
$("#replyTag").onclick = () => { replyTo = null; $("#replyTag").classList.add("hidden"); };

/* --- زنگ رزرو (نمایش داخل اپ؛ زنگ اصلی را سرویس اندروید می‌زند) --- */
let alarmItems = [], alarmGen = 0;
async function pollAlarms() {
  const gen = ++alarmGen;
  while (S && gen === alarmGen && !$("#panel").classList.contains("hidden")) {
    const r = await api("/alarms/pending?wait=15", "GET");
    if (gen !== alarmGen) return;
    if (r.ok) { alarmItems = r.items; const bar = $("#alarmBar"); bar.classList.toggle("hidden", !alarmItems.length);
      if (alarmItems.length) { const a = alarmItems[0]; $("#alarmTxt").textContent = "🔔 رزرو جدید — " + (a.ticker || "") + (a.when ? " | " + a.when : "") + (a.city ? " | " + a.city : ""); } }
    else await new Promise((z) => setTimeout(z, 4000));
  }
}
$("#alarmSeen").onclick = async () => { if (NATIVE) Android.seen(); await api("/alarms/seen", "POST", {}); $("#alarmBar").classList.add("hidden"); };

/* --- پیام مشتریان (بله/تلگرام) برای مدیریت و اپراتور --- */
let thr = null;
async function loadThreads() {
  $("#thread").classList.add("hidden"); const box = $("#threads"); box.classList.remove("hidden"); box.innerHTML = "";
  const r = await api("/inbox/threads"); if (!r.ok) return;
  r.items.forEach((t) => { const d = document.createElement("div"); d.className = "thr";
    d.innerHTML = `<b></b> <small></small><div></div>`; d.querySelector("b").textContent = t.name; d.querySelector("small").textContent = (t.source.startsWith("bale") ? "بله" : "تلگرام") + (t.mode === "manual" ? " • دستی" : "");
    d.lastChild.textContent = t.last; d.onclick = () => openThread(t); box.appendChild(d); });
  if (!r.items.length) box.textContent = "پیامی نیست.";
}
async function openThread(t) {
  thr = t; $("#threads").classList.add("hidden"); $("#thread").classList.remove("hidden"); $("#thMode").value = t.mode;
  const r = await api(`/inbox/thread?source=${t.source}&user_id=${t.user_id}`); const box = $("#thMsgs"); box.innerHTML = "";
  (r.items || []).forEach((m) => { const e = document.createElement("div"); e.className = "bub " + (m.dir === "out" ? "me" : "cust"); e.textContent = m.text; box.appendChild(e); }); box.scrollTop = 1e9;
}
$("#thBack").onclick = loadThreads;
$("#thGo").onclick = async () => { const v = $("#thIn").value.trim(); if (!v || !thr) return; $("#thIn").value = ""; const r = await api("/ub/outbox", "POST", { source: thr.source, user_id: thr.user_id, text: v }); toast(r.ok ? "ارسال شد" : "ارسال نشد"); openThread(thr); };
$("#thSetMode").onclick = async () => { await api("/ub/mode", "POST", { source: thr.source, user_id: thr.user_id, mode: $("#thMode").value, hours: 6 }); toast("ثبت شد"); };

/* --- حساب‌ها --- */
let dir = null;
function twoTap(btn, label, fn) {   // بدون confirm(): بار اول «مطمئنی؟» و بار دوم اجرا
  let armed = false; btn.onclick = () => { if (!armed) { armed = true; btn.textContent = "مطمئنی؟"; setTimeout(() => { armed = false; btn.textContent = label; }, 3000); } else fn(); };
}
async function loadAcc() {
  if (S.role === "admin") { dir = await api("/admin/directory"); fillRef(); }
  const r = await api("/admin/accounts"); const box = $("#accList"); box.innerHTML = "";
  (r.items || []).forEach((a) => {
    const d = document.createElement("div"); d.className = "acc";
    const who = document.createElement("div"); who.className = "who";
    who.innerHTML = `<span></span><small></small>`;
    who.firstChild.textContent = (a.role === "masseur" ? "ماسور " : "اپراتور ") + (a.name || "(بدون نام)");
    if (a.deleted) { const b = document.createElement("span"); b.className = "badge off"; b.textContent = "حذف‌شده"; who.firstChild.appendChild(b); }
    else if (!a.active) { const b = document.createElement("span"); b.className = "badge off"; b.textContent = "بسته"; who.firstChild.appendChild(b); }
    else if (a.is_default) { const b = document.createElement("span"); b.className = "badge def"; b.textContent = "رمز پیش‌فرض"; who.firstChild.appendChild(b); }
    who.lastChild.textContent = "کد " + a.ref + (a.default_pw ? " — رمز: " + a.default_pw : "");
    d.appendChild(who);
    if (a.deleted) {
      if (S.role === "admin") { const b = document.createElement("button"); b.className = "small"; b.textContent = "بازگردانی"; b.onclick = async () => { const x = await api("/admin/accounts", "POST", { role: a.role, ref: a.ref, password: "" }); toast(x.ok ? "بازگردانی شد (رمز پیش‌فرض)" : "نشد"); loadAcc(); }; d.appendChild(b); }
    } else {
      const t = document.createElement("button"); t.className = "small"; t.textContent = a.active ? "بستن حساب" : "باز کردن";
      t.onclick = async () => { const x = await api(`/admin/accounts/${a.id}/active`, "POST", { active: !a.active }); toast(x.ok ? "انجام شد" : "نشد"); loadAcc(); }; d.appendChild(t);
      const del = document.createElement("button"); del.className = "small danger"; del.textContent = "حذف";
      twoTap(del, "حذف", async () => { const x = await api(`/admin/accounts/${a.id}/delete`, "POST", {}); toast(x.ok ? "حساب حذف شد" : "نشد"); loadAcc(); }); d.appendChild(del);
    }
    box.appendChild(d);
  });
  if (!(r.items || []).length) box.textContent = "حسابی نیست.";
}
function fillRef() {
  const s = $("#acRef"), role = $("#acRole").value; s.innerHTML = "";
  const L = role === "masseur" ? (dir.masseurs || []).filter((m) => m.registered).map((m) => [m.code, "ماسور " + m.code + " — " + (m.name || "")]) : (dir.operators || []).map((o) => [o.user_id, "اپراتور " + o.n + " — " + (o.name || "")]);
  L.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); });
}
$("#acRole").onchange = fillRef;
const PWERR = { too_short: "حداقل ۴ حرف", reserved: "این رمز مجاز نیست", in_use: "این رمز برای کس دیگری ثبت شده", no_such_masseur: "ماسور وجود ندارد", no_such_operator: "اپراتور وجود ندارد", bad_old: "رمز فعلی اشتباه است", reset_invalid: "مهلت بازنشانی تمام شد؛ دوباره تلاش کن" };
$("#acSet").onclick = async () => { const r = await api("/admin/accounts", "POST", { role: $("#acRole").value, ref: $("#acRef").value, password: $("#acPw").value.trim() }); toast(r.ok ? (r.default ? "به رمز پیش‌فرض برگشت" : "ثبت شد") : PWERR[r.error] || "نشد"); if (r.ok) { $("#acPw").value = ""; loadAcc(); } };
$("#mGo").onclick = async () => { const r = await api("/admin/master", "POST", { old: $("#mOld").value, new: $("#mNew").value }); toast(r.ok ? "رمز مادر عوض شد؛ دوباره وارد شو" : PWERR[r.error] || "نشد"); if (r.ok) setTimeout(() => logout(true), 1200); };

/* --- یوزربات: کلید کلی + سوال/جواب --- */
let ruEdit = 0;
async function loadUb() {
  const r = await api("/admin/ub"); if (!r.ok) return;
  const sw = $("#ubOn"); sw.checked = r.enabled; sw.disabled = !r.can_toggle; $("#ubSwitch").classList.toggle("hidden", false);
  const box = $("#ruList"); box.innerHTML = "";
  const PL = { all: "بله و تلگرام", bale: "بله", telegram: "تلگرام" };
  (r.rules || []).forEach((u) => {
    const d = document.createElement("div"); d.className = "rule"; d.innerHTML = `<b></b> <small class="dim"></small><p></p><div class="row"></div>`;
    d.querySelector("b").textContent = u.keyword; d.querySelector("small").textContent = PL[u.platform] + (u.active ? "" : " • غیرفعال"); d.querySelector("p").textContent = u.answer;
    const row = d.querySelector(".row");
    const e = document.createElement("button"); e.className = "small"; e.textContent = "ویرایش"; e.onclick = () => { ruEdit = u.id; $("#ruKw").value = u.keyword; $("#ruAns").value = u.answer; $("#ruPl").value = u.platform; $("#ruCancel").classList.remove("hidden"); $("#ruKw").focus(); };
    const t = document.createElement("button"); t.className = "small"; t.textContent = u.active ? "غیرفعال" : "فعال"; t.onclick = async () => { await api("/admin/ub/rules", "POST", { ...u, active: !u.active }); loadUb(); };
    const x = document.createElement("button"); x.className = "small danger"; x.textContent = "حذف"; twoTap(x, "حذف", async () => { await api(`/admin/ub/rules/${u.id}/delete`, "POST", {}); loadUb(); });
    row.append(e, t, x); box.appendChild(d);
  });
  if (!(r.rules || []).length) box.innerHTML = '<p class="dim">هنوز سوال و جوابی ثبت نشده.</p>';
}
$("#ubOn").onchange = async (e) => { const r = await api("/admin/ub/enabled", "POST", { enabled: e.target.checked }); toast(r.ok ? (r.enabled ? "یوزربات‌ها فعال شدند" : "یوزربات‌ها خاموش شدند") : "نشد"); loadUb(); };
function ruReset() { ruEdit = 0; $("#ruKw").value = ""; $("#ruAns").value = ""; $("#ruPl").value = "all"; $("#ruCancel").classList.add("hidden"); }
$("#ruCancel").onclick = ruReset;
$("#ruSave").onclick = async () => { const r = await api("/admin/ub/rules", "POST", { id: ruEdit, keyword: $("#ruKw").value, answer: $("#ruAns").value, platform: $("#ruPl").value }); toast(r.ok ? "ذخیره شد" : "کلمه (حداقل ۲ حرف) و جواب را پر کن"); if (r.ok) { ruReset(); loadUb(); } };

/* --- تنظیمات --- */
$("#stBat").onclick = () => NATIVE && Android.batterySettings();
$("#stFull").onclick = () => NATIVE && Android.fullScreenSettings();
$("#muteChk").onchange = async (e) => { await api("/app/mute", "POST", { muted: e.target.checked }); toast("ثبت شد"); };
$("#pwGo").onclick = async () => { const r = await api("/auth/password", "POST", { old: $("#pwOld").value, new: $("#pwNew").value }); toast(r.ok ? "رمز عوض شد" : PWERR[r.error] || "نشد"); if (r.ok) { $("#pwOld").value = ""; $("#pwNew").value = ""; $("#pwHint").textContent = ""; } };
async function loadSound() {
  if (!S || S.role !== "admin") return;
  const r = await api("/alarm/config"); if (!r.ok) return; $("#sndMode").value = r.mode; $("#sndInfo").textContent = r.mode === "custom" && r.name ? "فایل فعلی: " + r.name : "";
}
$("#sndGo").onclick = async () => {
  const mode = $("#sndMode").value, f = $("#sndFile").files[0]; let body = { mode };
  if (f) {
    if (f.size > 3.5 * 1024 * 1024) return toast("حجم فایل زیاد است (حداکثر ۳٫۵ مگابایت)");
    const data = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(f); });
    body = { mode: "custom", data, name: f.name };
  }
  const r = await api("/admin/alarm", "POST", body, S.token, 60000);
  toast(r.ok ? "صدای زنگ ثبت شد (روی گوشی‌ها خودکار به‌روز می‌شود)" : r.error === "no_file" ? "اول یک فایل صوتی انتخاب کن" : "نشد");
  if (r.ok) { $("#sndFile").value = ""; loadSound(); }
};

/* ---------------- شروع ---------------- */
show("home"); nav = ["home"]; loadPrices(); setInterval(() => { if (!$("#home").classList.contains("hidden")) loadPrices(); }, 15000);
requestAnimationFrame(loopChart);
if (S && NATIVE) Android.saveSession(BASE, S.token, S.role);
