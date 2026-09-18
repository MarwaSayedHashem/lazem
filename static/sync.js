/* Optional Google sign-in + cloud sync via Firebase.
   Loads only when firebase-config.js has real values; otherwise the app
   stays fully local and the account UI stays hidden. */

const cfg = (window.LAZEM_FIREBASE) || {};
const enabled = !!(cfg.apiKey && cfg.projectId && cfg.appId);
const authArea = document.getElementById("authArea");

if (!enabled) {
  if (authArea) authArea.hidden = true;
} else {
  bootstrap();
}

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
    if (authArea) authArea.hidden = true;
    return;
  }

  if (authArea) authArea.hidden = false;

  let uid = null;
  let unsub = null;
  let pushTimer = null;

  const ref = () => dbFns.doc(db, "users", uid);

  function pushNow() {
    if (!uid) return;
    const data = window.lazemGetSyncData ? window.lazemGetSyncData() : null;
    if (!data) return;
    dbFns.setDoc(ref(), { ...data, updatedAt: data.updatedAt || Date.now() }).catch(() => {});
  }

  window.lazemSync = {
    signIn() {
      const provider = new authFns.GoogleAuthProvider();
      authFns.signInWithPopup(auth, provider).catch(() => {
        // popup blocked -> fall back to redirect
        try { authFns.signInWithRedirect(auth, provider); } catch (e) {}
      });
    },
    signOut() { authFns.signOut(auth).catch(() => {}); },
    queuePush() {
      if (!uid) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 1200);
    },
  };

  authFns.onAuthStateChanged(auth, async (user) => {
    if (unsub) { unsub(); unsub = null; }
    uid = user ? user.uid : null;
    if (window.lazemAuthUI) {
      window.lazemAuthUI(user ? { name: user.displayName, email: user.email, photo: user.photoURL } : null);
    }
    if (!user) return;

    // Initial merge: newer of local vs cloud wins (last-write-wins).
    try {
      const snap = await dbFns.getDoc(ref());
      const local = window.lazemGetSyncData ? window.lazemGetSyncData() : { tasks: [], updatedAt: 0 };
      const localCount = (local.tasks && local.tasks.length) || 0;
      if (snap.exists()) {
        const cloud = snap.data();
        const cloudNewer = (cloud.updatedAt || 0) >= (local.updatedAt || 0);
        if (cloudNewer || localCount === 0) {
          if (window.lazemApplyRemote) window.lazemApplyRemote(cloud);
        } else {
          pushNow();
        }
      } else {
        pushNow(); // first sign-in: seed the cloud with what's on this device
      }
    } catch (e) {}

    // Live updates from other devices (ignore our own local echoes).
    unsub = dbFns.onSnapshot(ref(), (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      if (window.lazemApplyRemote) window.lazemApplyRemote(snap.data());
    });
  });
}
