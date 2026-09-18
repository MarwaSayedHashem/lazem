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
  const center = total ? `<b>${doneToday.length}/${total}</b>` : icon("check");
  const line = total ? sub(t("focusDone"), { done: doneToday.length, total }) : t("focusClear");
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
  let items = state.tasks.filter(visible).filter(matchesSearch);
  items = items.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  if (!items.length) {
    overdueBox.innerHTML = "";
    head.hidden = true;
    list.innerHTML = emptyBox(state.search ? t("noSearch") : t("empty"));
    renderFocus();
    return;
  }

  head.hidden = false;
  document.getElementById("listTitle").textContent = t(FILTER_LABEL[state.filter] || "filterOpen");
  document.getElementById("listCount").textContent = items.length;

  const overdue = items.filter(isOverdue);
  const rest = items.filter((x) => !isOverdue(x));
  overdueBox.innerHTML = overdue.map(cardHTML).join("");
  list.innerHTML = rest.map(cardHTML).join("");
  renderFocus();
}

function cardHTML(task) {
  const overdue = isOverdue(task);
  const cls = ["card"];
  if (task.category) cls.push(task.category);
  if (overdue) cls.push("overdue");
  if (task.done) cls.push("done");
  if (task.pinned) cls.push("pinned");
  const catIcon = icon(CATEGORY_ICON[task.category] || "note");

  const bits = [];
  if (task.due) bits.push(`<span>${overdue ? t("overdue") : t("due")}: ${escapeHtml(task.due)}</span>`);
  if (task.time) bits.push(`<span>${escapeHtml(task.time)}</span>`);
  if (task.amount) bits.push(`<span class="amount">${escapeHtml(String(task.amount))} EGP</span>`);
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
    </div>
    <div class="actions">
      <button type="button" data-act="${actKind}">${actIcon}<span>${action}</span></button>
      <button type="button" data-act="remove">${icon("trash")}<span>${t("remove")}</span></button>
    </div>
  </article>`;
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
  document.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("on", b === btn));
  render();
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
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const id = card && card.dataset.id;
  const task = state.tasks.find((x) => x.id === id);
  if (!task) return;
  const act = btn.dataset.act;
  if (act === "done") {
    task.done = true;
    task.doneAt = todayISO();
    markActivity();
  }
  if (act === "undo") task.done = false;
  if (act === "pin") task.pinned = !task.pinned;
  if (act === "remove") state.tasks = state.tasks.filter((x) => x.id !== id);
  save();
  render();
  refreshCoach();
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
  if (e.key === "Escape" && !drawer.hidden) setMenu(false);
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

paintIcons();
fillLangSelect();
applyTheme(currentTheme());
seedIfEmpty();
applyLang();
loadBriefing();
render();
refreshCoach();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
