/* Optional "Connect" buttons for Google Calendar & Classroom.
   Uses Google Identity Services token flow entirely in the browser.
   Hidden until firebase-config.js has a Google OAuth clientId. */

const CID = (window.LAZEM_GOOGLE && window.LAZEM_GOOGLE.clientId) || "";
const area = document.getElementById("connectArea");

if (!CID) {
  if (area) area.hidden = true;
} else {
  boot();
}

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  classroom: "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly",
};

async function boot() {
  try {
    await loadGIS();
  } catch (e) {
    if (area) area.hidden = true;
    return;
  }
  if (area) area.hidden = false;
  window.lazemConnect = {
    calendar: () => connect("calendar"),
    classroom: () => connect("classroom"),
  };
}

function getToken(scope) {
  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CID,
        scope,
        callback: (resp) => {
          if (resp && resp.access_token) resolve(resp.access_token);
          else reject(resp);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });
}

async function connect(kind) {
  try {
    const token = await getToken(SCOPES[kind]);
    const items = kind === "calendar" ? await fetchCalendar(token) : await fetchClassroom(token);
    if (window.lazemImportItems) window.lazemImportItems(items, kind === "calendar" ? "Google Calendar" : "Google Classroom");
  } catch (e) {
    if (window.lazemConnectError) window.lazemConnectError();
  }
}

function classifyText(s) {
  try { return window.classify ? window.classify(s || "") : "note"; } catch (e) { return "note"; }
}

async function fetchCalendar(token) {
  const timeMin = new Date().toISOString();
  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=" +
    encodeURIComponent(timeMin) + "&maxResults=50&singleEvents=true&orderBy=startTime";
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  const data = await r.json();
  return (data.items || [])
    .map((ev) => {
      const start = ev.start || {};
      let d = null, tm = null;
      if (start.date) {
        d = start.date;
      } else if (start.dateTime) {
        const dt = new Date(start.dateTime);
        d = dt.toLocaleDateString("en-CA");
        tm = dt.toTimeString().slice(0, 5);
      }
      if (!d) return null;
      return { t: (ev.summary || "Event").slice(0, 80), r: ev.summary || "", c: classifyText(ev.summary || ""), d, tm, pl: ev.location || null };
    })
    .filter(Boolean);
}

async function fetchClassroom(token) {
  const h = { Authorization: "Bearer " + token };
  const cr = await (await fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=30", { headers: h })).json();
  const courses = cr.courses || [];
  const out = [];
  for (const c of courses) {
    try {
      const w = await (await fetch("https://classroom.googleapis.com/v1/courses/" + c.id + "/courseWork?pageSize=40", { headers: h })).json();
      (w.courseWork || []).forEach((cw) => {
        if (!cw.dueDate) return;
        const dd = cw.dueDate;
        const d = `${dd.year}-${String(dd.month).padStart(2, "0")}-${String(dd.day).padStart(2, "0")}`;
        let tm = null;
        if (cw.dueTime && cw.dueTime.hours != null) {
          tm = `${String(cw.dueTime.hours).padStart(2, "0")}:${String(cw.dueTime.minutes || 0).padStart(2, "0")}`;
        }
        out.push({ t: (cw.title || "Assignment").slice(0, 80), r: (c.name ? c.name + ": " : "") + (cw.title || ""), c: "school", d, tm });
      });
    } catch (e) {}
  }
  return out;
}
