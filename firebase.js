// Import Firebase modules from CDN
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Your web app's Firebase configuration
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
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Expose Firebase services and helpers globally
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseStorage = storage;

// Auth functions
window.firebaseSignIn = signInWithEmailAndPassword;
window.firebaseSignUp = createUserWithEmailAndPassword;
window.firebaseSignOut = signOut;
window.firebaseOnAuth = onAuthStateChanged;
window.firebaseUpdateProfile = updateProfile;

// Firestore functions
window.firestoreCollection = collection;
window.firestoreDoc = doc;
window.firestoreGetDoc = getDoc;
window.firestoreGetDocs = getDocs;
window.firestoreSetDoc = setDoc;
window.firestoreUpdateDoc = updateDoc;
window.firestoreDeleteDoc = deleteDoc;
window.firestoreQuery = query;
window.firestoreWhere = where;
window.firestoreOrderBy = orderBy;
window.firestoreAddDoc = addDoc;
window.firestoreServerTimestamp = serverTimestamp;

// Storage functions
window.storageRef = ref;
window.storageUploadBytes = uploadBytes;
window.storageGetDownloadURL = getDownloadURL;
window.storageDeleteObject = deleteObject;
