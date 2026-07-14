import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// Check if already logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = '/dashboard';
    }
});

const loginForm = document.getElementById('loginForm');
const loginAlert = document.getElementById('loginAlert');
const submitBtn = document.getElementById('submitBtn');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // UI Update
    submitBtn.innerHTML = 'جاري التحقق... <span class="spinner"></span>';
    submitBtn.disabled = true;
    loginAlert.classList.add('hidden');
    loginAlert.className = 'alert';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginAlert.textContent = 'تم تسجيل الدخول بنجاح! جاري التحويل...';
        loginAlert.classList.add('alert-success');
        loginAlert.classList.remove('hidden');

        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 1000);

    } catch (error) {
        let errorMsg = 'حدث خطأ في تسجيل الدخول.';
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMsg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        }

        loginAlert.textContent = errorMsg;
        loginAlert.classList.add('alert-error');
        loginAlert.classList.remove('hidden');

        submitBtn.innerHTML = 'تسجيل الدخول <i class="fa-solid fa-arrow-right-to-bracket"></i>';
        submitBtn.disabled = false;
    }
});
