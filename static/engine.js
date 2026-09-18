/** Browser port of app/parser.py + app/coach.py + Cairo briefing. No account. */
const RAIN = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
const RELATED_MAP = {
  electricity: ["water", "gas"],
  water: ["electricity"],
  gas: ["electricity"],
  internet: ["phone"],
  phone: ["internet"],
  rent: ["electricity", "water"],
};

function cairoStamp(date) {
  const str = (date || new Date()).toLocaleString("sv-SE", { timeZone: "Africa/Cairo" });
  const [isoDate, time] = str.split(" ");
  const [y, mo, d] = isoDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcWeekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return {
    isoDate,
    year: y,
    month: mo,
    day: d,
    hour,
    minute,
    weekday: (utcWeekday + 6) % 7,
    isoMinutes: `${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function plusDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function containsAny(text, words) {
  const lowered = text.toLowerCase();
  const sorted = [...words].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    const asciiShort = /^[a-z0-9 '\-]+$/i.test(word) && word.length <= 4;
    if (asciiShort) {
      const re = new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i");
      if (re.test(lowered)) return true;
    } else if (lowered.includes(word.toLowerCase()) || text.includes(word)) {
      return true;
    }
  }
  return false;
}

function billKind(text) {
  for (const [kind, hints] of LEX.BILL_HINTS) {
    if (containsAny(text, hints)) return kind;
  }
  return null;
}

function parseAmount(text) {
  const cur = LEX.CURRENCY_RE;
  const patterns = [
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${cur}(?!\\w)`, "i"),
    new RegExp(`${cur}\\s*(\\d+(?:[.,]\\d+)?)`, "i"),
    /(\d+(?:\.\d+)?)\s*ج\b/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return parseFloat(m[1].replace(",", "."));
  }
  if (billKind(text)) {
    const m = text.match(/\b(\d{2,6}(?:[.,]\d+)?)\b/);
    if (m) return parseFloat(m[1].replace(",", "."));
  }
  return null;
}

function parseTime(text) {
  let m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م|hs|uhr)\b/i);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    const suffix = m[3].toLowerCase();
    if ((suffix === "pm" || suffix === "م") && hour < 12) hour += 12;
    if ((suffix === "am" || suffix === "ص") && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  m = text.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/i);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  m = text.match(/\b(\d{1,2})h\b/i);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}:00`;
  return null;
}

function coerceDue(year, month, day, todayIso) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const last = lastDayOfMonth(year, month);
  if (day > last) return null;
  let iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (iso < todayIso) {
    const nextLast = lastDayOfMonth(year + 1, month);
    if (day > nextLast) return null;
    iso = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return iso;
}

function parseDue(text, todayIso) {
  if (containsAny(text, LEX.TODAY_WORDS)) return todayIso;
  if (containsAny(text, LEX.TOMORROW_WORDS)) return plusDays(todayIso, 1);
  let m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (m) return coerceDue(Number(todayIso.slice(0, 4)), Number(m[1]), Number(m[2]), todayIso);
  m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return coerceDue(Number(todayIso.slice(0, 4)), Number(m[1]), Number(m[2]), todayIso);
  m = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let year = m[3] ? Number(m[3]) : Number(todayIso.slice(0, 4));
    if (year < 100) year += 2000;
    return coerceDue(year, mo, d, todayIso) || coerceDue(year, d, mo, todayIso);
  }
  const lowered = text.toLowerCase();
  const names = Object.keys(LEX.MONTHS).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const month = LEX.MONTHS[name];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ascii = /^[\x00-\x7F]+$/.test(name);
    const pat = ascii
      ? new RegExp(`(?:(\\d{1,2})\\.?\\s*${escaped}\\b)|(?:\\b${escaped}\\s+(\\d{1,2})\\b)`, "i")
      : new RegExp(`(\\d{1,2})\\.?\\s*${escaped}|${escaped}\\s+(\\d{1,2})`);
    m = ascii ? lowered.match(pat) : text.match(pat) || lowered.match(pat);
    if (!m) continue;
    const day = Number(m[1] || m[2]);
    const iso = coerceDue(Number(todayIso.slice(0, 4)), month, day, todayIso);
    if (iso) return iso;
  }
  return null;
}

function classify(text) {
  if (billKind(text)) return "bill";
  if (containsAny(text, LEX.MED_HINTS)) return "medicine";
  if (LEX.HEALTH_HINTS && containsAny(text, LEX.HEALTH_HINTS)) return "health";
  if (LEX.SCHOOL_HINTS && containsAny(text, LEX.SCHOOL_HINTS)) return "school";
  if (LEX.WORK_HINTS && containsAny(text, LEX.WORK_HINTS)) return "work";
  if (containsAny(text, LEX.ERRAND_HINTS)) return "errand";
  return "note";
}

function parseTask(text) {
  const raw = (text || "").trim();
  if (!raw) throw new Error("empty");
  const todayIso = cairoStamp().isoDate;
  const kind = billKind(raw);
  const category = classify(raw);
  let due = parseDue(raw, todayIso);
  if (category === "bill" && !due) {
    const y = Number(todayIso.slice(0, 4));
    const mo = Number(todayIso.slice(5, 7));
    due = `${y}-${String(mo).padStart(2, "0")}-${String(lastDayOfMonth(y, mo)).padStart(2, "0")}`;
  }
  return {
    title: kind ? LEX.BILL_TITLES[kind] : raw.replace(/\s+/g, " ").slice(0, 80) || "Task",
    raw,
    category,
    bill_kind: kind,
    amount: parseAmount(raw),
    due,
    time: parseTime(raw.toLowerCase()),
  };
}

function openTasks(tasks) {
  return tasks.filter((t) => !t.done);
}

function kindsOf(tasks) {
  return new Set(tasks.filter((t) => t.bill_kind && !t.done).map((t) => t.bill_kind));
}

function hasText(tasks, needle) {
  const n = needle.toLowerCase();
  return tasks.some((t) => !t.done && ((t.raw || t.title || "").toLowerCase().includes(n)));
}

function item(code, kind, add, params) {
  return { code, kind: kind || "move", add: add || null, params: params || {} };
}

function relatedSuggestions(task, existing, briefing) {
  const out = [];
  const kinds = kindsOf(existing);
  const kind = task.bill_kind;
  const temp = ((briefing || {}).weather || {}).temp_c;
  if (kind) {
    for (const nxt of RELATED_MAP[kind] || []) {
      if (!kinds.has(nxt)) out.push(item(`related_${nxt}`, "related", nxt, { from: kind, next: nxt }));
    }
  }
  if (task.category === "medicine" && !hasText(existing, "refill") && !hasText(existing, "pharmacy")) {
    out.push(item("related_refill", "related", "pharmacy refill this week"));
  }
  if (task.category === "errand" && !hasText(existing, "bread")) {
    out.push(item("related_staples", "related", "buy bread"));
  }
  if (task.category === "errand" && temp != null && Number(temp) >= 32 && !hasText(existing, "drinking water")) {
    out.push(item("related_drink", "related", "buy drinking water"));
  }
  if (task.category === "health" && !hasText(existing, "water")) {
    out.push(item("related_hydrate", "related", "drink water today"));
  }
  if (task.category === "school" && !hasText(existing, "revise") && !hasText(existing, "study")) {
    out.push(item("related_revise", "related", "revise 30 min tonight"));
  }
  if (task.category === "work" && !hasText(existing, "agenda")) {
    out.push(item("related_agenda", "related", "prep agenda"));
  }
  return out.slice(0, 3);
}

function slotFor(hour) {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function planDay(profile, tasks, briefing) {
  const now = cairoStamp();
  const today = now.isoDate;
  const hour = now.hour;
  const slot = slotFor(hour);
  const weekday = now.weekday;
  const weather = (briefing || {}).weather || {};
  const fx = (briefing || {}).fx || {};
  const temp = weather.temp_c;
  const humidity = weather.humidity;
  const wind = weather.wind_kmh;
  const code = weather.code;
  const usd = fx.usd_egp;
  const open = openTasks(tasks);
  const overdue = open.filter((t) => t.due && t.due < today);
  const dueToday = open.filter((t) => t.due === today);
  const dueWeek = open.filter((t) => t.due && t.due >= today && t.due <= plusDays(today, 7));
  const medsToday = dueToday.filter((t) => t.category === "medicine");
  const errands = open.filter((t) => t.category === "errand");
  const bills = open.filter((t) => t.category === "bill");
  const raining = RAIN.has(code);
  const hot = temp != null && Number(temp) >= 32;
  const humid = humidity != null && Number(humidity) >= 55 && hot;
  const windy = wind != null && Number(wind) >= 28;
  const friday = weekday === 4;
  const saturday = weekday === 5;
  const monthEnd = now.day >= 25;
  const name = (profile.name || "").trim() || "there";
  const work = profile.work || "flex";
  const household = profile.household || "self";
  const watchFx = Boolean(profile.watch_fx);
  const errandWindow = profile.errand_window || "flex";
  const takesMeds = Boolean(profile.meds);
  const items = [];

  if (overdue.length) {
    items.push(item("overdue_first", "warn", null, { title: overdue[0].title || overdue[0].raw || "bill", count: overdue.length }));
  }
  if (bills.length >= 2) items.push(item("batch_bills", "move", null, { count: bills.length }));
  if (errands.length >= 2 && !raining) items.push(item("one_trip", "move", null, { count: errands.length }));
  if (medsToday.length) items.push(item("meds_today", "habit", null, { time: medsToday[0].time || "" }));
  else if (takesMeds && !open.some((t) => t.category === "medicine")) {
    items.push(item("ask_meds", "habit", "medicine tonight 9pm"));
  }
  if (slot === "night") items.push(item("tonight_quiet", "habit"));
  else if (raining) items.push(item("rain_errands", "move"));
  else if (humid) items.push(item("heat_humid", "move", null, { temp: Math.round(Number(temp)), humidity: Math.trunc(humidity) }));
  else if (hot && work === "commute" && hour >= 6 && hour < 16) {
    items.push(item("heat_commute", "move", null, { temp: Math.round(Number(temp)) }));
  } else if (hot && work === "remote") {
    items.push(item("heat_remote", "move", null, { temp: Math.round(Number(temp)) }));
  } else if (hot && errandWindow === "morning" && hour >= 11) {
    items.push(item("heat_missed_morning", "move", null, { temp: Math.round(Number(temp)) }));
  }
  if (windy && work === "commute" && !raining) items.push(item("wind_commute", "move"));
  if (friday) items.push(item("friday_cairo"));
  else if (saturday && (household === "family" || household === "couple")) items.push(item("saturday_family", "habit"));
  else if (weekday === 6 && hour >= 17) items.push(item("week_prep", "habit"));
  if (household === "family" && weekday < 4 && hour >= 6 && hour <= 9) items.push(item("school_run", "habit"));
  if (watchFx && usd != null && Number(usd) >= 50) items.push(item("dollar_high", "warn", null, { rate: usd }));
  if (monthEnd) {
    const missing = ["electricity", "water", "internet"].filter((k) => !kindsOf(open).has(k));
    if (missing.length) items.push(item("month_end_bills", "related", missing[0], { next: missing[0] }));
  }
  if (work === "commute" && hour >= 7 && hour <= 10 && !raining) items.push(item("commute_window"));
  if (errandWindow === "evening" && hour < 17 && dueToday.some((t) => t.category === "errand")) {
    items.push(item("hold_errands"));
  }
  if (!open.length) {
    items.push(item("empty_start", "related", monthEnd ? "electricity this month" : "what is due this week"));
  }
  if (dueWeek.length && !overdue.length && (slot === "morning" || slot === "afternoon")) {
    items.push(item("week_due", "habit", null, { title: dueWeek[0].title || dueWeek[0].raw, count: dueWeek.length }));
  }

  const seen = new Set();
  const slim = [];
  for (const row of items) {
    if (seen.has(row.code)) continue;
    seen.add(row.code);
    slim.push(row);
    if (slim.length === 5) break;
  }
  let nxt = slim.find((row) => row.code === "overdue_first") || slim.find((row) => row.add) || null;
  let headline = "headline_clear";
  if (overdue.length) headline = "headline_overdue";
  else if (slot === "night") headline = "headline_night";
  else if (raining) headline = "headline_rain";
  else if (friday) headline = "headline_friday";
  else if (hot) headline = "headline_heat";
  return {
    headline,
    name,
    when: now.isoMinutes,
    slot,
    next: nxt,
    items: slim,
    related: open.length ? relatedSuggestions(open[0], open.slice(1), briefing) : [],
  };
}

async function getBriefing() {
  const weatherUrl =
    "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Africa%2FCairo";
  const fxUrl = "https://open.er-api.com/v6/latest/USD";
  let weather = null;
  let fx = null;
  const errors = [];
  try {
    const data = await (await fetch(weatherUrl)).json();
    const current = data.current || {};
    weather = {
      temp_c: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      wind_kmh: current.wind_speed_10m,
      code: Number(current.weather_code || 0),
    };
  } catch (err) {
    errors.push("weather");
  }
  try {
    const data = await (await fetch(fxUrl)).json();
    const egp = (data.rates || {}).EGP;
    fx = { usd_egp: egp != null ? Math.round(Number(egp) * 100) / 100 : null };
  } catch (err) {
    errors.push("fx");
  }
  return { city: "Cairo", weather, fx, errors };
}
