/* Optional Google sign-in + cloud sync via Firebase.
   Loads only when firebase-config.js has real values; otherwise the app
   stays fully local and the account UI stays hidden. */

const cfg = (window.LAZEM_FIREBASE) || {};
const enabled = !!(cfg.apiKey && cfg.projectId && cfg.appId);
if (enabled) bootstrap();

async function bootstrap() {
  const V = "https://www.gstatic.com/firebasejs/10.13.2";
  let app, auth, db, fns, authFns, dbFns;
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import(`${V}/firebase-app.js`),
      import(`${V}/firebase-auth.js`),
      import(`${V}/firebase-firestore.js`),
    ]);
    app = appMod.initializeApp(cfg);
    authFns = authMod;
    dbFns = dbMod;
    auth = authMod.getAuth(app);
    db = dbMod.getFirestore(app);
  } catch (e) {
    // Offline or blocked — stay local, hide the account UI.
    return;
  }

  let uid = null;
  let unsub = null;
  let pushTimer = null;

  const HOUSE_STORE = "lazem.household.v1";
  const houseId = () => { try { return localStorage.getItem(HOUSE_STORE) || ""; } catch { return ""; } };
  const setHouse = (id) => { try { if (id) localStorage.setItem(HOUSE_STORE, id); else localStorage.removeItem(HOUSE_STORE); } catch {} };
  const ref = () => dbFns.doc(db, houseId() ? "households" : "users", houseId() || uid);

  function paintHouse() {
    const status = document.getElementById("householdStatus");
    const start = document.getElementById("houseStartBtn");
    const leave = document.getElementById("houseLeaveBtn");
    const id = houseId();
    if (status) status.textContent = id ? (window.lazemT ? window.lazemT("houseCode", { code: id }) : ("Code " + id)) : (window.lazemT ? window.lazemT("houseNote") : "");
    if (start) start.hidden = !!id;
    if (leave) leave.hidden = !id;
  }
  window.lazemPaintHouse = paintHouse;

  async function startHouse() {
    if (!uid) return;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const data = window.lazemGetSyncData ? window.lazemGetSyncData() : { tasks: [] };
    await dbFns.setDoc(dbFns.doc(db, "households", code), { ...data, members: [uid], updatedAt: Date.now() });
    await dbFns.setDoc(dbFns.doc(db, "invites", code), { householdId: code });
    setHouse(code);
    listen();
    paintHouse();
    if (window.lazemToast) window.lazemToast(window.lazemT ? window.lazemT("houseCode", { code: code }) : code);
  }

  async function joinHouse(code) {
    const clean = String(code || "").trim().toUpperCase();
    if (!uid || clean.length < 4) return;
    const invite = await dbFns.getDoc(dbFns.doc(db, "invites", clean));
    if (!invite.exists()) throw new Error("missing");
    await dbFns.updateDoc(dbFns.doc(db, "households", clean), { members: dbFns.arrayUnion(uid) });
    setHouse(clean);
    listen();
    paintHouse();
    if (window.lazemToast) window.lazemToast(window.lazemT ? window.lazemT("houseJoined") : "joined");
  }

  function leaveHouse() {
    setHouse("");
    listen();
    paintHouse();
    if (window.lazemToast) window.lazemToast(window.lazemT ? window.lazemT("houseLeft") : "left");
  }

  function pushNow() {
    if (!uid) return;
    const data = window.lazemGetSyncData ? window.lazemGetSyncData() : null;
    if (!data) return;
    const payload = { ...data, updatedAt: data.updatedAt || Date.now() };
    if (houseId()) payload.members = dbFns.arrayUnion(uid);
    dbFns.setDoc(ref(), payload, { merge: true }).catch(() => {});
  }

  async function listen(preferCloud) {
    if (unsub) { unsub(); unsub = null; }
    if (!uid) return;
    try {
      const snap = await dbFns.getDoc(ref());
      const local = window.lazemGetSyncData ? window.lazemGetSyncData() : { tasks: [], updatedAt: 0 };
      const localCount = (local.tasks && local.tasks.length) || 0;
      if (snap.exists()) {
        const cloud = snap.data();
        const cloudNewer = (cloud.updatedAt || 0) >= (local.updatedAt || 0);
        if (preferCloud || cloudNewer || localCount === 0) {
          if (window.lazemApplyRemote) window.lazemApplyRemote(cloud);
        } else {
          pushNow();
        }
      } else if (!preferCloud) {
        pushNow();
      }
    } catch (e) {}
    unsub = dbFns.onSnapshot(ref(), (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const cloud = snap.data();
      const local = window.lazemGetSyncData ? window.lazemGetSyncData() : { updatedAt: 0 };
      if ((cloud.updatedAt || 0) < (local.updatedAt || 0)) return;
      if (window.lazemApplyRemote) window.lazemApplyRemote(cloud);
    });
  }

  window.lazemSync = {
    signIn() {
      const provider = new authFns.GoogleAuthProvider();
      const wantCal = window.lazemWantsMeetings && window.lazemWantsMeetings();
      if (wantCal) {
        provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
        provider.setCustomParameters({ prompt: "consent", include_granted_scopes: "true" });
      }
      authFns.signInWithPopup(auth, provider).then((result) => {
        if (!wantCal) return;
        const cred = authFns.GoogleAuthProvider.credentialFromResult(result);
        const token = (cred && cred.accessToken) || (result && result._tokenResponse && result._tokenResponse.oauthAccessToken);
        if (token && window.lazemPullGoogleCalendar) {
          window.lazemPullGoogleCalendar(token);
          return;
        }
        if (window.lazemCalendarStatus) window.lazemCalendarStatus(window.lazemT ? window.lazemT("calendarMiss") : "");
      }).catch((e) => {
        if (window.lazemCalendarStatus) window.lazemCalendarStatus((e && e.message) || (window.lazemT ? window.lazemT("connErr") : ""));
      });
    },
    signOut() { authFns.signOut(auth).catch(() => {}); },
    queuePush() {
      if (!uid) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 1200);
    },
  };

  const startBtn = document.getElementById("houseStartBtn");
  const joinBtn = document.getElementById("houseJoinBtn");
  const leaveBtn = document.getElementById("houseLeaveBtn");
  if (startBtn) startBtn.addEventListener("click", () => startHouse().catch(() => window.lazemToast && window.lazemToast(window.lazemT ? window.lazemT("houseErr") : "error")));
  if (joinBtn) joinBtn.addEventListener("click", () => {
    const code = (document.getElementById("houseCode") || {}).value;
    joinHouse(code).catch(() => window.lazemToast && window.lazemToast(window.lazemT ? window.lazemT("houseErr") : "error"));
  });
  if (leaveBtn) leaveBtn.addEventListener("click", leaveHouse);

  authFns.onAuthStateChanged(auth, async (user) => {
    if (unsub) { unsub(); unsub = null; }
    uid = user ? user.uid : null;
    if (window.lazemAuthUI) {
      window.lazemAuthUI(user ? { name: user.displayName, email: user.email, photo: user.photoURL } : null);
    }
    paintHouse();
    if (!user) return;
    listen(false);
  });
}
