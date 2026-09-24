/* ============================================================
   Firebase config for optional Google sign-in + cloud sync.

   These are public web keys (safe in client code). Access is
   protected by Google sign-in + Firestore security rules, not
   by keeping these secret.

   When signed OUT, Lazem stays fully local. When signed in,
   tasks sync to this Firebase project (Firestore).
   ============================================================ */
window.LAZEM_FIREBASE = {
  apiKey: "AIzaSyA3ec35zUvU8YcVoRm9gIWG8sZpW1w97MM",
  authDomain: "lazem-432d9.firebaseapp.com",
  projectId: "lazem-432d9",
  storageBucket: "lazem-432d9.firebasestorage.app",
  messagingSenderId: "451835728435",
  appId: "1:451835728435:web:3595d405ef8636180e8946",
  measurementId: "G-8MN79ZGGCS",
};

/* Google Calendar / Classroom "Connect" buttons.
   Paste your OAuth Web client ID here (…apps.googleusercontent.com).
   While blank, the Google buttons stay hidden. Outlook stays visible. */
window.LAZEM_GOOGLE = {
  clientId: "",
};

/* Outlook calendar. Leave blank to paste the Entra app client ID in the app.
   Redirect URI to register: https://marwasayedhashem.github.io/lazem/ */
window.LAZEM_MICROSOFT = {
  clientId: "",
};
