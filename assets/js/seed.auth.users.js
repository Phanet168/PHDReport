<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
  import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

  const app = initializeApp({
    apiKey: "AIzaSyBq4B-6uPnwMZSdxz8zuERgLIEAyVtYZeo",
    authDomain: "dbreportphd.firebaseapp.com",
    projectId: "dbreportphd",
  });
  const auth = getAuth(app);

  // បង្កើតគណនីសម្រាប់ username "phanet"
  const email = "phanet@dbreportphd.local";
  const password = "P@ssw0rd123"; // ប្ដូរតាមចិត្ត
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Created:", cred.user.uid, email);
  } catch (e) {
    console.error("Create failed:", e.code, e.message);
  }
</script>
