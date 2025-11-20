import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCaGn37wfc76LOCg5UejFG4GswxQZNNEUA",
  authDomain: "tutordesk-3cafb.firebaseapp.com",
  projectId: "tutordesk-3cafb",
  storageBucket: "tutordesk-3cafb.firebasestorage.app",
  messagingSenderId: "356804623998",
  appId: "1:356804623998:web:3587313df2c513d02ee22f",
  measurementId: "G-4LHV6QPX9J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Expose helpers globally so other scripts can use them
window.firebaseAuth = auth;
window.firebaseSignIn = signInWithEmailAndPassword;
window.firebaseSignOut = signOut;
window.firebaseOnAuth = onAuthStateChanged;
