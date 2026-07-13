import { db, storage } from './firebase-config.js';
import { collection, addDoc, doc, onSnapshot, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

const orderForm = document.getElementById('orderForm');
const submitBtn = document.getElementById('submitBtn');
const alertBox = document.getElementById('alertBox');
const orderDetailsInput = document.getElementById('orderDetails');

const btnText = document.querySelector('.btn-text');
const btnLoader = document.querySelector('.btn-loader');

const prescriptionImageInput = document.getElementById('prescriptionImage');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');

let selectedImageFile = null;

if (prescriptionImageInput) {
    prescriptionImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreviewContainer.style.display = 'flex';
            }
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', () => {
        prescriptionImageInput.value = '';
        selectedImageFile = null;
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '';
    });
}

// Check URL Params and LocalStorage Cart
const urlParams = new URLSearchParams(window.location.search);
let cart = JSON.parse(localStorage.getItem('elbadry_cart')) || [];
let cartTotal = 0;

// Delivery fees logic
let deliveryFees = {};
onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
    if (docSnap.exists()) {
        deliveryFees = docSnap.data().fees || {};
        updateDeliveryFeeUI();
    }
});

const governorateSelect = document.getElementById('governorate');
const orderDeliveryInfo = document.getElementById('orderDeliveryInfo');
const orderDeliveryFeeVal = document.getElementById('orderDeliveryFeeVal');
const regionGroup = document.getElementById('regionGroup');
const regionSelect = document.getElementById('regionSelect');

let currentDeliveryFee = 0;

function updateDeliveryFeeUI() {
    if (!governorateSelect || !orderDeliveryInfo) return;
    
    let selectedGov = governorateSelect.value;

    if (selectedGov === 'الشرقية') {
        if(regionGroup) regionGroup.style.display = 'block';
        if(regionSelect) regionSelect.required = true;
        
        if (regionSelect && regionSelect.value === 'بلبيس') {
            selectedGov = 'الشرقية (بلبيس)';
        } else if (regionSelect && regionSelect.value === 'مناطق أخرى') {
            selectedGov = 'الشرقية (مناطق أخرى)';
        } else {
            selectedGov = null;
        }
    } else {
        if(regionGroup) regionGroup.style.display = 'none';
        if(regionSelect) regionSelect.required = false;
    }
    
    if (selectedGov) {
        currentDeliveryFee = deliveryFees[selectedGov] !== undefined ? deliveryFees[selectedGov] : 50;
        orderDeliveryFeeVal.textContent = `${currentDeliveryFee} ج.م`;
        orderDeliveryInfo.style.display = 'block';
    } else {
        currentDeliveryFee = 0;
        orderDeliveryInfo.style.display = 'none';
        orderDeliveryFeeVal.textContent = `0 ج.م`;
    }
}

if (governorateSelect) {
    governorateSelect.addEventListener('change', updateDeliveryFeeUI);
}

if (regionSelect) {
    regionSelect.addEventListener('change', updateDeliveryFeeUI);
}

if (urlParams.get('from') === 'cart' && cart.length > 0) {
    let orderDetailsText = "طلب من المتجر:\n";
    cart.forEach(item => {
        orderDetailsText += `- ${item.name} | الكمية: ${item.quantity} | السعر: ${item.price} ج.م\n`;
        cartTotal += (item.price * item.quantity);
    });
    orderDetailsText += `\nإجمالي المنتجات: ${cartTotal} ج.م\n`;
    orderDetailsInput.value = orderDetailsText;
}

orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;
    alertBox.classList.add('hidden');
    
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    let governorate = document.getElementById('governorate').value;
    const region = regionSelect ? regionSelect.value : '';
    if (governorate === 'الشرقية' && region) {
        governorate = `الشرقية (${region})`;
    }
    
    const address = document.getElementById('address').value || 'غير محدد';
    const orderDetails = orderDetailsInput.value;
    
    let prescriptionUrl = null;
    if (selectedImageFile) {
        try {
            const fileName = Date.now() + '_' + selectedImageFile.name;
            const storageRef = ref(storage, 'prescriptions/' + fileName);
            const snapshot = await uploadBytes(storageRef, selectedImageFile);
            prescriptionUrl = await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Error uploading image to Firebase: ", error);
            alertBox.textContent = 'نعتذر، حدثت مشكلة أثناء رفع الصورة. يرجى التواصل معنا لحل المشكله.';
            alertBox.className = 'alert alert-error';
            alertBox.classList.remove('hidden');
            
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
            return; // Stop submission entirely since upload failed
        }
    }
    
    const finalOrderDetails = orderDetails + `\nرسوم التوصيل: ${currentDeliveryFee} ج.م`;
    const finalTotal = cartTotal > 0 ? cartTotal + currentDeliveryFee : currentDeliveryFee;

    const orderData = {
        name,
        phone,
        governorate,
        address,
        orderDetails: finalOrderDetails,
        deliveryFee: currentDeliveryFee,
        prescriptionUrl,
        items: cart,
        total: finalTotal,
        status: 'new',
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "orders"), orderData);

        // Decrement stock in Firestore for items in the cart
        for (let item of cart) {
            if (item.stock !== undefined && item.stock !== null && item.stock !== '') {
                try {
                    const productRef = doc(db, 'products', item.id);
                    await updateDoc(productRef, {
                        stock: increment(-Number(item.quantity))
                    });
                } catch (stockErr) {
                    console.error(`Failed to decrement stock for product ${item.id}:`, stockErr);
                }
            }
        }
        
        // Show Success
        alertBox.textContent = 'تم إرسال طلبك بنجاح! سنتواصل معك قريباً.';
        alertBox.className = 'alert alert-success';
        
        // Clear Cart and Form
        localStorage.removeItem('elbadry_cart');
        orderForm.reset();
        
        // Clear image preview
        selectedImageFile = null;
        if(prescriptionImageInput) prescriptionImageInput.value = '';
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '';
        
        // Reset UI Button after 3 seconds
        setTimeout(() => {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
        }, 3000);
        
    } catch (error) {
        console.error("Order submission error: ", error);
        alertBox.textContent = 'حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.';
        alertBox.className = 'alert alert-error';
        
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
});
