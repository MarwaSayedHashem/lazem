/* Optional "Connect" buttons for Google Calendar & Classroom.
   Uses Google Identity Services token flow entirely in the browser.
   Hidden until firebase-config.js has a Google OAuth clientId. */

const CID = (window.LAZEM_GOOGLE && window.LAZEM_GOOGLE.clientId) || "";
const MS_STORE = "lazem.ms.client.v1";
const area = document.getElementById("connectArea");

function msClientId() {
  return (window.LAZEM_MICROSOFT && window.LAZEM_MICROSOFT.clientId) || localStorage.getItem(MS_STORE) || "";
}

if (area) area.hidden = false;
if (!CID) {
  const gCal = document.getElementById("connCalBtn");
  const gClass = document.getElementById("connClassBtn");
  if (gCal) gCal.hidden = true;
  if (gClass) gClass.hidden = true;
}
window.lazemConnect = { outlook: () => connectOutlook() };
if (CID) boot();

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
    return;
  }
  if (area) area.hidden = false;
  window.lazemConnect.calendar = () => connect("calendar");
  window.lazemConnect.classroom = () => connect("classroom");
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

function mapOutlookEvent(ev) {
  const start = ev.start || {};
  const raw = String(start.dateTime || "");
  const d = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  let tm = null;
  if (!ev.isAllDay && raw.length >= 16) tm = raw.slice(11, 16);
  const title = (ev.subject || "Event").slice(0, 80);
  const place = ev.location && ev.location.displayName;
  return { t: title, r: title, c: classifyText(title), d, tm, pl: place || null };
}

async function loadMsal() {
  const mod = await import("https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.27.0/+esm");
  return mod.PublicClientApplication;
}

async function connectOutlook() {
  let clientId = msClientId();
  if (!clientId && window.lazemOutlookSetup) clientId = await window.lazemOutlookSetup();
  if (!clientId) return;
  try {
    const PublicClientApplication = await loadMsal();
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: location.origin + location.pathname,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await app.initialize();
    const result = await app.loginPopup({ scopes: ["User.Read", "Calendars.Read"] });
    const token = result && result.accessToken;
    if (!token) throw new Error("no token");
    const items = await fetchOutlook(token);
    if (window.lazemImportItems) window.lazemImportItems(items, "Outlook");
  } catch (e) {
    if (window.lazemConnectError) window.lazemConnectError();
  }
}

async function fetchOutlook(token) {
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 86400000);
  const url =
    "https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=" +
    encodeURIComponent(start.toISOString()) +
    "&endDateTime=" +
    encodeURIComponent(end.toISOString()) +
    "&$select=subject,start,location,isAllDay&$orderby=start/dateTime&$top=50";
  const r = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token,
      Prefer: 'outlook.timezone="Africa/Cairo"',
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data && data.error && data.error.message) || "graph");
  return (data.value || []).map(mapOutlookEvent).filter(Boolean);
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
