import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// تم ربط المشروع بنجاح بقاعدة البيانات الخاصة بك!
const firebaseConfig = {
  apiKey: "AIzaSyBX6-BSOS1dmDzhFU5prB5jf2kHANHcA7A",
  authDomain: "elbadry-pharmacy-60c74.firebaseapp.com",
  projectId: "elbadry-pharmacy-60c74",
  storageBucket: "elbadry-pharmacy-60c74.firebasestorage.app",
  messagingSenderId: "721540149826",
  appId: "1:721540149826:web:2735d84aa06655e449f3db",
  measurementId: "G-8Q35M70CB8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Enable Offline Multi-Tab Persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a a time.
        console.warn("Firestore persistence failed-precondition (multiple tabs open).");
    } else if (err.code == 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn("Firestore persistence is unimplemented in this browser.");
    } else {
        console.error("Firestore persistence error:", err);
    }
});

// Initialize Firebase Storage
export const storage = getStorage(app);

// Helper function to escape HTML entities for XSS prevention
export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}


