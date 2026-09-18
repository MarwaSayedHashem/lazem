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
