import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
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

// Initialize Firebase Storage
export const storage = getStorage(app);
