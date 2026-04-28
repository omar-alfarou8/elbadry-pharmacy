import { db } from './firebase-config.js';
import { collection, query, orderBy, getDocs, addDoc, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const productsGrid = document.getElementById('productsGrid');
const filterBtns = document.querySelectorAll('.filter-btn');

let allProducts = [];
// Delivery fees state
let deliveryFees = {};
onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
    if (docSnap.exists()) {
        deliveryFees = docSnap.data().fees || {};
        updateCartDeliveryUI();
    }
});

let cart = JSON.parse(localStorage.getItem('elbadry_cart')) || [];

// Load products
async function loadProducts() {
    try {
        const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        allProducts = [];
        querySnapshot.forEach((doc) => {
            allProducts.push({ id: doc.id, ...doc.data() });
        });

        renderProducts(allProducts);

    } catch (e) {
        console.error("Error loading products: ", e);
        productsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--error-color); padding: 50px;">حدث خطأ أثناء الاتصال بقاعدة البيانات. تأكد من إعداد Firebase بشكل صحيح.</div>`;
    }
}

let currentFilter = 'all';
let currentSearch = '';

function renderProducts(products) {
    if (products.length === 0) {
        productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-gray);">لا توجد منتجات مطابقة حالياً.</p>`;
        return;
    }

    productsGrid.innerHTML = '';

    products.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <img src="${prod.image}" alt="${prod.name}" class="product-img" loading="lazy">
            <div class="product-info">
                <div class="product-category">${prod.category}</div>
                <h3 class="product-name">${prod.name}</h3>
                <div class="product-price">${prod.price} ج.م</div>
                <div id="product-action-${prod.id}" class="product-action-container" data-name="${prod.name.replace(/"/g, '&quot;')}" data-price="${prod.price}" data-img="${prod.image}">
                </div>
            </div>
        `;
        productsGrid.appendChild(div);
    });

    updateGridActionsUI();
}

function applyFilters() {
    let filtered = allProducts;
    
    if (currentFilter !== 'all') {
        filtered = filtered.filter(p => p.category.includes(currentFilter) || currentFilter.includes(p.category));
    }
    
    if (currentSearch.trim() !== '') {
        const searchLower = currentSearch.toLowerCase().trim();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchLower));
    }
    
    renderProducts(filtered);
}

window.addFromGrid = function(id, name, price, img) {
    addToCart({ id, name, price, image: img });
};

function updateGridActionsUI() {
    const containers = document.querySelectorAll('.product-action-container');
    containers.forEach(container => {
        const id = container.id.replace('product-action-', '');
        const itemInCart = cart.find(i => i.id === id);
        
        if (itemInCart) {
            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(11, 128, 122, 0.1); border-radius: 8px; padding: 5px; margin-top: 10px;">
                    <button style="width: 30px; height: 30px; border-radius: 5px; background: white; border: 1px solid var(--border-color); cursor: pointer; color: var(--primary-color);" onclick="updateQty('${id}', 1)"><i class="fa-solid fa-plus"></i></button>
                    <span style="font-weight: bold; font-size: 16px; color: var(--text-color);">${itemInCart.quantity}</span>
                    <button style="width: 30px; height: 30px; border-radius: 5px; background: white; border: 1px solid var(--border-color); cursor: pointer; color: var(--primary-color);" onclick="updateQty('${id}', -1)"><i class="fa-solid fa-minus"></i></button>
                </div>
            `;
        } else {
            const name = container.dataset.name.replace(/'/g, "\\'");
            const img = container.dataset.img;
            const price = container.dataset.price;
            container.innerHTML = `
                <button class="add-to-cart-btn" onclick="addFromGrid('${id}', '${name}', ${price}, '${img}')">
                    <i class="fa-solid fa-cart-plus"></i> أضف للعربة
                </button>
            `;
        }
    });
}

// Filtering dynamically from Firebase Categories
const storeFiltersContainer = document.getElementById('storeFiltersContainer');

if (storeFiltersContainer) {
    onSnapshot(query(collection(db, 'categories'), orderBy('createdAt', 'asc')), (snapshot) => {
        storeFiltersContainer.innerHTML = '<button class="filter-btn active" data-filter="all">الكل</button>';
        
        snapshot.forEach(docSnap => {
            const cat = docSnap.data();
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.setAttribute('data-filter', cat.name);
            btn.textContent = cat.name;
            storeFiltersContainer.appendChild(btn);
        });

        // Re-attach listeners to new filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                currentFilter = e.target.getAttribute('data-filter');
                applyFilters();
            });
        });
    });
}

// Search Logic
const storeSearchInput = document.getElementById('storeSearchInput');
if (storeSearchInput) {
    storeSearchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        applyFilters();
    });
}

// ------------- Cart Logic -------------
const cartFloatBtn = document.getElementById('cartFloatBtn');
const cartModal = document.getElementById('cartModal');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartBadge = document.getElementById('cartBadge');
const cartItemsContainer = document.getElementById('cartItemsContainer');
const cartTotalVal = document.getElementById('cartTotalVal');
const goToCheckoutBtn = document.getElementById('goToCheckoutBtn');

cartFloatBtn.addEventListener('click', () => cartModal.classList.add('active'));
closeCartBtn.addEventListener('click', () => cartModal.classList.remove('active'));
cartModal.addEventListener('click', (e) => { if (e.target === cartModal) cartModal.classList.remove('active'); });

function addToCart(product) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    saveCart();
    updateCartUI();
}

// Global functions for cart UI manipulation
window.updateQty = function (id, delta) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.id !== id);
        }
        saveCart();
        updateCartUI();
    }
};

window.removeFromCart = function (id) {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    updateCartUI();
};

function saveCart() {
    localStorage.setItem('elbadry_cart', JSON.stringify(cart));
}

function updateCartUI() {
    let totalItems = 0;
    let totalPrice = 0;

    // Update Badge
    cart.forEach(item => totalItems += item.quantity);
    cartBadge.textContent = totalItems;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p style="text-align: center; color: var(--text-gray); margin-top: 50px;">عربة التسوق فارغة.</p>';
        cartTotalVal.textContent = '0 ج.م';
        goToCheckoutBtn.disabled = true;
        goToCheckoutBtn.style.opacity = '0.5';
        
        updateCartDeliveryUI(0);
        if (typeof updateGridActionsUI === 'function') {
            updateGridActionsUI();
        }
        return;
    }

    goToCheckoutBtn.disabled = false;
    goToCheckoutBtn.style.opacity = '1';

    let html = '';
    cart.forEach(item => {
        totalPrice += item.price * item.quantity;
        html += `
            <div class="cart-item">
                <img src="${item.image}" alt="" class="cart-item-img">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">${item.price} ج.م</div>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="updateQty('${item.id}', 1)"><i class="fa-solid fa-plus" style="font-size:10px;"></i></button>
                        <span style="font-weight: bold; width: 20px; text-align: center;">${item.quantity}</span>
                        <button class="qty-btn" onclick="updateQty('${item.id}', -1)"><i class="fa-solid fa-minus" style="font-size:10px;"></i></button>
                    </div>
                </div>
                <button class="remove-item" onclick="removeFromCart('${item.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    });

    cartItemsContainer.innerHTML = html;
    updateCartDeliveryUI(totalPrice);
    
    if (typeof updateGridActionsUI === 'function') {
        updateGridActionsUI();
    }
}

function updateCartDeliveryUI(baseTotal = null) {
    let currentTotal = baseTotal;
    if (currentTotal === null) {
        currentTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    
    const cartItemsTotalVal = document.getElementById('cartItemsTotalVal');
    const cartDeliveryDiv = document.getElementById('cartDeliveryDiv');
    const cartDeliveryVal = document.getElementById('cartDeliveryVal');
    const cartTotalVal = document.getElementById('cartTotalVal');
    const inlineGov = document.getElementById('inlineGovernorate');
    const inlineRegionGroup = document.getElementById('inlineRegionGroup');
    const inlineRegionSelect = document.getElementById('inlineRegionSelect');

    if (!cartItemsTotalVal) return;

    cartItemsTotalVal.textContent = `${currentTotal} ج.م`;

    let selectedGov = inlineGov ? inlineGov.value : '';
    
    if (selectedGov === 'الشرقية') {
        if (inlineRegionGroup) inlineRegionGroup.style.display = 'block';
        if (inlineRegionSelect) inlineRegionSelect.required = true;
        
        if (inlineRegionSelect && inlineRegionSelect.value === 'بلبيس') {
            selectedGov = 'الشرقية (بلبيس)';
        } else if (inlineRegionSelect && inlineRegionSelect.value === 'مناطق أخرى') {
            selectedGov = 'الشرقية (مناطق أخرى)';
        } else {
            selectedGov = null; 
        }
    } else {
        if (inlineRegionGroup) inlineRegionGroup.style.display = 'none';
        if (inlineRegionSelect) inlineRegionSelect.required = false;
    }

    let deliveryFee = 0;
    
    if (selectedGov && deliveryFees[selectedGov] !== undefined) {
        deliveryFee = deliveryFees[selectedGov];
        cartDeliveryDiv.style.display = 'flex';
        cartDeliveryVal.textContent = `${deliveryFee} ج.م`;
    } else if (selectedGov) {
        // Fallback default
        deliveryFee = 50; 
        cartDeliveryDiv.style.display = 'flex';
        cartDeliveryVal.textContent = `${deliveryFee} ج.م`;
    } else {
        cartDeliveryDiv.style.display = 'none';
        cartDeliveryVal.textContent = `0 ج.م`;
    }

    cartTotalVal.textContent = `${currentTotal + deliveryFee} ج.م`;
}

// Add listener to update delivery when governorate changes
const inlineGovernorate = document.getElementById('inlineGovernorate');
if (inlineGovernorate) {
    inlineGovernorate.addEventListener('change', () => {
        updateCartDeliveryUI();
    });
}
const inlineRegionSelect = document.getElementById('inlineRegionSelect');
if (inlineRegionSelect) {
    inlineRegionSelect.addEventListener('change', () => {
        updateCartDeliveryUI();
    });
}


// New Inline Checkout Logic
const cartCheckoutContainer = document.getElementById('cartCheckoutContainer');
const cartStandardBtns = document.getElementById('cartStandardBtns');
const cartCheckoutBtns = document.getElementById('cartCheckoutBtns');

goToCheckoutBtn.addEventListener('click', () => {
    cartItemsContainer.style.display = 'none';
    cartCheckoutContainer.style.display = 'block';
    cartStandardBtns.style.display = 'none';
    cartCheckoutBtns.style.display = 'flex';
});

document.getElementById('backToCartBtn').addEventListener('click', () => {
    cartCheckoutContainer.style.display = 'none';
    cartItemsContainer.style.display = 'block';
    cartCheckoutBtns.style.display = 'none';
    cartStandardBtns.style.display = 'block';
});

const submitInlineOrderBtn = document.getElementById('submitInlineOrderBtn');
const inlineForm = document.getElementById('inlineCheckoutForm');
const inlineSpinner = document.getElementById('inlineSpinner');
const inlineBtnText = document.getElementById('inlineBtnText');
const inlineAlertBox = document.getElementById('inlineAlertBox');

submitInlineOrderBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!inlineForm.reportValidity()) return;

    inlineBtnText.style.display = 'none';
    inlineSpinner.style.display = 'inline-block';
    submitInlineOrderBtn.disabled = true;

    let orderDetailsText = "طلب سريع من المتجر:\n";
    let calculatedTotal = 0;
    cart.forEach(item => {
        orderDetailsText += `- ${item.name} | الكمية: ${item.quantity} | السعر: ${item.price} ج.م\n`;
        calculatedTotal += (item.price * item.quantity);
    });
    orderDetailsText += `\nالإجمالي التقريبي: ${calculatedTotal} ج.م\n`;

    let selectedGov = document.getElementById('inlineGovernorate').value;
    const inlineRegionSelectElt = document.getElementById('inlineRegionSelect');
    
    if (selectedGov === 'الشرقية' && inlineRegionSelectElt && inlineRegionSelectElt.value) {
        selectedGov = `الشرقية (${inlineRegionSelectElt.value})`;
    }
    
    const deliveryFee = deliveryFees[selectedGov] !== undefined ? deliveryFees[selectedGov] : (selectedGov ? 50 : 0);
    const finalTotal = calculatedTotal + deliveryFee;

    orderDetailsText += `\nرسوم التوصيل (${selectedGov || 'غير محدد'}): ${deliveryFee} ج.م\n`;
    orderDetailsText += `\nالإجمالي النهائي: ${finalTotal} ج.م\n`;

    const orderData = {
        name: document.getElementById('inlineName').value,
        phone: document.getElementById('inlinePhone').value,
        governorate: selectedGov,
        address: document.getElementById('inlineAddress').value,
        orderDetails: orderDetailsText,
        deliveryFee: deliveryFee,
        items: cart,
        total: finalTotal,
        status: 'new',
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "orders"), orderData);

        inlineForm.style.display = 'none';
        
        // Hide the footer containing the totals and action buttons
        const cartFooter = document.querySelector('.cart-footer');
        if (cartFooter) cartFooter.style.display = 'none';
        
        const successDiv = document.createElement('div');
        successDiv.id = "successOrderSummary";
        successDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; animation: fadeIn 0.5s;">
                <i class="fa-solid fa-circle-check" style="font-size: 50px; color: var(--success-color); margin-bottom: 15px;"></i>
                <h3 style="color: var(--success-color); margin-bottom: 15px;">تم إنشاء الطلب بنجاح!</h3>
                <div style="background: rgba(11, 128, 122, 0.05); padding: 15px; border-radius: 10px; text-align: right; border: 1px solid var(--border-color); margin-bottom: 20px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${orderDetailsText.trim()}</div>
                <button id="closeSuccessBtn" style="background: var(--primary-color); color: white; border: none; padding: 12px; border-radius: 10px; font-family: inherit; font-size: 16px; font-weight: bold; cursor: pointer; width: 100%; transition: background 0.3s;">إغلاق والعودة للمتجر</button>
            </div>
        `;
        
        cartCheckoutContainer.appendChild(successDiv);
        
        document.getElementById('closeSuccessBtn').addEventListener('click', () => {
            cart = [];
            saveCart();
            updateCartUI();
            inlineForm.reset();
            inlineForm.style.display = 'block';
            successDiv.remove();
            
            if (cartFooter) cartFooter.style.display = 'block';
            
            cartModal.classList.remove('active');
            document.getElementById('backToCartBtn').click();
            inlineBtnText.style.display = 'inline-block';
            inlineSpinner.style.display = 'none';
            submitInlineOrderBtn.disabled = false;
        });

    } catch (error) {
        console.error("Order error: ", error);
        inlineAlertBox.textContent = 'حدث خطأ أثناء الاتصال. حاول مجدداً.';
        inlineAlertBox.style.display = 'block';
        inlineAlertBox.style.background = 'rgba(220, 38, 38, 0.1)';
        inlineAlertBox.style.color = 'var(--error-color)';

        inlineBtnText.style.display = 'inline-block';
        inlineSpinner.style.display = 'none';
        submitInlineOrderBtn.disabled = false;
    }
});

// Initialization
loadProducts();
updateCartUI();
