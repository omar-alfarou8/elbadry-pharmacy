// ========== ضع الرابط هنا ============
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwYOkqBWmZ2Ts0H-PBDHK3UcDhxIP4GKxX0gaZzYMH4C8Odr26snNh15prk4ULCY20L/exec';
// =====================================

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('orderForm');
    const alertBox = document.getElementById('alertBox');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Check if URL is updated
            if (GOOGLE_SCRIPT_URL.includes('ضع_واستبدل')) {
                alertBox.className = 'alert alert-error';
                alertBox.textContent = 'الرجاء إضافة رابط Google Script الخاص بك في ملف script.js لكي يتم إرسال الطلب.';
                alertBox.classList.remove('hidden');
                return;
            }

            // Reset alert
            alertBox.className = 'alert hidden';
            alertBox.textContent = '';

            // Show loading state
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');
            submitBtn.disabled = true;

            const formData = new FormData(form);

            try {
                // Submit to Google Apps Script
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: new URLSearchParams(formData)
                });

                const result = await response.json();

                alertBox.classList.remove('hidden');
                
                if (result.success) {
                    alertBox.classList.add('alert-success');
                    alertBox.textContent = result.message || 'تم استلام طلبك بنجاح. سنتواصل معك في أقرب وقت!';
                    form.reset();
                } else {
                    alertBox.classList.add('alert-error');
                    alertBox.textContent = result.message || 'حدث خطأ غير متوقع.';
                }
            } catch (error) {
                console.error('Error submitting form:', error);
                alertBox.classList.remove('hidden');
                alertBox.classList.add('alert-error');
                alertBox.textContent = 'حدث خطأ في الاتصال بالخادم. يرجى المحاولة لاحقاً.';
            } finally {
                // Restore button state
                btnText.classList.remove('hidden');
                btnLoader.classList.add('hidden');
                submitBtn.disabled = false;
            }
        });
    }
});
