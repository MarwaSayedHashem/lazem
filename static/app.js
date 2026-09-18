const STORE = "lazem.v1";
const LANG_STORE = "lazem.lang.v3";
const RTL = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

const state = {
  lang: detectLang(),
  filter: "open",
  tasks: loadTasks(),
  shortcuts: loadShortcuts(),
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

function renderShortcuts() {
  const root = document.getElementById("shortcuts");
  if (!root) return;
  const chips = (state.shortcuts || [])
    .map(
      (s) =>
        `<span class="shortcut"><button type="button" data-shortcut-add="${escapeHtml(s)}">${escapeHtml(s)}</button>` +
        `<button type="button" data-shortcut-del="${escapeHtml(s)}" aria-label="remove">✕</button></span>`
    )
    .join("");
  root.innerHTML =
    `<p class="k">${t("shortcutsTitle")}</p>${chips}` +
    `<button type="button" class="shortcut-add" data-shortcut-new>${t("addShortcut")}</button>`;
}

function t(key) {
  const pack = I18N[state.lang] || I18N.en;
  return pack[key] || I18N.en[key] || key;
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
  applyTheme(currentTheme());
  renderShortcuts();
  renderInterview();
  refreshCoach();
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
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
  if (el) el.textContent = `${t("cairoNow")} · ${cairoClockText()}`;
}

function startClock() {
  tickClock();
  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = setInterval(tickClock, 30000);
}

async function loadBriefing() {
  const root = document.getElementById("brief");
  try {
    const data = await getBriefing();
    state.briefing = data;
    const w = data.weather || {};
    const fx = data.fx || {};
    const wLabel = weatherLabel(w.code) || (state.lang === "ar" ? w.label_ar : w.label_en) || "";
    const bits = [wLabel];
    if (w.humidity != null) bits.push(`${Math.round(w.humidity)}%`);
    const fill = w.temp_c != null ? Math.max(8, Math.min(100, (Number(w.temp_c) / 42) * 100)) : 0;
    root.innerHTML = `
      <article class="tile">
        <p class="k">${t("weather")}</p>
        <p class="v">${w.temp_c != null ? `${Math.round(w.temp_c)}°` : "—"}</p>
        <p class="s">${bits.filter(Boolean).join(" · ")}</p>
        <div class="meter" aria-hidden="true"><span style="--fill:${fill}%"></span></div>
      </article>
      <article class="tile">
        <p class="k">${t("dollar")}</p>
        <p class="v">${fx.usd_egp != null ? fx.usd_egp : "—"}</p>
        <p class="s">USD → EGP</p>
      </article>
      <p class="clock" id="cairoClock"></p>`;
    startClock();
  } catch {
    root.innerHTML = `<p class="brief-loading">${t("briefLoading")}</p>`;
  }
}

function seedIfEmpty() {
  if (state.tasks.length) return;
  state.tasks = [
    {
      id: uid(),
      title: "Electricity",
      raw: "electricity 5 Oct 850 EGP",
      category: "bill",
      bill_kind: "electricity",
      amount: 850,
      due: "2026-10-05",
      done: false,
    },
    {
      id: uid(),
      title: "blood pressure medicine 9pm",
      raw: "blood pressure medicine 9pm",
      category: "medicine",
      time: "21:00",
      due: todayISO(),
      done: false,
    },
    {
      id: uid(),
      title: "buy milk and bread",
      raw: "buy milk and bread",
      category: "errand",
      due: todayISO(),
      done: false,
    },
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

function displayTitle(task) {
  if (task.bill_kind) {
    const label = t("kind_" + task.bill_kind);
    if (label && !label.startsWith("kind_")) return label;
  }
  return task.title;
}

function render() {
  const list = document.getElementById("list");
  const overdueBox = document.getElementById("overdue");
  const items = state.tasks.filter(visible);
  if (!items.length) {
    overdueBox.innerHTML = "";
    list.innerHTML = `<p class="empty">${t("empty")}</p>`;
    return;
  }
  const overdue = items.filter(isOverdue);
  const rest = items.filter((x) => !isOverdue(x));
  overdueBox.innerHTML = overdue.map(cardHTML).join("");
  list.innerHTML = rest.map(cardHTML).join("");
}

function cardHTML(task) {
  const bits = [];
  if (task.due) bits.push(`${isOverdue(task) ? t("overdue") : t("due")}: ${task.due}`);
  if (task.time) bits.push(task.time);
  if (task.amount) bits.push(`${t("amount")} ${task.amount} EGP`);
  const cls = ["card"];
  if (task.category) cls.push(task.category);
  if (isOverdue(task)) cls.push("overdue");
  if (task.done) cls.push("done");
  const action = task.done ? t("undo") : t("done");
  const actionKind = task.done ? "undo" : "done";
  return `<article class="${cls.join(" ")}" data-id="${task.id}">
    <div>
      <h2>${escapeHtml(displayTitle(task))}</h2>
      <p class="meta">${bits.join(" · ") || escapeHtml(task.raw || "")}</p>
    </div>
    <span class="chip ${task.category}">${t(task.category)}</span>
    <div class="actions">
      <button type="button" data-act="${actionKind}">${action}</button>
      <button type="button" data-act="remove">${t("remove")}</button>
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

document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const id = card && card.dataset.id;
  const task = state.tasks.find((x) => x.id === id);
  if (!task) return;
  if (btn.dataset.act === "done") task.done = true;
  if (btn.dataset.act === "undo") task.done = false;
  if (btn.dataset.act === "remove") state.tasks = state.tasks.filter((x) => x.id !== id);
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

const PROFILE_STORE = "lazem.profile.v1";
const QUESTIONS = [
  { id: "name", type: "text", prompt: "q_name" },
  {
    id: "household",
    type: "choice",
    prompt: "q_household",
    options: [
      ["self", "opt_self"],
      ["couple", "opt_couple"],
      ["family", "opt_family"],
      ["manager", "opt_manager"],
    ],
  },
  {
    id: "work",
    type: "choice",
    prompt: "q_work",
    options: [
      ["remote", "opt_remote"],
      ["commute", "opt_commute"],
      ["off", "opt_off"],
    ],
  },
  {
    id: "meds",
    type: "bool",
    prompt: "q_meds",
  },
  {
    id: "watch_fx",
    type: "bool",
    prompt: "q_fx",
  },
  {
    id: "errand_window",
    type: "choice",
    prompt: "q_errands",
    options: [
      ["morning", "opt_morning"],
      ["evening", "opt_evening"],
      ["flex", "opt_flex"],
    ],
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
  let body = `<p class="q-progress">${state.qIndex + 1} / ${QUESTIONS.length} · ${t("q_intro")}</p>
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
      .map((item) => `<li>${escapeHtml(interpolate(item.code, item.params))}</li>`)
      .join("");
    const slot = plan.slot ? ` · ${t("slot_" + plan.slot)}` : "";
    let nowBtn = "";
    if (plan.next && plan.next.add) {
      nowBtn = `<button type="button" class="now" data-add="${escapeHtml(plan.next.add)}">${t("c_do_now")}</button>`;
    } else if (plan.next && plan.next.code === "overdue_first") {
      nowBtn = `<button type="button" class="now" data-scroll="overdue">${t("c_do_now")}</button>`;
    }
    root.hidden = false;
    root.innerHTML = `<p class="q-progress">${t("coach_title")}${slot}</p>
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
          (item) =>
            `<button type="button" data-add="${escapeHtml(item.add || "")}">${escapeHtml(
              interpolate(item.code, item.params)
            )}</button>`
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
