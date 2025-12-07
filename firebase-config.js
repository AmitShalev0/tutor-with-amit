// Import Firebase modules from CDN
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithCustomToken,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
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
    storageBucket: "tutordesk-3cafb.appspot.com",
  messagingSenderId: "356804623998",
  appId: "1:356804623998:web:3587313df2c513d02ee22f",
  measurementId: "G-4LHV6QPX9J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (error) {
    console.warn('Analytics not initialized:', error.message);
}
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const isBrowser = typeof window !== 'undefined';
const isLocalHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);

let functionsBase = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;
if (isBrowser) {
    const override = window.localStorage?.getItem('firebaseFunctionsBaseOverride');
    const emulatorOptIn = window.localStorage?.getItem('useFunctionsEmulator') === 'true';
    if (override) {
        functionsBase = override;
    } else if (isLocalHost && emulatorOptIn) {
        functionsBase = `http://127.0.0.1:5001/${firebaseConfig.projectId}/us-central1`;
    }
}

// Expose Firebase services and helpers globally
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseStorage = storage;
window.firebaseFunctionsBase = functionsBase;

// Auth functions
window.firebaseSignIn = signInWithEmailAndPassword;
window.firebaseSignUp = createUserWithEmailAndPassword;
window.firebaseSignOut = signOut;
window.firebaseOnAuth = onAuthStateChanged;
window.firebaseUpdateProfile = updateProfile;
window.firebaseSignInWithCustomToken = signInWithCustomToken;
window.firebaseSignInWithPopup = signInWithPopup;
window.firebaseGoogleProvider = new GoogleAuthProvider();

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
window.firestoreLimit = limit;
window.firestoreAddDoc = addDoc;
window.firestoreServerTimestamp = serverTimestamp;
window.firestoreArrayUnion = arrayUnion;
window.firestoreArrayRemove = arrayRemove;

// Storage functions
window.storageRef = ref;
window.storageUploadBytes = uploadBytes;
window.storageGetDownloadURL = getDownloadURL;
window.storageDeleteObject = deleteObject;

// Export for ES6 modules
export {
    addDoc, analytics, app, arrayRemove, arrayUnion, auth, collection, createUserWithEmailAndPassword, db, deleteDoc, deleteObject, doc,
    functionsBase,
    getDoc,
    getDocs, getDownloadURL, limit, onAuthStateChanged, orderBy, query, ref, serverTimestamp, setDoc, signInWithCustomToken, signInWithEmailAndPassword, signOut, storage, updateDoc, updateProfile, uploadBytes, where
};

