// assets/js/firebase.client.js
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// ⛳️ Firebase Config (តាម project របស់អ្នក)
const firebaseConfig = {
  apiKey: "AIzaSyBq4B-6uPnwMZSdxz8zuERgLIEAyVtYZeo",
  authDomain: "dbreportphd.firebaseapp.com",
  projectId: "dbreportphd",
  storageBucket: "dbreportphd.appspot.com",
  messagingSenderId: "589373701063",
  appId: "1:589373701063:web:9b6bdfdc44a705ae78b7e2",
  measurementId: "G-GEKR9LE4M7"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Keep session locally
try { await setPersistence(auth, browserLocalPersistence); } catch {}
