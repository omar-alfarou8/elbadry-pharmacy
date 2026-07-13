import { db, escapeHTML } from './firebase-config.js';
import { collection, query, orderBy, getDocs, addDoc, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const productsGrid = document.getElementById('productsGrid');
const categorySearchInput = document.getElementById('categorySearchInput');
const categoryPageTitle = document.getElementById('categoryPageTitle');

let categoryDiscounts = {};

function getProductPricing(prod) {
    const originalPrice = Number(prod.price) || 0;
    let discountPercent = Number(prod.discount) || 0;

    if (discountPercent === 0) {
        const cats = Array.isArray(prod.category) ? prod.category : [prod.category || ''];
        let maxCatDiscount = 0;
        cats.forEach(c => {
            const catDisc = categoryDiscounts[c] || 0;
            if (catDisc > maxCatDiscount) {
                maxCatDiscount = catDisc;
            }
        });
        discountPercent = maxCatDiscount;
    }

    const hasDiscount = discountPercent > 0;
    const finalPrice = hasDiscount ? Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100 : originalPrice;

    return {
        originalPrice,
        discountPercent,
        hasDiscount,
        finalPrice
    };
}

// Read Category Name from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const categoryName = urlParams.get('name') ? decodeURIComponent(urlParams.get('name')).trim() : '';

// Update titles
if (categoryName) {
    document.title = `${categoryName} - صيدلية البدري`;
    if (categoryPageTitle) categoryPageTitle.textContent = categoryName;
    const categorySectionTitle = document.getElementById('categorySectionTitle');
    if (categorySectionTitle) categorySectionTitle.textContent = categoryName;
} else {
    document.title = `القسم - صيدلية البدري`;
    if (categoryPageTitle) categoryPageTitle.textContent = 'القسم غير محدد';
}

// Delivery fees state
let deliveryFees = {};
onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
    if (docSnap.exists()) {
        deliveryFees = docSnap.data().fees || {};
        updateCartDeliveryUI();
    }
});

let cart = JSON.parse(localStorage.getItem('elbadry_cart')) || [];

let allProducts = [];
let filteredProducts = [];
let displayedCount = 0;
const PAGE_SIZE = 12;

// Load products for this category
async function loadProducts() {
    try {
        productsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 30px; color: var(--primary-color);"></i><p style="margin-top: 15px;">جاري تحميل منتجات القسم...</p></div>`;
        
        if (!categoryName) {
            productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-gray);">عذراً، لم يتم تحديد اسم القسم بشكل صحيح.</p>`;
            return;
        }

        // Fetch categories to get discounts first
        const categoriesSnapshot = await getDocs(collection(db, "categories"));
        categoryDiscounts = {};
        categoriesSnapshot.forEach(docSnap => {
            const cat = docSnap.data();
            categoryDiscounts[cat.name] = Number(cat.discount) || 0;
        });

        const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        allProducts = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const cats = Array.isArray(data.category) ? data.category : [data.category || ''];
            // Match category name
            if (cats.some(c => c.includes(categoryName) || categoryName.includes(c))) {
                allProducts.push({ id: doc.id, ...data });
            }
        });

        applyFilters();

    } catch (e) {
        console.error("Error loading products: ", e);
        productsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--error-color); padding: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 40px; color: var(--error-color);"></i>
                <div style="font-size: 18px; font-weight: bold; color: var(--text-dark);">عذراً، لم نتمكن من تحميل المنتجات</div>
                <div style="font-size: 14px; color: var(--text-gray); max-width: 400px; line-height: 1.6;">حدث خطأ غير متوقع أثناء الاتصال بالخادم.</div>
            </div>
        `;
    }
}

let currentSearch = '';

function applyFilters() {
    let filtered = allProducts;

    if (currentSearch.trim() !== '') {
        const searchLower = currentSearch.toLowerCase().trim();
        const normalizeArabic = (str) => {
            return str
                .replace(/[أإآ]/g, 'ا')
                .replace(/ة/g, 'ه')
                .replace(/ى/g, 'ي')
                .toLowerCase();
        };
        const normalizedSearch = normalizeArabic(searchLower);
        filtered = filtered.filter(p => p.name && normalizeArabic(p.name).includes(normalizedSearch));
    }

    filteredProducts = filtered;
    displayedCount = 0;
    productsGrid.innerHTML = '';

    const oldBtn = document.getElementById('loadMoreBtnContainer');
    if (oldBtn) oldBtn.remove();

    loadMoreProducts();
}

function loadMoreProducts() {
    const nextProducts = filteredProducts.slice(displayedCount, displayedCount + PAGE_SIZE);

    if (displayedCount === 0 && nextProducts.length === 0) {
        productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-gray);">لا توجد منتجات متوفرة حالياً في هذا القسم.</p>`;
        return;
    }

    nextProducts.forEach(prod => {
        const pricing = getProductPricing(prod);
        const badgeHtml = pricing.hasDiscount ? `<div class="discount-badge">-${pricing.discountPercent}%</div>` : '';
        const priceHtml = pricing.hasDiscount 
            ? `<span class="sale-price">${pricing.finalPrice} ج.م</span> <span class="original-price">${pricing.originalPrice} ج.م</span>`
            : `${pricing.originalPrice} ج.م`;

        const categoryText = Array.isArray(prod.category) ? prod.category.join('، ') : (prod.category || 'غير محدد');

        const div = document.createElement('div');
        div.className = 'product-card';
        div.style.animation = 'fadeIn 0.5s ease forwards';
        div.style.position = 'relative';
        const categoryImgUrl = prod.image && (prod.image.startsWith('http://') || prod.image.startsWith('https://')) ? escapeHTML(prod.image) : 'https://via.placeholder.com/150';
        div.innerHTML = `
            ${badgeHtml}
            <a href="product.html?id=${prod.id}" style="display: block; overflow: hidden;">
                <img src="${categoryImgUrl}" alt="${escapeHTML(prod.name)}" class="product-img" loading="lazy" style="transition: transform 0.5s ease;">
            </a>
            <div class="product-info">
                <div class="product-category">${escapeHTML(categoryText)}</div>
                <a href="product.html?id=${prod.id}" style="color: inherit; text-decoration: none;">
                    <h3 class="product-name" style="transition: color 0.3s ease;" onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--secondary-color)'">${escapeHTML(prod.name)}</h3>
                </a>
                <div class="product-price">${priceHtml}</div>
                <div id="product-action-${prod.id}" class="product-action-container" data-name="${escapeHTML(prod.name)}" data-price="${pricing.finalPrice}" data-original-price="${pricing.originalPrice}" data-discount-percent="${pricing.discountPercent}" data-img="${categoryImgUrl}">
                </div>
            </div>
        `;
        productsGrid.appendChild(div);
    });

    displayedCount += nextProducts.length;
    updateGridActionsUI();

    const oldBtn = document.getElementById('loadMoreBtnContainer');
    if (oldBtn) oldBtn.remove();

    if (displayedCount < filteredProducts.length) {
        const btnContainer = document.createElement('div');
        btnContainer.id = 'loadMoreBtnContainer';
        btnContainer.style = 'grid-column: 1/-1; text-align: center; margin-top: 30px; margin-bottom: 20px;';
        btnContainer.innerHTML = `<button id="loadMoreBtn" style="background: var(--primary-color); color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; font-family: inherit; font-weight: bold; transition: opacity 0.3s; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"><i class="fa-solid fa-angle-down" style="margin-left: 8px;"></i> عرض المزيد</button>`;

        productsGrid.appendChild(btnContainer);

        document.getElementById('loadMoreBtn').addEventListener('click', () => {
            const btn = document.getElementById('loadMoreBtn');
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-left: 8px;"></i> جاري التحميل...`;
            btn.style.opacity = '0.7';
            setTimeout(loadMoreProducts, 300);
        });
    }
}

window.addFromGrid = function (id, name, price, img, originalPrice = null, discountPercent = null) {
    addToCart({ 
        id, 
        name, 
        price, 
        image: img,
        originalPrice: originalPrice !== null ? Number(originalPrice) : price,
        discountPercent: discountPercent !== null ? Number(discountPercent) : 0
    });
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
            const originalPrice = container.dataset.originalPrice || price;
            const discountPercent = container.dataset.discountPercent || 0;
            container.innerHTML = `
                <button class="add-to-cart-btn" onclick="addFromGrid('${id}', '${name}', ${price}, '${img}', ${originalPrice}, ${discountPercent})">
                    <i class="fa-solid fa-cart-plus"></i> أضف للعربة
                </button>
            `;
        }
    });
}

// Search field input listener
if (categorySearchInput) {
    categorySearchInput.addEventListener('input', (e) => {
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
        cart.push({ 
            id: product.id,
            name: product.name,
            price: product.price,
            originalPrice: product.originalPrice !== undefined ? product.originalPrice : product.price,
            discountPercent: product.discountPercent !== undefined ? product.discountPercent : 0,
            image: product.image,
            quantity: 1 
        });
    }
    saveCart();
    updateCartUI();
}

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
        const hasDiscount = Number(item.discountPercent) > 0;
        const priceHtml = hasDiscount 
            ? `<div class="cart-item-price" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                 <span>${item.price} ج.م</span>
                 <span style="text-decoration: line-through; color: var(--text-gray); font-size: 13px; font-weight: 500;">${item.originalPrice} ج.م</span>
                 <span style="background: var(--error-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 800;">خصم ${item.discountPercent}%</span>
               </div>`
            : `<div class="cart-item-price">${item.price} ج.م</div>`;

        html += `
            <div class="cart-item">
                <img src="${item.image}" alt="" class="cart-item-img">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    ${priceHtml}
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

    if (cartItemsTotalVal) {
        cartItemsTotalVal.textContent = `${currentTotal} ج.م`;
    }

    if (inlineGov && inlineGov.value) {
        const gov = inlineGov.value;
        let fee = deliveryFees[gov];

        // Specific region check for Belbeis
        if (gov === 'الشرقية') {
            const inlineRegGroup = document.getElementById('inlineRegionGroup');
            if (inlineRegGroup && inlineRegGroup.style.display !== 'none') {
                const regVal = document.getElementById('inlineRegionSelect').value;
                if (regVal === 'بلبيس') {
                    fee = deliveryFees['بلبيس'] !== undefined ? deliveryFees['بلبيس'] : 0;
                } else if (regVal === 'مناطق أخرى') {
                    fee = deliveryFees['الشرقية'] !== undefined ? deliveryFees['الشرقية'] : 0;
                } else {
                    fee = null; // Region not chosen yet
                }
            }
        }

        if (fee !== null && fee !== undefined) {
            if (cartDeliveryDiv) cartDeliveryDiv.style.display = 'flex';
            if (cartDeliveryVal) cartDeliveryVal.textContent = `${fee} ج.م`;
            if (cartTotalVal) cartTotalVal.textContent = `${currentTotal + fee} ج.م`;
        } else {
            if (cartDeliveryDiv) cartDeliveryDiv.style.display = 'none';
            if (cartTotalVal) cartTotalVal.textContent = `${currentTotal} ج.م`;
        }
    } else {
        if (cartDeliveryDiv) cartDeliveryDiv.style.display = 'none';
        if (cartTotalVal) cartTotalVal.textContent = `${currentTotal} ج.م`;
    }
}

// ------------- Inline Checkout Logic -------------
const inlineForm = document.getElementById('inlineCheckoutForm');
const goToCheckoutBtnEl = document.getElementById('goToCheckoutBtn');
const backToCartBtn = document.getElementById('backToCartBtn');
const cartCheckoutContainer = document.getElementById('cartCheckoutContainer');
const submitInlineOrderBtn = document.getElementById('submitInlineOrderBtn');
const inlineGovEl = document.getElementById('inlineGovernorate');
const inlineRegionGroup = document.getElementById('inlineRegionGroup');
const inlineRegionSelect = document.getElementById('inlineRegionSelect');

if (goToCheckoutBtnEl) {
    goToCheckoutBtnEl.addEventListener('click', () => {
        cartItemsContainer.style.display = 'none';
        document.getElementById('cartStandardBtns').style.display = 'none';
        
        cartCheckoutContainer.style.display = 'block';
        document.getElementById('cartCheckoutBtns').style.display = 'flex';
    });
}

if (backToCartBtn) {
    backToCartBtn.addEventListener('click', () => {
        cartCheckoutContainer.style.display = 'none';
        document.getElementById('cartCheckoutBtns').style.display = 'none';
        
        cartItemsContainer.style.display = 'block';
        document.getElementById('cartStandardBtns').style.display = 'flex';
        
        const successSummary = document.getElementById('successOrderSummary');
        if (successSummary) successSummary.remove();
        inlineForm.style.display = 'block';
        const cartFooter = document.querySelector('.cart-footer');
        if (cartFooter) cartFooter.style.display = 'block';
    });
}

if (inlineGovEl) {
    inlineGovEl.addEventListener('change', (e) => {
        if (e.target.value === 'الشرقية') {
            inlineRegionGroup.style.display = 'block';
            document.getElementById('inlineRegionSelect').required = true;
        } else {
            inlineRegionGroup.style.display = 'none';
            document.getElementById('inlineRegionSelect').required = false;
            document.getElementById('inlineRegionSelect').value = '';
        }
        updateCartDeliveryUI();
    });
}

if (inlineRegionSelect) {
    inlineRegionSelect.addEventListener('change', () => {
        updateCartDeliveryUI();
    });
}

// Form Submit
if (inlineForm) {
    inlineForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const inlineBtnText = document.getElementById('inlineBtnText');
        const inlineSpinner = document.getElementById('inlineSpinner');
        const inlineAlertBox = document.getElementById('inlineAlertBox');
        
        inlineBtnText.style.display = 'none';
        inlineSpinner.style.display = 'block';
        submitInlineOrderBtn.disabled = true;
        inlineAlertBox.style.display = 'none';

        const name = document.getElementById('inlineName').value.trim();
        const phone = document.getElementById('inlinePhone').value.trim();
        const governorate = document.getElementById('inlineGovernorate').value;
        let region = '';
        if (governorate === 'الشرقية') {
            region = ` - مركز: ${document.getElementById('inlineRegionSelect').value}`;
        }
        const address = document.getElementById('inlineAddress').value.trim() + region;

        let totalCartPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        let shippingFee = deliveryFees[governorate] || 0;
        
        if (governorate === 'الشرقية') {
            const regVal = document.getElementById('inlineRegionSelect').value;
            if (regVal === 'بلبيس') {
                shippingFee = deliveryFees['بلبيس'] !== undefined ? deliveryFees['بلبيس'] : 0;
            }
        }
        
        const finalTotal = totalCartPrice + shippingFee;

        let orderDetailsText = `أمر شراء جديد من المتجر:\n`;
        cart.forEach(item => {
            orderDetailsText += `- ${item.name} | العدد: ${item.quantity} | السعر: ${item.price * item.quantity} ج.م\n`;
        });
        orderDetailsText += `\nإجمالي المنتجات: ${totalCartPrice} ج.م\nرسوم التوصيل: ${shippingFee} ج.م\nإجمالي الحساب: ${finalTotal} ج.م`;

        try {
            await addDoc(collection(db, "orders"), {
                customerName: name,
                customerPhone: phone,
                governorate: governorate,
                customerAddress: address,
                items: JSON.stringify(cart),
                totalPrice: finalTotal,
                status: "new",
                createdAt: new Date()
            });

            // Hide form and show success summary
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
}

// Initialization
loadProducts();
updateCartUI();

// ------------- Ads Slider Initialization & Autoplay -------------
const storeSliderContainer = document.getElementById('storeSliderContainer');
const storeDefaultHeader = document.getElementById('storeDefaultHeader');
const storeSliderWrapper = document.getElementById('storeSliderWrapper');
const sliderDotsContainer = document.getElementById('sliderDotsContainer');
const sliderPrevBtn = document.getElementById('sliderPrevBtn');
const sliderNextBtn = document.getElementById('sliderNextBtn');

let currentSlideIdx = 0;
let slideInterval = null;
let slidesCount = 0;

function setupSlider(slides) {
    if (!storeSliderContainer || !storeSliderWrapper) return;

    if (slides.length === 0) {
        storeSliderContainer.style.display = 'none';
        if (storeDefaultHeader) storeDefaultHeader.style.display = 'block';
        const categorySectionTitle = document.getElementById('categorySectionTitle');
        if (categorySectionTitle) categorySectionTitle.style.display = 'none';
        return;
    }

    // Hide default header, show slider and inline section title
    if (storeDefaultHeader) storeDefaultHeader.style.display = 'none';
    storeSliderContainer.style.display = 'block';
    const categorySectionTitle = document.getElementById('categorySectionTitle');
    if (categorySectionTitle) categorySectionTitle.style.display = 'block';

    storeSliderWrapper.innerHTML = '';
    if (sliderDotsContainer) sliderDotsContainer.innerHTML = '';
    slidesCount = slides.length;
    currentSlideIdx = 0;

    slides.forEach((slide, idx) => {
        // Create Slide Item
        const slideItem = document.createElement('div');
        slideItem.className = `slide-item ${idx === 0 ? 'active' : ''}`;
        
        // Wrap with a link if it exists
        const linkHref = slide.link ? slide.link : '#';
        const targetAttr = slide.link && (slide.link.startsWith('http://') || slide.link.startsWith('https://')) ? 'target="_blank"' : '';
        
        slideItem.innerHTML = `
            <a href="${linkHref}" ${targetAttr} class="slide-link" style="display:block; width:100%; height:100%;">
                <img src="${slide.image}" alt="${slide.title || 'Ad'}" class="slide-img" loading="lazy">
                ${(slide.title || slide.description) ? `
                    <div class="slide-overlay-content">
                        ${slide.title ? `<h2 class="slide-title">${slide.title}</h2>` : ''}
                        ${slide.description ? `<p class="slide-desc">${slide.description}</p>` : ''}
                    </div>
                ` : ''}
            </a>
        `;
        storeSliderWrapper.appendChild(slideItem);

        // Create Navigation Dot
        if (sliderDotsContainer) {
            const dot = document.createElement('span');
            dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => {
                goToSlide(idx);
            });
            sliderDotsContainer.appendChild(dot);
        }
    });

    startSlideShow();
}

function goToSlide(idx) {
    const slideItems = document.querySelectorAll('.slide-item');
    const dots = document.querySelectorAll('.slider-dot');
    
    if (slideItems.length === 0) return;
    
    // Normalize index
    if (idx >= slideItems.length) idx = 0;
    if (idx < 0) idx = slideItems.length - 1;
    
    currentSlideIdx = idx;
    
    slideItems.forEach((item, index) => {
        item.classList.remove('active');
        if (index === idx) {
            item.classList.add('active');
        }
    });
    
    dots.forEach((dot, index) => {
        dot.classList.remove('active');
        if (index === idx) {
            dot.classList.add('active');
        }
    });
}

function startSlideShow() {
    stopSlideShow();
    if (slidesCount <= 1) return;
    slideInterval = setInterval(() => {
        goToSlide(currentSlideIdx + 1);
    }, 5000); // Change slide every 5 seconds
}

function stopSlideShow() {
    if (slideInterval) {
        clearInterval(slideInterval);
        slideInterval = null;
    }
}

// Pause autoplay on hover
if (storeSliderContainer) {
    storeSliderContainer.addEventListener('mouseenter', stopSlideShow);
    storeSliderContainer.addEventListener('mouseleave', startSlideShow);
}

if (sliderPrevBtn) {
    sliderPrevBtn.addEventListener('click', () => {
        goToSlide(currentSlideIdx - 1);
    });
}

if (sliderNextBtn) {
    sliderNextBtn.addEventListener('click', () => {
        goToSlide(currentSlideIdx + 1);
    });
}

// Fetch ads slides from Firestore
onSnapshot(query(collection(db, 'slides'), orderBy('createdAt', 'desc')), (snapshot) => {
    const slides = [];
    snapshot.forEach(docSnap => {
        slides.push(docSnap.data());
    });
    setupSlider(slides);
});
