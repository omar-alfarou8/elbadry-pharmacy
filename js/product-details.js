import { db } from './firebase-config.js';
import { collection, query, orderBy, getDocs, addDoc, onSnapshot, doc, getDoc, limit, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// DOM Elements for Product Details
const productDetailsContent = document.getElementById('productDetailsContent');
const relatedProductsSection = document.getElementById('relatedProductsSection');
const productsGrid = document.getElementById('productsGrid');

// Extract Product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

// Cart State
let cart = JSON.parse(localStorage.getItem('elbadry_cart')) || [];
let deliveryFees = {};

// Load delivery fees dynamically from Firebase
onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
    if (docSnap.exists()) {
        deliveryFees = docSnap.data().fees || {};
        updateCartDeliveryUI();
    }
});

// Main Product details state
let currentProduct = null;
let selectedQty = 1;

// Load Product Details
async function loadProductDetails() {
    if (!productId) {
        showErrorPage('معرف المنتج غير موجود!');
        return;
    }

    try {
        const docRef = doc(db, "products", productId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showErrorPage('عذراً، لم نتمكن من العثور على هذا المنتج. قد يكون تم حذفه أو نقله.');
            return;
        }

        currentProduct = { id: docSnap.id, ...docSnap.data() };
        renderProductDetails(currentProduct);
        loadRelatedProducts(currentProduct.category, currentProduct.id);

    } catch (error) {
        console.error("Error loading product details: ", error);
        showErrorPage('حدث خطأ غير متوقع أثناء الاتصال بالخادم. يرجى المحاولة لاحقاً.');
    }
}

// Show Error Page
function showErrorPage(message) {
    productDetailsContent.innerHTML = `
        <div style="text-align: center; color: var(--error-color); padding: 50px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; min-height: 40vh;">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 55px; color: var(--error-color);"></i>
            <h2 style="font-size: 22px; font-weight: bold; color: var(--text-dark);">${message}</h2>
            <p style="font-size: 15px; color: var(--text-gray); max-width: 450px; line-height: 1.6;">تأكد من صحة الرابط أو قم بتصفح المتجر للبحث عن منتجات بديلة.</p>
            <a href="store.html" class="btn-primary" style="margin-top: 10px; border-radius: 10px;">انتقل إلى المتجر</a>
        </div>
    `;
}

// Render Product Details
function renderProductDetails(prod) {
    productDetailsContent.innerHTML = `
        <div class="details-grid">
            <!-- Right Column: Image and Action Card -->
            <div class="details-image-sec">
                <div class="glass-card image-card">
                    <img src="${prod.image}" alt="${prod.name}" class="main-prod-img" id="mainProdImg">
                </div>
                
                <div class="glass-card cart-action-card" style="margin-top: 25px; padding: 25px; display: flex; flex-direction: column; gap: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 12px;">
                        <span style="font-weight: 700; color: var(--text-gray); font-size: 15px;">السعر الفردي:</span>
                        <span style="font-weight: 900; color: var(--secondary-color); font-size: 18px;">${prod.price} ج.م</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: var(--text-gray); font-size: 15px;">سعر الكمية:</span>
                        <span class="details-price" id="detailsPrice">${prod.price} ج.م</span>
                    </div>
                    
                    <div class="details-qty-block" style="display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border-color); padding: 8px 15px; border-radius: 12px; background: rgba(0,0,0,0.01); margin-top: 5px;">
                        <span style="font-weight: 800; color: var(--text-gray); font-size: 15px;">الكمية:</span>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <button class="qty-btn" id="detailsQtyPlus" style="width: 32px; height: 32px; font-size: 15px; border-radius: 8px; border: 1px solid var(--border-color); background: white; cursor: pointer; color: var(--primary-color); font-weight: bold; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"><i class="fa-solid fa-plus"></i></button>
                            <span id="detailsQtyVal" style="font-weight: 800; font-size: 18px; width: 25px; text-align: center; color: var(--text-dark);">1</span>
                            <button class="qty-btn" id="detailsQtyMinus" style="width: 32px; height: 32px; font-size: 15px; border-radius: 8px; border: 1px solid var(--border-color); background: white; cursor: pointer; color: var(--primary-color); font-weight: bold; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"><i class="fa-solid fa-minus"></i></button>
                        </div>
                    </div>
                    
                    <button class="btn-primary" id="detailsAddToCartBtn" style="padding: 15px; font-size: 16px; border-radius: 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 5px;">
                        <i class="fa-solid fa-cart-plus"></i> أضف لعربة التسوق
                    </button>
                </div>
            </div>
            
            <!-- Left Column: Detailed Info -->
            <div class="details-info-sec">
                <div class="details-category-badge">${prod.category}</div>
                <h1 class="details-title">${prod.name}</h1>
                <div class="details-price-badge" style="margin-bottom: 25px;">${prod.price} ج.م</div>
                
                <!-- Tabs Container -->
                <div class="details-tabs">
                    <div class="tab-buttons">
                        <button class="tab-btn active" data-tab="description">وصف الدواء</button>
                        <button class="tab-btn" data-tab="usage">طريقة الاستخدام</button>
                        <button class="tab-btn" data-tab="ingredients">المواد الفعالة</button>
                        <button class="tab-btn" data-tab="warnings">تحذيرات هامة</button>
                    </div>
                    
                    <div class="tab-contents" style="min-height: 150px;">
                        <div class="tab-pane active" id="tab-description">
                            ${prod.description ? `<p>${prod.description}</p>` : `<p style="color: var(--text-gray); font-style: italic;">لا يوجد وصف متوفر لهذا المنتج حالياً.</p>`}
                        </div>
                        <div class="tab-pane" id="tab-usage">
                            ${prod.usage ? `<p>${prod.usage}</p>` : `<p style="color: var(--text-gray); font-style: italic;">يرجى مراجعة الطبيب المختص أو الصيدلي لمعرفة طريقة الاستخدام المناسبة.</p>`}
                        </div>
                        <div class="tab-pane" id="tab-ingredients">
                            ${prod.activeIngredients ? `<p>${prod.activeIngredients}</p>` : `<p style="color: var(--text-gray); font-style: italic;">لا توجد معلومات إضافية مسجلة عن تركيب المواد الفعالة.</p>`}
                        </div>
                        <div class="tab-pane" id="tab-warnings">
                            ${prod.warnings ? `
                                <p style="display: flex; align-items: flex-start; gap: 8px;">
                                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--error-color); margin-top: 5px; font-size: 18px; flex-shrink:0;"></i>
                                    <span>${prod.warnings}</span>
                                </p>
                            ` : `
                                <p style="display: flex; align-items: flex-start; gap: 8px; color: var(--text-gray); font-style: italic;">
                                    <i class="fa-solid fa-circle-info" style="color: var(--primary-color); margin-top: 5px; font-size: 18px; flex-shrink:0;"></i>
                                    <span>لا توجد تحذيرات مسجلة لهذا الدواء. احرص دائماً على قراءة النشرة الداخلية المرفقة بعناية قبل الاستعمال.</span>
                                </p>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize quantity triggers
    const qtyVal = document.getElementById('detailsQtyVal');
    const totalPriceElt = document.getElementById('detailsPrice');

    document.getElementById('detailsQtyPlus').addEventListener('click', () => {
        selectedQty++;
        qtyVal.textContent = selectedQty;
        totalPriceElt.textContent = `${(prod.price * selectedQty)} ج.م`;
    });

    document.getElementById('detailsQtyMinus').addEventListener('click', () => {
        if (selectedQty > 1) {
            selectedQty--;
            qtyVal.textContent = selectedQty;
            totalPriceElt.textContent = `${(prod.price * selectedQty)} ج.م`;
        }
    });

    // Add to cart trigger
    document.getElementById('detailsAddToCartBtn').addEventListener('click', () => {
        addToCartWithQty(prod, selectedQty);
    });

    // Tab buttons trigger
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });
}

// Load Related Products
async function loadRelatedProducts(category, currentId) {
    try {
        const q = query(
            collection(db, "products"),
            where("category", "==", category),
            limit(5)
        );
        const querySnapshot = await getDocs(q);

        let count = 0;
        productsGrid.innerHTML = '';

        querySnapshot.forEach((docSnap) => {
            const prod = docSnap.data();
            const id = docSnap.id;

            if (id !== currentId && count < 4) {
                const div = document.createElement('div');
                div.className = 'product-card';
                div.style.animation = 'fadeIn 0.5s ease forwards';
                div.innerHTML = `
                    <a href="product.html?id=${id}" style="display: block; overflow: hidden;">
                        <img src="${prod.image}" alt="${prod.name}" class="product-img" loading="lazy" style="transition: transform 0.5s ease;">
                    </a>
                    <div class="product-info">
                        <div class="product-category">${prod.category}</div>
                        <a href="product.html?id=${id}" style="color: inherit; text-decoration: none;">
                            <h3 class="product-name" style="transition: color 0.3s ease;" onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--secondary-color)'">${prod.name}</h3>
                        </a>
                        <div class="product-price">${prod.price} ج.م</div>
                        <div id="product-action-${id}" class="product-action-container" data-name="${prod.name.replace(/"/g, '&quot;')}" data-price="${prod.price}" data-img="${prod.image}">
                        </div>
                    </div>
                `;
                productsGrid.appendChild(div);
                count++;
            }
        });

        if (count > 0) {
            relatedProductsSection.style.display = 'block';
            updateGridActionsUI();
        }

    } catch (e) {
        console.error("Error loading related products: ", e);
    }
}

// ----------------- Cart Actions -----------------

function addToCartWithQty(product, qty) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        existing.quantity += qty;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: qty
        });
    }
    saveCart();
    updateCartUI();

    // Auto trigger slide sidebar to show feedback to the client
    cartModal.classList.add('active');
}

window.addFromGrid = function (id, name, price, img) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id, name, price, image: img, quantity: 1 });
    }
    saveCart();
    updateCartUI();
};

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

function updateCartUI() {
    let totalItems = 0;
    let totalPrice = 0;

    cart.forEach(item => totalItems += item.quantity);
    cartBadge.textContent = totalItems;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p style="text-align: center; color: var(--text-gray); margin-top: 50px;">عربة التسوق فارغة.</p>';
        cartTotalVal.textContent = '0 ج.م';
        goToCheckoutBtn.disabled = true;
        goToCheckoutBtn.style.opacity = '0.5';

        updateCartDeliveryUI(0);
        updateGridActionsUI();
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
    updateGridActionsUI();
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
        deliveryFee = 50;
        cartDeliveryDiv.style.display = 'flex';
        cartDeliveryVal.textContent = `${deliveryFee} ج.م`;
    } else {
        cartDeliveryDiv.style.display = 'none';
        cartDeliveryVal.textContent = `0 ج.م`;
    }

    cartTotalVal.textContent = `${currentTotal + deliveryFee} ج.م`;
}

// ----------------- Cart Sidebar View Binding -----------------
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

const inlineGovernorate = document.getElementById('inlineGovernorate');
if (inlineGovernorate) {
    inlineGovernorate.addEventListener('change', () => updateCartDeliveryUI());
}
const inlineRegionSelect = document.getElementById('inlineRegionSelect');
if (inlineRegionSelect) {
    inlineRegionSelect.addEventListener('change', () => updateCartDeliveryUI());
}

// Checkout UI Flow
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

// Submit quick order logic
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

    let orderDetailsText = "طلب سريع من المتجر (صفحة تفاصيل الدواء):\n";
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
loadProductDetails();
updateCartUI();
