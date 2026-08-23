import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

let firebaseConfig = {};

try {
  const res = await fetch('/api/config');
  if (res.ok) {
    const data = await res.json();
    if (data && data.apiKey) {
      firebaseConfig = data;
    }
  }
} catch (e) {
  console.warn("Could not load config from /api/config.", e);
}

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


