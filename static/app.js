const STORE = "lazem.v1";
const LANG_STORE = "lazem.lang.v3";
const RTL = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

const state = {
  lang: detectLang(),
  filter: "open",
  search: "",
  tasks: loadTasks(),
  shortcuts: loadShortcuts(),
};

const FILTER_LABEL = {
  open: "filterOpen",
  bill: "filterBill",
  medicine: "filterMed",
  health: "filterHealth",
  school: "filterSchool",
  work: "filterWork",
  errand: "filterErrand",
  done: "filterDone",
};

state.expanded = new Set();
state.dateFilter = null;

/* ---------- Photo storage (IndexedDB) ---------- */
const PHOTO_DB = "lazem-photos";
const PHOTO_STORE = "photos";
function photosSupported() {
  return typeof indexedDB !== "undefined";
}
function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(PHOTO_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(PHOTO_STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function photoPut(id, dataURL) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(dataURL, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function photoGet(id) {
  const db = await openPhotoDB();
  return new Promise((resolve) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const rq = tx.objectStore(PHOTO_STORE).get(id);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => resolve(null);
  });
}
async function photoDel(id) {
  const db = await openPhotoDB();
  return new Promise((resolve) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
function downscaleImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function hydratePhotos() {
  document.querySelectorAll("img[data-photo-load]").forEach((el) => {
    const id = el.getAttribute("data-photo-load");
    el.removeAttribute("data-photo-load");
    photoGet(id).then((data) => { if (data) el.src = data; });
  });
}
function openLightbox(id) {
  photoGet(id).then((data) => {
    if (!data) return;
    document.getElementById("lightboxImg").src = data;
    document.getElementById("lightbox").hidden = false;
  });
}

/* ---------- Subtasks ---------- */
function addSubtask(id, text) {
  const task = state.tasks.find((x) => x.id === id);
  if (!task) return;
  const v = (text || "").trim();
  if (!v) return;
  if (!Array.isArray(task.subtasks)) task.subtasks = [];
  task.subtasks.push({ id: uid(), text: v.slice(0, 80), done: false });
  state.expanded.add(id);
  save();
  render();
}

function detectLang() {
  const stored = localStorage.getItem(LANG_STORE);
  if (stored && I18N[stored]) return stored;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  const two = nav.slice(0, 2);
  return I18N[two] ? two : "en";
}

function loadTasks() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORE, JSON.stringify(state.tasks));
}

/* Custom shortcuts: user-defined one-tap quick-adds, stored locally. */
const SHORTCUTS_STORE = "lazem.shortcuts.v1";

function loadShortcuts() {
  try {
    const raw = JSON.parse(localStorage.getItem(SHORTCUTS_STORE) || "null");
    if (Array.isArray(raw)) return raw;
  } catch {}
  return ["gym 7am", "call family", "drink water"];
}

function saveShortcuts() {
  localStorage.setItem(SHORTCUTS_STORE, JSON.stringify(state.shortcuts));
}

/* Activity log for the streak counter. */
const ACTIVITY_STORE = "lazem.activity.v1";

function loadActivity() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVITY_STORE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function markActivity() {
  const today = todayISO();
  const log = loadActivity();
  if (!log.includes(today)) {
    log.push(today);
    if (log.length > 400) log.splice(0, log.length - 400);
    localStorage.setItem(ACTIVITY_STORE, JSON.stringify(log));
  }
}

function getStreak() {
  const log = new Set(loadActivity());
  if (!log.size) return 0;
  let cursor = todayISO();
  if (!log.has(cursor)) cursor = plusDays(cursor, -1); // grace for today not started yet
  let streak = 0;
  while (log.has(cursor)) {
    streak += 1;
    cursor = plusDays(cursor, -1);
  }
  return streak;
}

/* ---------- Recurring tasks ---------- */
function spawnNext(task) {
  if (!task.repeat || !task.due) return;
  const nd = nextDue(task.due, task.repeat);
  if (!nd || nd === task.due) return;
  const clone = { ...task, id: uid(), done: false, pinned: false, due: nd };
  delete clone.doneAt;
  state.tasks.unshift(clone);
}

/* ---------- Budget ---------- */
function fmtNum(n) {
  try {
    return Number(Math.round(n)).toLocaleString(state.lang === "ar" ? "ar-EG" : undefined);
  } catch {
    return String(Math.round(n));
  }
}

function monthLabel() {
  try {
    return new Date().toLocaleDateString(state.lang === "ar" ? "ar-EG" : state.lang, { month: "long", timeZone: "Africa/Cairo" });
  } catch {
    return new Date().toLocaleDateString("en", { month: "long" });
  }
}

function renderBudget() {
  const tile = document.getElementById("tileBudget");
  if (!tile) return;
  const ym = todayISO().slice(0, 7);
  const withAmt = state.tasks.filter((x) => Number(x.amount) > 0 && x.due && x.due.slice(0, 7) === ym);
  if (!withAmt.length) {
    tile.hidden = true;
    return;
  }
  const total = withAmt.reduce((s, x) => s + Number(x.amount), 0);
  const paid = withAmt.filter((x) => x.done).reduce((s, x) => s + Number(x.amount), 0);
  const byCat = {};
  withAmt.forEach((x) => {
    const c = x.category || "note";
    byCat[c] = (byCat[c] || 0) + Number(x.amount);
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = Math.max.apply(null, cats.map((c) => c[1]));
  const rows = cats
    .map(([cat, amt]) =>
      `<div class="bud-row ${cat}"><span class="bud-cat"><span class="bud-dot"></span>${t(cat)}</span>` +
      `<span class="bud-bar"><span style="width:${Math.max(6, Math.round((amt / max) * 100))}%"></span></span>` +
      `<span class="bud-amt">${fmtNum(amt)}</span></div>`
    )
    .join("");
  tile.hidden = false;
  tile.innerHTML =
    `<p class="k">${icon("coins")} ${t("budgetTitle")} · ${monthLabel()}</p>` +
    `<p class="v">${fmtNum(total)} <span class="bud-egp">EGP</span></p>` +
    `<p class="s">${sub(t("budgetPaid"), { paid: fmtNum(paid), total: fmtNum(total) })}</p>` +
    `<div class="bud-rows">${rows}</div>`;
}

/* ---------- Reminders (local notifications) ---------- */
const REMIND_STORE = "lazem.reminders.v1";
const NOTIFIED_STORE = "lazem.notified.v1";

function loadReminders() {
  try {
    const r = JSON.parse(localStorage.getItem(REMIND_STORE) || "{}");
    return { enabled: !!r.enabled };
  } catch {
    return { enabled: false };
  }
}
function saveReminders() {
  localStorage.setItem(REMIND_STORE, JSON.stringify(state.reminders));
}
state.reminders = loadReminders();

function remindersSupported() {
  return typeof Notification !== "undefined";
}
function loadNotified() {
  try {
    const a = JSON.parse(localStorage.getItem(NOTIFIED_STORE) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function markNotified(key) {
  const l = loadNotified();
  if (!l.includes(key)) {
    l.push(key);
    if (l.length > 500) l.splice(0, l.length - 500);
    localStorage.setItem(NOTIFIED_STORE, JSON.stringify(l));
  }
}
function wasNotified(key) {
  return loadNotified().includes(key);
}
function showReminder(task) {
  const key = `${task.id}:${todayISO()}:${task.time || "due"}`;
  if (wasNotified(key)) return;
  markNotified(key);
  const body = [task.time || "", task.amount ? `${task.amount} EGP` : "", t(task.category)].filter(Boolean).join(" · ");
  const opts = { body, tag: key, icon: "icons/icon-192.png", badge: "icons/icon-192.png", lang: state.lang };
  const title = displayTitle(task);
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, opts))
        .catch(() => { try { new Notification(title, opts); } catch {} });
    } else {
      new Notification(title, opts);
    }
  } catch {}
}
let reminderTimers = [];
function scheduleReminders() {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
  if (!state.reminders.enabled || !remindersSupported() || Notification.permission !== "granted") return;
  const today = todayISO();
  const now = new Date();
  state.tasks
    .filter((x) => !x.done && x.due === today && x.time)
    .forEach((task) => {
      const parts = String(task.time).split(":");
      const h = Number(parts[0]);
      const m = Number(parts[1] || 0);
      if (Number.isNaN(h)) return;
      const target = new Date();
      target.setHours(h, m, 0, 0);
      const ms = target.getTime() - now.getTime();
      if (ms > 0 && ms < 26 * 3600 * 1000) {
        reminderTimers.push(setTimeout(() => showReminder(task), ms));
      } else if (ms <= 0 && ms > -3600 * 1000) {
        showReminder(task);
      }
    });
}
function updateReminderUI() {
  const btn = document.getElementById("remindBtn");
  const label = document.getElementById("remindLabel");
  const note = document.getElementById("remindNote");
  if (!btn) return;
  if (!remindersSupported()) {
    btn.disabled = true;
    if (label) label.textContent = t("remindUnsupported");
    return;
  }
  const granted = Notification.permission === "granted";
  const denied = Notification.permission === "denied";
  const on = state.reminders.enabled && granted;
  btn.classList.toggle("on", on);
  if (label) label.textContent = on ? t("remindersOn") : t("enableReminders");
  if (note) note.textContent = denied ? t("remindDenied") : t("remindNote");
}
async function toggleReminders() {
  if (!remindersSupported()) {
    updateReminderUI();
    return;
  }
  if (state.reminders.enabled && Notification.permission === "granted") {
    state.reminders.enabled = false;
    saveReminders();
    scheduleReminders();
    updateReminderUI();
    return;
  }
  let perm = Notification.permission;
  if (perm !== "granted") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
  }
  if (perm === "granted") {
    state.reminders.enabled = true;
    saveReminders();
    scheduleReminders();
  }
  updateReminderUI();
}

/* ---------- Voice input ---------- */
function voiceLang(l) {
  const map = {
    ar: "ar-EG", en: "en-US", fr: "fr-FR", es: "es-ES", de: "de-DE", it: "it-IT",
    pt: "pt-BR", ru: "ru-RU", tr: "tr-TR", nl: "nl-NL", pl: "pl-PL", id: "id-ID",
    hi: "hi-IN", bn: "bn-BD", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", vi: "vi-VN",
    ur: "ur-PK", fa: "fa-IR",
  };
  return map[l] || "en-US";
}
function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById("micBtn");
  if (!micBtn) return;
  if (!SR) {
    micBtn.hidden = true;
    return;
  }
  micBtn.hidden = false;
  let rec = null;
  let listening = false;
  micBtn.addEventListener("click", () => {
    if (listening) {
      try { rec && rec.stop(); } catch {}
      return;
    }
    rec = new SR();
    rec.lang = voiceLang(state.lang);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { listening = true; micBtn.classList.add("on"); };
    rec.onend = () => { listening = false; micBtn.classList.remove("on"); };
    rec.onerror = () => { listening = false; micBtn.classList.remove("on"); };
    rec.onresult = (e) => {
      const txt = ((e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "").trim();
      if (txt) {
        const input = document.getElementById("note");
        input.value = txt;
        input.focus();
      }
    };
    try { rec.start(); } catch {}
  });
}

function renderShortcuts() {
  const root = document.getElementById("shortcuts");
  if (!root) return;
  const chips = (state.shortcuts || [])
    .map(
      (s) =>
        `<span class="shortcut"><button type="button" data-shortcut-add="${escapeHtml(s)}">${escapeHtml(s)}</button>` +
        `<button type="button" data-shortcut-del="${escapeHtml(s)}" aria-label="remove">${icon("close")}</button></span>`
    )
    .join("");
  root.innerHTML =
    `<p class="k">${t("shortcutsTitle")}</p>${chips}` +
    `<button type="button" class="shortcut-add" data-shortcut-new>${icon("plus")}${t("addShortcut")}</button>`;
}

function t(key) {
  const pack = I18N[state.lang] || I18N.en;
  return pack[key] || I18N.en[key] || key;
}

function sub(str, params) {
  let s = str;
  Object.keys(params || {}).forEach((k) => {
    s = s.split("{" + k + "}").join(String(params[k]));
  });
  return s;
}

function weatherLabel(code) {
  const table = WMO[state.lang] || WMO.en;
  return table[code] || WMO.en[code] || "";
}

function fillLangSelect() {
  const sel = document.getElementById("lang");
  sel.innerHTML = LANGUAGES.map(
    (l) => `<option value="${l.code}">${l.name}</option>`
  ).join("");
  sel.value = state.lang;
}

const THEME_STORE = "lazem.theme.v1";
const THEMES = ["classic", "dark", "girly", "simple"];

function currentTheme() {
  const saved = localStorage.getItem(THEME_STORE);
  return THEMES.includes(saved) ? saved : "classic";
}

function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : "classic";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORE, theme);
  document.querySelectorAll(".themes [data-set]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.set === theme ? "true" : "false");
  });
  const label = document.getElementById("themeName");
  if (label) {
    const key = "theme" + theme.charAt(0).toUpperCase() + theme.slice(1);
    label.textContent = t(key);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg) meta.setAttribute("content", bg);
  }
}

function applyLang() {
  const rtl = RTL.has(state.lang);
  document.documentElement.lang = state.lang;
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.getElementById("lang").value = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.getElementById("note").placeholder = t("placeholder");
  const search = document.getElementById("search");
  if (search) search.placeholder = t("searchPlaceholder");
  applyTheme(currentTheme());
  renderShortcuts();
  renderInterview();
  refreshCoach();
  updateReminderUI();
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function cairoClockText() {
  const locale = state.lang === "ar" ? "ar-EG" : "en-GB";
  return new Date().toLocaleTimeString(locale, {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tickClock() {
  const el = document.getElementById("cairoClock");
  if (el) el.innerHTML = `${icon("clock")} ${t("cairoNow")} · ${cairoClockText()}`;
}

function startClock() {
  tickClock();
  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = setInterval(tickClock, 30000);
}

async function loadBriefing() {
  const wTile = document.getElementById("tileWeather");
  const fxTile = document.getElementById("tileFx");
  const sk = `<p class="sk-k skeleton"></p><p class="sk-v skeleton"></p><p class="sk-s skeleton"></p>`;
  wTile.innerHTML = sk;
  fxTile.innerHTML = sk;
  try {
    const data = await getBriefing();
    state.briefing = data;
    const w = data.weather || {};
    const fx = data.fx || {};
    const wLabel = weatherLabel(w.code) || "";
    const bits = [wLabel];
    if (w.humidity != null) bits.push(`${Math.round(w.humidity)}%`);
    const fill = w.temp_c != null ? Math.max(8, Math.min(100, (Number(w.temp_c) / 42) * 100)) : 0;
    wTile.innerHTML = `
      <p class="k">${icon("weather")} ${t("weather")}</p>
      <p class="v">${w.temp_c != null ? `${Math.round(w.temp_c)}°` : "—"}</p>
      <p class="s">${bits.filter(Boolean).join(" · ")}</p>
      <div class="meter" aria-hidden="true"><span style="--fill:${fill}%"></span></div>`;
    fxTile.innerHTML = `
      <p class="k">${icon("dollar")} ${t("dollar")}</p>
      <p class="v">${fx.usd_egp != null ? fx.usd_egp : "—"}</p>
      <p class="s">USD → EGP</p>`;
    startClock();
  } catch {
    wTile.innerHTML = `<p class="brief-loading">${t("briefLoading")}</p>`;
    fxTile.innerHTML = "";
  }
  renderFocus();
  renderBudget();
}

function renderFocus() {
  const tile = document.getElementById("tileFocus");
  if (!tile) return;
  const today = todayISO();
  const openScope = state.tasks.filter((x) => !x.done && x.due && x.due <= today);
  const doneToday = state.tasks.filter((x) => x.done && x.doneAt === today);
  const total = openScope.length + doneToday.length;
  const pct = total ? Math.round((doneToday.length / total) * 100) : 100;
  const streak = getStreak();
  if (!total && !streak) {
    tile.hidden = true;
    return;
  }
  const cleared = total > 0 && doneToday.length === total;
  if (cleared && !state._wasCleared) celebrate();
  state._wasCleared = cleared;
  tile.classList.toggle("cleared", cleared);
  const center = total ? `<b>${doneToday.length}/${total}</b>` : icon("check");
  const line = total
    ? cleared
      ? t("focusCleared")
      : sub(t("focusDone"), { done: doneToday.length, total })
    : t("focusClear");
  const streakHtml = streak
    ? `<span class="streak">${icon("flame")} ${sub(streak === 1 ? t("streakOne") : t("streak"), { n: streak })}</span>`
    : "";
  tile.hidden = false;
  tile.innerHTML = `
    <div class="ring" style="--p:${pct}" role="img" aria-label="${line}">${center}</div>
    <div class="focus-body">
      <p class="k">${icon("focus")} ${t("focusTitle")}</p>
      <p class="v">${line}</p>
      ${streakHtml}
    </div>`;
}

/* ---------- Hero greeting ---------- */
function greetSlot() {
  const h = cairoStamp().hour;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function renderHero() {
  const el = document.getElementById("hero");
  if (!el) return;
  const slot = greetSlot();
  const iconName = { morning: "sunrise", afternoon: "sun", evening: "sunset", night: "moon" }[slot];
  const raw = state.profile && state.profile.name ? String(state.profile.name).trim() : "";
  const name = raw && raw !== "there" ? raw : "";
  const greet = name ? sub(t("greet_" + slot + "_name"), { name: escapeHtml(name) }) : t("greet_" + slot);
  let dateStr;
  try {
    dateStr = new Date().toLocaleDateString(state.lang === "ar" ? "ar-EG" : state.lang, {
      weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo",
    });
  } catch {
    dateStr = new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });
  }
  el.hidden = false;
  el.innerHTML =
    `<div class="hero-icon">${icon(iconName)}</div>` +
    `<div class="hero-body"><p class="hero-greet">${greet}</p><p class="hero-date">${escapeHtml(dateStr)} · ${t("weather")}</p></div>`;
}

/* ---------- Celebration ---------- */
function celebrate() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  const vars = ["--accent", "--accent-2", "--c-school", "--c-work", "--c-health"];
  const colors = vars.map((v) => (getComputedStyle(root).getPropertyValue(v) || "#0f5c57").trim());
  const layer = document.createElement("div");
  layer.className = "confetti";
  for (let i = 0; i < 28; i++) {
    const s = document.createElement("span");
    s.style.left = Math.random() * 100 + "%";
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = (Math.random() * 0.25).toFixed(2) + "s";
    s.style.setProperty("--x", (Math.random() * 2 - 1).toFixed(2));
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1800);
}

/* ---------- Insights ---------- */
function renderInsights() {
  const root = document.getElementById("insights");
  if (!root) return;
  const activity = new Set(loadActivity());
  const today = todayISO();
  const streak = getStreak();
  const activeDays = activity.size;
  const doneTotal = state.tasks.filter((x) => x.done).length;

  let cells = "";
  for (let i = 69; i >= 0; i--) {
    const d = plusDays(today, -i);
    const on = activity.has(d);
    const isToday = d === today;
    cells += `<span class="hm${on ? " on" : ""}${isToday ? " today" : ""}" title="${d}"></span>`;
  }

  const open = state.tasks.filter((x) => !x.done);
  const totalOpen = open.length;
  const byCat = {};
  open.forEach((x) => {
    const c = x.category || "note";
    byCat[c] = (byCat[c] || 0) + 1;
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const varMap = { bill: "--c-bill", medicine: "--c-medicine", health: "--c-health", school: "--c-school", work: "--c-work", errand: "--c-errand", note: "--c-note" };
  let donutBlock;
  if (totalOpen) {
    let acc = 0;
    const segs = [];
    const legend = [];
    entries.forEach(([cat, n]) => {
      const start = (acc / totalOpen) * 100;
      acc += n;
      const end = (acc / totalOpen) * 100;
      const v = `var(${varMap[cat] || "--c-note"})`;
      segs.push(`${v} ${start.toFixed(1)}% ${end.toFixed(1)}%`);
      legend.push(`<div class="dl-row"><span class="dl-dot" style="background:${v}"></span><span class="dl-name">${t(cat)}</span><span class="dl-val">${n}</span></div>`);
    });
    donutBlock = `<div class="donut-row"><div class="donut" style="background:conic-gradient(${segs.join(",")})"><b>${totalOpen}</b></div><div class="donut-legend">${legend.join("")}</div></div>`;
  } else {
    donutBlock = `<p class="ins-empty">${t("insEmpty")}</p>`;
  }

  root.innerHTML =
    `<div class="ins-stats">` +
    `<div class="ins-stat"><div class="n">${streak}</div><div class="l">${t("insStreak")}</div></div>` +
    `<div class="ins-stat"><div class="n">${activeDays}</div><div class="l">${t("insActive")}</div></div>` +
    `<div class="ins-stat"><div class="n">${doneTotal}</div><div class="l">${t("insDone")}</div></div>` +
    `</div>` +
    `<div class="ins-block"><p class="ins-h">${t("insActivity")}</p><div class="heatmap">${cells}</div>` +
    `<p class="hm-legend"><span class="hm"></span>${t("insLess")} <span class="hm on"></span>${t("insMore")}</p></div>` +
    `<div class="ins-block"><p class="ins-h">${t("insBreakdown")}</p>${donutBlock}</div>`;
}

/* ---------- Week agenda strip ---------- */
function renderAgenda() {
  const root = document.getElementById("agenda");
  if (!root) return;
  const loc = state.lang === "ar" ? "ar-EG" : state.lang;
  const today = todayISO();
  const open = state.tasks.filter((x) => !x.done);
  let html = "";
  for (let i = 0; i < 7; i++) {
    const d = plusDays(today, i);
    const count = open.filter((x) => x.due === d).length;
    const sel = state.dateFilter === d;
    let wd, dn;
    try {
      const dt = new Date(d + "T00:00:00");
      wd = i === 0 ? t("resToday") : dt.toLocaleDateString(loc, { weekday: "short" });
      dn = dt.toLocaleDateString(loc, { day: "numeric" });
    } catch {
      wd = d;
      dn = d.slice(8);
    }
    html += `<button type="button" class="day${sel ? " on" : ""}" data-day="${d}">` +
      `<span class="wd">${escapeHtml(wd)}</span><span class="dn">${escapeHtml(dn)}</span>` +
      `${count ? `<span class="dc">${count}</span>` : ""}</button>`;
  }
  root.innerHTML = html;
}

/* ---------- Undo toast ---------- */
let toastTimer = null;
let undoSnapshot = null;
function showToast(msg, snapshot) {
  undoSnapshot = snapshot || null;
  document.getElementById("toastMsg").textContent = msg;
  const toast = document.getElementById("toast");
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  const toast = document.getElementById("toast");
  toast.classList.remove("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 250);
  undoSnapshot = null;
}

function seedIfEmpty() {
  if (state.tasks.length) return;
  state.tasks = [
    { id: uid(), title: "Electricity", raw: "electricity 5 Oct 850 EGP", category: "bill", bill_kind: "electricity", amount: 850, due: "2026-10-05", done: false },
    { id: uid(), title: "blood pressure medicine 9pm", raw: "blood pressure medicine 9pm", category: "medicine", time: "21:00", due: todayISO(), done: false },
    { id: uid(), title: "buy milk and bread", raw: "buy milk and bread", category: "errand", due: todayISO(), done: false },
  ];
  save();
}

function isOverdue(task) {
  return !task.done && task.due && task.due < todayISO();
}

function visible(task) {
  if (state.dateFilter) return !task.done && task.due === state.dateFilter;
  if (state.filter === "done") return task.done;
  if (task.done) return false;
  if (state.filter === "open") return true;
  return task.category === state.filter;
}

function matchesSearch(task) {
  if (!state.search) return true;
  const n = state.search.toLowerCase();
  return (displayTitle(task) + " " + (task.raw || "") + " " + t(task.category)).toLowerCase().includes(n);
}

function displayTitle(task) {
  if (task.bill_kind) {
    const label = t("kind_" + task.bill_kind);
    if (label && !label.startsWith("kind_")) return label;
  }
  return task.title;
}

function emptyBox(msg) {
  return `<div class="empty">${icon("inbox")}${escapeHtml(msg)}</div>`;
}

function render() {
  const list = document.getElementById("list");
  const overdueBox = document.getElementById("overdue");
  const head = document.getElementById("listHead");
  const loc = state.lang === "ar" ? "ar-EG" : state.lang;
  renderAgenda();
  let items = state.tasks.filter(visible).filter(matchesSearch);
  items = items.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const clearBtn = document.getElementById("clearDoneBtn");

  if (!items.length) {
    overdueBox.innerHTML = "";
    head.hidden = true;
    if (clearBtn) clearBtn.hidden = true;
    list.innerHTML = emptyBox(state.search ? t("noSearch") : t("empty"));
    renderFocus();
    renderBudget();
    return;
  }

  head.hidden = false;
  const titleEl = document.getElementById("listTitle");
  if (state.dateFilter) {
    try {
      titleEl.textContent = new Date(state.dateFilter + "T00:00:00").toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
    } catch {
      titleEl.textContent = state.dateFilter;
    }
  } else {
    titleEl.textContent = t(FILTER_LABEL[state.filter] || "filterOpen");
  }
  document.getElementById("listCount").textContent = items.length;
  if (clearBtn) clearBtn.hidden = !(state.filter === "done" && !state.dateFilter && items.length);

  const overdue = items.filter(isOverdue);
  const rest = items.filter((x) => !isOverdue(x));
  overdueBox.innerHTML = overdue.map(cardHTML).join("");
  list.innerHTML = rest.map(cardHTML).join("");
  renderFocus();
  renderBudget();
  hydratePhotos();
  const ip = document.getElementById("insights");
  if (ip && !ip.hidden) renderInsights();
}

function cardHTML(task) {
  const overdue = isOverdue(task);
  const expanded = state.expanded.has(task.id);
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const subDone = subs.filter((s) => s.done).length;
  const cls = ["card"];
  if (task.category) cls.push(task.category);
  if (overdue) cls.push("overdue");
  if (task.done) cls.push("done");
  if (task.pinned) cls.push("pinned");
  if (expanded) cls.push("open");
  const catIcon = icon(CATEGORY_ICON[task.category] || "note");

  const bits = [];
  if (task.due) bits.push(`<span>${overdue ? t("overdue") : t("due")}: ${escapeHtml(task.due)}</span>`);
  if (task.time) bits.push(`<span>${escapeHtml(task.time)}</span>`);
  if (task.amount) bits.push(`<span class="amount">${escapeHtml(String(task.amount))} EGP</span>`);
  if (task.repeat) bits.push(`<span class="repeat-flag">${icon("repeat")} ${t("repeat_" + task.repeat)}</span>`);
  if (subs.length) {
    const pct = Math.round((subDone / subs.length) * 100);
    bits.push(`<span class="sub-progress">${icon("listcheck")} ${subDone}/${subs.length}<span class="bar"><span style="width:${pct}%"></span></span></span>`);
  }
  if (task.note && task.note.trim()) bits.push(`<span class="note-flag" title="note">${icon("note")}</span>`);
  const metaInner = bits.length ? bits.join('<span class="dot">·</span>') : escapeHtml(task.raw || "");

  const action = task.done ? t("undo") : t("done");
  const actIcon = task.done ? icon("undo") : icon("check");
  const actKind = task.done ? "undo" : "done";

  return `<article class="${cls.join(" ")}" data-id="${task.id}">
    <div class="badge">${catIcon}</div>
    <div class="body">
      <h2>${escapeHtml(displayTitle(task))}</h2>
      <p class="meta${overdue ? " overdue-txt" : ""}">${metaInner}</p>
    </div>
    <div class="card-top">
      <button type="button" class="pin-btn ${task.pinned ? "on" : ""}" data-act="pin" aria-label="${t("pin")}" title="${t("pin")}">${icon("star")}</button>
      <span class="chip">${t(task.category)}</span>
      <button type="button" class="expand-btn" data-act="expand" aria-label="${t("details")}" title="${t("details")}">${icon("chevron")}</button>
    </div>
    <div class="actions">
      <button type="button" data-act="${actKind}">${actIcon}<span>${action}</span></button>
      <button type="button" data-act="repeat" class="${task.repeat ? "on" : ""}" title="${t("repeatCycle")}">${icon("repeat")}<span>${task.repeat ? t("repeat_" + task.repeat) : t("repeatOff")}</span></button>
      <button type="button" data-act="remove">${icon("trash")}<span>${t("remove")}</span></button>
    </div>
    ${expanded ? detailsHTML(task, subs) : ""}
  </article>`;
}

function detailsHTML(task, subs) {
  const items = subs
    .map(
      (s) =>
        `<div class="check-item${s.done ? " done" : ""}">` +
        `<button type="button" class="check-box" data-act="subtask-toggle" data-sid="${s.id}" aria-label="toggle">${icon("check")}</button>` +
        `<span class="check-text">${escapeHtml(s.text)}</span>` +
        `<button type="button" class="check-del" data-act="subtask-del" data-sid="${s.id}" aria-label="remove">${icon("close")}</button></div>`
    )
    .join("");
  const photoBlock = photosSupported()
    ? `<div><p class="det-h">${icon("camera")} ${t("photo")}</p><div class="photo-row">` +
      (task.photo
        ? `<img class="photo-thumb" data-photo-load="${task.id}" data-act="photo-view" alt="attachment" />` +
          `<button type="button" class="chipbtn" data-act="photo-del">${icon("trash")} ${t("removePhoto")}</button>`
        : `<button type="button" class="chipbtn" data-act="photo-add">${icon("camera")} ${t("addPhoto")}</button>`) +
      `</div></div>`
    : "";
  return `<div class="details">
    <div>
      <p class="det-h">${icon("clockplus")} ${t("reschedule")}</p>
      <div class="resched-row">
        <button type="button" class="chipbtn" data-act="resched" data-to="today">${t("resToday")}</button>
        <button type="button" class="chipbtn" data-act="resched" data-to="tomorrow">${t("resTomorrow")}</button>
        <button type="button" class="chipbtn" data-act="resched" data-to="week">${t("resWeek")}</button>
      </div>
    </div>
    <div>
      <p class="det-h">${icon("listcheck")} ${t("checklist")}</p>
      <div class="checklist">
        ${items}
        <div class="check-add">
          <input type="text" class="subtask-input" maxlength="80" placeholder="${t("addItem")}" />
          <button type="button" data-act="subtask-add" aria-label="${t("addItem")}">${icon("plus")}</button>
        </div>
      </div>
    </div>
    <div>
      <p class="det-h">${icon("note")} ${t("noteField")}</p>
      <textarea class="note-input" maxlength="500" placeholder="${escapeHtml(t("notePlaceholder"))}">${escapeHtml(task.note || "")}</textarea>
    </div>
    ${photoBlock}
  </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function addTask(text) {
  const parsed = parseTask(text);
  const task = { id: uid(), done: false, ...parsed };
  state.tasks.unshift(task);
  save();
  render();
  refreshCoach();
  scheduleReminders();
  showRelated(task);
}

document.getElementById("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("note");
  const text = input.value.trim();
  if (!text) return;
  try {
    await addTask(text);
    input.value = "";
  } catch {
    input.blur();
  }
});

document.getElementById("filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  state.filter = btn.dataset.filter;
  state.dateFilter = null;
  document.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("on", b === btn));
  render();
});

document.getElementById("agenda").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-day]");
  if (!btn) return;
  state.dateFilter = state.dateFilter === btn.dataset.day ? null : btn.dataset.day;
  render();
});

document.getElementById("clearDoneBtn").addEventListener("click", () => {
  const before = state.tasks.length;
  const snap = JSON.stringify(state.tasks);
  state.tasks = state.tasks.filter((x) => !x.done);
  if (state.tasks.length !== before) {
    save();
    render();
    refreshCoach();
    showToast(t("clearedDone"), snap);
  }
});

document.getElementById("toastUndo").addEventListener("click", () => {
  if (undoSnapshot) {
    try { state.tasks = JSON.parse(undoSnapshot); } catch {}
    save();
    render();
    refreshCoach();
    scheduleReminders();
  }
  hideToast();
});

/* Save note text as it's typed (no re-render, keeps focus) */
document.addEventListener("input", (e) => {
  const ta = e.target.closest && e.target.closest(".note-input");
  if (!ta) return;
  const card = ta.closest("[data-id]");
  if (!card) return;
  const task = state.tasks.find((x) => x.id === card.dataset.id);
  if (task) {
    task.note = ta.value;
    save();
  }
});

/* Install-to-home-screen prompt */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = document.getElementById("installBtn");
  if (b) b.hidden = false;
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  const b = document.getElementById("installBtn");
  if (b) b.hidden = true;
});
document.getElementById("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null;
  const b = document.getElementById("installBtn");
  if (b) b.hidden = true;
});

/* Search */
const searchInput = document.getElementById("search");
const searchbar = document.getElementById("searchbar");
searchInput.addEventListener("input", (e) => {
  state.search = e.target.value.trim();
  searchbar.classList.toggle("has-text", !!e.target.value);
  render();
});
document.getElementById("clearSearch").addEventListener("click", () => {
  searchInput.value = "";
  state.search = "";
  searchbar.classList.remove("has-text");
  render();
  searchInput.focus();
});

document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const id = card && card.dataset.id;
  const task = state.tasks.find((x) => x.id === id);
  if (!task) return;
  const act = btn.dataset.act;

  // Actions that don't trigger the standard save/render tail:
  if (act === "photo-add") {
    state._photoTarget = id;
    document.getElementById("cardPhotoInput").click();
    return;
  }
  if (act === "photo-view") {
    openLightbox(id);
    return;
  }
  if (act === "subtask-add") {
    const inp = card.querySelector(".subtask-input");
    if (inp) addSubtask(id, inp.value);
    return;
  }

  const removeSnapshot = act === "remove" ? JSON.stringify(state.tasks) : null;

  if (act === "done") {
    task.done = true;
    task.doneAt = todayISO();
    markActivity();
    spawnNext(task);
  } else if (act === "undo") {
    task.done = false;
  } else if (act === "pin") {
    task.pinned = !task.pinned;
  } else if (act === "expand") {
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
  } else if (act === "resched") {
    const to = btn.dataset.to;
    task.due = to === "today" ? todayISO() : to === "tomorrow" ? plusDays(todayISO(), 1) : plusDays(todayISO(), 7);
  } else if (act === "repeat") {
    const order = [null, "daily", "weekly", "monthly"];
    task.repeat = order[(order.indexOf(task.repeat || null) + 1) % order.length];
  } else if (act === "subtask-toggle") {
    const s = (task.subtasks || []).find((x) => x.id === btn.dataset.sid);
    if (s) s.done = !s.done;
  } else if (act === "subtask-del") {
    task.subtasks = (task.subtasks || []).filter((x) => x.id !== btn.dataset.sid);
  } else if (act === "photo-del") {
    photoDel(id);
    task.photo = false;
  } else if (act === "remove") {
    state.tasks = state.tasks.filter((x) => x.id !== id);
  }
  save();
  render();
  refreshCoach();
  scheduleReminders();
  if (act === "remove") showToast(t("removed"), removeSnapshot);
});

/* Add a checklist item with Enter */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const inp = e.target.closest && e.target.closest(".subtask-input");
  if (!inp) return;
  e.preventDefault();
  const card = inp.closest("[data-id]");
  if (card) addSubtask(card.dataset.id, inp.value);
});

/* Photo capture */
document.getElementById("cardPhotoInput").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  const id = state._photoTarget;
  e.target.value = "";
  if (!file || !id) return;
  try {
    const dataURL = await downscaleImage(file, 1000);
    await photoPut(id, dataURL);
    const task = state.tasks.find((x) => x.id === id);
    if (task) {
      task.photo = true;
      state.expanded.add(id);
      save();
      render();
    }
  } catch {}
});

/* Lightbox */
function closeLightbox() {
  const lb = document.getElementById("lightbox");
  lb.hidden = true;
  document.getElementById("lightboxImg").src = "";
}
document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
document.getElementById("lightbox").addEventListener("click", (e) => {
  if (e.target.id === "lightbox") closeLightbox();
});

document.getElementById("lang").addEventListener("change", (e) => {
  state.lang = e.target.value;
  localStorage.setItem(LANG_STORE, state.lang);
  applyLang();
  loadBriefing();
  render();
});

document.querySelector(".themes").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-set]");
  if (!btn) return;
  applyTheme(btn.dataset.set);
});

/* Slide-out settings menu */
const drawer = document.getElementById("drawer");
const menuBtn = document.getElementById("menuBtn");
function setMenu(open) {
  drawer.hidden = !open;
  document.body.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}
menuBtn.addEventListener("click", () => setMenu(drawer.hidden));
document.getElementById("drawerClose").addEventListener("click", () => setMenu(false));
drawer.addEventListener("click", (e) => {
  if (e.target === drawer) setMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const lb = document.getElementById("lightbox");
  if (lb && !lb.hidden) { closeLightbox(); return; }
  if (!drawer.hidden) setMenu(false);
});

/* Backup / restore */
function exportData() {
  const payload = {
    app: "lazem",
    version: 3,
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
    shortcuts: state.shortcuts,
    profile: state.profile,
    activity: loadActivity(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lazem-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById("exportBtn").addEventListener("click", exportData);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.tasks)) {
        state.tasks = data.tasks;
        save();
      }
      if (Array.isArray(data.shortcuts)) {
        state.shortcuts = data.shortcuts;
        saveShortcuts();
      }
      if (data.profile && typeof data.profile === "object") {
        state.profile = data.profile;
        saveProfile(state.profile);
        state.qIndex = state.profile.done ? QUESTIONS.length : 0;
      }
      if (Array.isArray(data.activity)) {
        localStorage.setItem(ACTIVITY_STORE, JSON.stringify(data.activity));
      }
      renderShortcuts();
      renderInterview();
      render();
      refreshCoach();
      scheduleReminders();
      setMenu(false);
      window.alert(t("importOk"));
    } catch {
      window.alert(t("importErr"));
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
});

const PROFILE_STORE = "lazem.profile.v1";
const QUESTIONS = [
  { id: "name", type: "text", prompt: "q_name" },
  {
    id: "household",
    type: "choice",
    prompt: "q_household",
    options: [["self", "opt_self"], ["couple", "opt_couple"], ["family", "opt_family"], ["manager", "opt_manager"]],
  },
  {
    id: "work",
    type: "choice",
    prompt: "q_work",
    options: [["remote", "opt_remote"], ["commute", "opt_commute"], ["off", "opt_off"]],
  },
  { id: "meds", type: "bool", prompt: "q_meds" },
  { id: "watch_fx", type: "bool", prompt: "q_fx" },
  {
    id: "errand_window",
    type: "choice",
    prompt: "q_errands",
    options: [["morning", "opt_morning"], ["evening", "opt_evening"], ["flex", "opt_flex"]],
  },
];

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_STORE) || "{}");
  } catch {
    return {};
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_STORE, JSON.stringify(profile));
}

state.profile = loadProfile();
state.qIndex = state.profile.done ? QUESTIONS.length : 0;

function interpolate(code, params) {
  const p = { ...(params || {}) };
  if (code === "meds_today") p.time = p.time ? ` (${p.time})` : "";
  if (p.next && t("kind_" + p.next) !== "kind_" + p.next) p.next = t("kind_" + p.next);
  let s = t("c_" + code);
  Object.keys(p).forEach((k) => {
    s = s.split("{" + k + "}").join(String(p[k]));
  });
  return s;
}

function renderInterview() {
  const root = document.getElementById("interview");
  if (state.profile.done || state.qIndex >= QUESTIONS.length) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }
  const q = QUESTIONS[state.qIndex];
  root.hidden = false;
  let body = `<p class="q-progress">${icon("sparkles")} ${state.qIndex + 1} / ${QUESTIONS.length} · ${t("q_intro")}</p>
    <h2>${t(q.prompt)}</h2>`;
  if (q.type === "text") {
    body += `<input type="text" id="qText" maxlength="40" value="${escapeHtml(state.profile.name || "")}" />
      <div class="row">
        <button type="button" class="go" data-q="name-go">${t("q_next")}</button>
        <button type="button" class="skip" data-q="skip">${t("q_skip")}</button>
      </div>`;
  } else if (q.type === "bool") {
    body += `<div class="choices">
      <button type="button" data-q="bool" data-v="1">${t("opt_yes")}</button>
      <button type="button" data-q="bool" data-v="0">${t("opt_no")}</button>
    </div>`;
  } else {
    body += `<div class="choices">${q.options
      .map(([v, k]) => `<button type="button" data-q="choice" data-v="${v}">${t(k)}</button>`)
      .join("")}</div>`;
  }
  root.innerHTML = body;
}

function answerQuestion(value) {
  const q = QUESTIONS[state.qIndex];
  if (!q) return;
  if (q.type === "bool") state.profile[q.id] = value === true || value === "1";
  else state.profile[q.id] = value;
  state.qIndex += 1;
  if (state.qIndex >= QUESTIONS.length) {
    state.profile.done = true;
    saveProfile(state.profile);
    renderInterview();
    refreshCoach();
    return;
  }
  saveProfile(state.profile);
  renderInterview();
}

function skipInterview() {
  state.profile.done = true;
  saveProfile(state.profile);
  state.qIndex = QUESTIONS.length;
  renderInterview();
  refreshCoach();
}

async function refreshCoach() {
  renderHero();
  const root = document.getElementById("coach");
  if (!state.profile.done) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }
  try {
    if (!state.briefing) state.briefing = await getBriefing();
    const plan = planDay(state.profile, state.tasks, state.briefing);
    const params = { name: plan.name || state.profile.name || "there" };
    const items = (plan.items || [])
      .map((it) => `<li>${escapeHtml(interpolate(it.code, it.params))}</li>`)
      .join("");
    const slot = plan.slot ? ` · ${t("slot_" + plan.slot)}` : "";
    let nowBtn = "";
    if (plan.next && plan.next.add) {
      nowBtn = `<button type="button" class="now" data-add="${escapeHtml(plan.next.add)}">${icon("plus")}${t("c_do_now")}</button>`;
    } else if (plan.next && plan.next.code === "overdue_first") {
      nowBtn = `<button type="button" class="now" data-scroll="overdue">${icon("plus")}${t("c_do_now")}</button>`;
    }
    root.hidden = false;
    root.innerHTML = `<p class="q-progress">${icon("sparkles")} ${t("coach_title")}${slot}</p>
      <h2>${escapeHtml(interpolate(plan.headline, params))}</h2>
      <ol>${items}</ol>
      ${nowBtn}
      <button type="button" class="edit" data-q="edit">${t("q_edit")}</button>`;
  } catch {
    root.hidden = true;
  }
}

async function showRelated(task) {
  const root = document.getElementById("related");
  try {
    const items = relatedSuggestions(
      task,
      state.tasks.filter((x) => x.id !== task.id),
      state.briefing
    );
    if (!items.length) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    root.hidden = false;
    root.innerHTML = `<p class="k">${t("related_title")}</p>` +
      items
        .map(
          (it) =>
            `<button type="button" data-add="${escapeHtml(it.add || "")}">${escapeHtml(interpolate(it.code, it.params))}</button>`
        )
        .join("");
  } catch {
    root.hidden = true;
  }
}

document.getElementById("interview").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-q]");
  if (!btn) return;
  const kind = btn.dataset.q;
  if (kind === "skip") skipInterview();
  else if (kind === "name-go") {
    const el = document.getElementById("qText");
    answerQuestion((el && el.value.trim()) || "there");
  } else if (kind === "bool") answerQuestion(btn.dataset.v);
  else if (kind === "choice") answerQuestion(btn.dataset.v);
});

document.getElementById("coach").addEventListener("click", async (e) => {
  if (e.target.closest("[data-q=edit]")) {
    state.profile.done = false;
    state.qIndex = 0;
    saveProfile(state.profile);
    document.getElementById("coach").hidden = true;
    renderInterview();
    return;
  }
  const add = e.target.closest("[data-add]");
  if (add && add.dataset.add) {
    try {
      await addTask(add.dataset.add);
    } catch {
      /* keep plan */
    }
    return;
  }
  if (e.target.closest("[data-scroll=overdue]")) {
    const box = document.getElementById("overdue");
    if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.getElementById("related").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn || !btn.dataset.add) return;
  try {
    await addTask(btn.dataset.add);
  } catch {
    /* keep chips */
  }
});

document.getElementById("shortcuts").addEventListener("click", async (e) => {
  const add = e.target.closest("[data-shortcut-add]");
  if (add) {
    try {
      await addTask(add.dataset.shortcutAdd);
    } catch {
      /* ignore parse errors */
    }
    return;
  }
  const del = e.target.closest("[data-shortcut-del]");
  if (del) {
    state.shortcuts = state.shortcuts.filter((s) => s !== del.dataset.shortcutDel);
    saveShortcuts();
    renderShortcuts();
    return;
  }
  if (e.target.closest("[data-shortcut-new]")) {
    const value = (window.prompt(t("newShortcut")) || "").trim();
    if (value && !state.shortcuts.includes(value)) {
      state.shortcuts.unshift(value);
      saveShortcuts();
      renderShortcuts();
    }
  }
});

document.getElementById("interview").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (!e.target.matches("#qText")) return;
  e.preventDefault();
  answerQuestion(e.target.value.trim() || "there");
});

document.getElementById("remindBtn").addEventListener("click", toggleReminders);

/* Insights panel toggle */
(() => {
  const toggle = document.getElementById("insightsToggle");
  const panel = document.getElementById("insights");
  if (!toggle || !panel) return;
  toggle.addEventListener("click", () => {
    if (panel.hidden) {
      renderInsights();
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    } else {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
  });
})();

paintIcons();
fillLangSelect();
applyTheme(currentTheme());
seedIfEmpty();
setupVoice();
applyLang();
loadBriefing();
render();
refreshCoach();
updateReminderUI();
scheduleReminders();

/* Re-check reminder timers on focus and around the day boundary. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleReminders();
});
setInterval(scheduleReminders, 15 * 60 * 1000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
