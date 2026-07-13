import { db, escapeHTML } from './firebase-config.js';
import { collection, query, orderBy, getDocs, addDoc, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const productsGrid = document.getElementById('productsGrid');
const filterBtns = document.querySelectorAll('.filter-btn');

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

// Delivery fees state
let deliveryFees = {};
try {
    const cachedDelivery = localStorage.getItem('elbadry_delivery_cache');
    if (cachedDelivery) {
        deliveryFees = JSON.parse(cachedDelivery);
    }
} catch (e) {
    console.error("Error reading delivery cache:", e);
}

onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
    if (docSnap.exists()) {
        deliveryFees = docSnap.data().fees || {};
        try {
            localStorage.setItem('elbadry_delivery_cache', JSON.stringify(deliveryFees));
        } catch (e) {}
        updateCartDeliveryUI();
    }
});

let cart = JSON.parse(localStorage.getItem('elbadry_cart')) || [];

let allProducts = [];
let filteredProducts = [];
let displayedCount = 0;
const PAGE_SIZE = 12;

// Load products with Stale-While-Revalidate caching pattern
async function loadProducts() {
    // 1. Try to load products instantly from localStorage cache
    try {
        const cachedData = localStorage.getItem('elbadry_products_cache');
        if (cachedData) {
            allProducts = JSON.parse(cachedData);
            applyFilters();
        }
    } catch (e) {
        console.error("Error loading products from localStorage cache:", e);
    }

    // Show loading spinner if cache was empty
    if (allProducts.length === 0) {
        productsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 30px; color: var(--primary-color);"></i><p style="margin-top: 15px;">جاري تحميل المنتجات...</p></div>`;
    }

    try {
        // 2. Fetch fresh products from Firestore in the background
        const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        const freshProducts = [];
        querySnapshot.forEach((doc) => {
            freshProducts.push({ id: doc.id, ...doc.data() });
        });

        // Save fresh products to localStorage cache
        try {
            localStorage.setItem('elbadry_products_cache', JSON.stringify(freshProducts));
        } catch (e) {}

        // 3. Update the list and refresh the UI
        // If data is different, or if we had no cache, apply filters to re-render
        if (JSON.stringify(allProducts) !== JSON.stringify(freshProducts) || allProducts.length === 0) {
            allProducts = freshProducts;
            applyFilters();
        }

    } catch (e) {
        console.error("Error loading fresh products from Firestore: ", e);
        // Only show error message if we couldn't load from cache either
        if (allProducts.length === 0) {
            productsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; color: var(--error-color); padding: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 40px; color: var(--error-color);"></i>
                    <div style="font-size: 18px; font-weight: bold; color: var(--text-dark);">عذراً، لم نتمكن من تحميل المنتجات</div>
                    <div style="font-size: 14px; color: var(--text-gray); max-width: 400px; line-height: 1.6;">حدث خطأ غير متوقع أثناء الاتصال بالخادم. يرجى إعادة تحميل الصفحة أو المحاولة لاحقاً.</div>
                </div>
            `;
        }
    }
}

let currentFilter = 'all';
const urlParams = new URLSearchParams(window.location.search);
const catParam = urlParams.get('category');
if (catParam) {
    currentFilter = decodeURIComponent(catParam);
}
let currentSearch = '';

function applyFilters() {
    let filtered = allProducts;

    if (currentFilter !== 'all') {
        filtered = filtered.filter(p => {
            const cats = Array.isArray(p.category) ? p.category : [p.category || ''];
            return cats.some(c => c.includes(currentFilter) || currentFilter.includes(c));
        });
    }

    if (currentSearch.trim() !== '') {
        const searchLower = currentSearch.toLowerCase().trim();
        // Support flexible Arabic letter normalization and case-insensitive substring matching
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
        productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-gray);">لا توجد منتجات مطابقة حالياً.</p>`;
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
        const storeImgUrl = prod.image && (prod.image.startsWith('http://') || prod.image.startsWith('https://')) ? escapeHTML(prod.image) : 'https://via.placeholder.com/150';
        div.innerHTML = `
            ${badgeHtml}
            <a href="product.html?id=${prod.id}" style="display: block; overflow: hidden;">
                <img src="${storeImgUrl}" alt="${escapeHTML(prod.name)}" class="product-img" loading="lazy" style="transition: transform 0.5s ease;">
            </a>
            <div class="product-info">
                <div class="product-category">${escapeHTML(categoryText)}</div>
                <a href="product.html?id=${prod.id}" style="color: inherit; text-decoration: none;">
                    <h3 class="product-name" style="transition: color 0.3s ease;" onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--secondary-color)'">${escapeHTML(prod.name)}</h3>
                </a>
                <div class="product-price">${priceHtml}</div>
                <div id="product-action-${prod.id}" class="product-action-container" data-name="${escapeHTML(prod.name)}" data-price="${pricing.finalPrice}" data-original-price="${pricing.originalPrice}" data-discount-percent="${pricing.discountPercent}" data-img="${storeImgUrl}" data-stock="${prod.stock !== undefined && prod.stock !== null ? prod.stock : ''}" data-limit="${prod.maxLimit !== undefined && prod.maxLimit !== null ? prod.maxLimit : ''}">
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

window.addFromGrid = function (id, name, price, img, originalPrice = null, discountPercent = null, stock = null, limit = null) {
    addToCart({ 
        id, 
        name, 
        price, 
        image: img,
        originalPrice: originalPrice !== null ? Number(originalPrice) : price,
        discountPercent: discountPercent !== null ? Number(discountPercent) : 0,
        stock: stock !== null && stock !== '' ? Number(stock) : null,
        maxLimit: limit !== null && limit !== '' ? Number(limit) : null
    });
};

function updateGridActionsUI() {
    const containers = document.querySelectorAll('.product-action-container');
    containers.forEach(container => {
        const id = container.id.replace('product-action-', '');
        const itemInCart = cart.find(i => i.id === id);

        const stockAttr = container.dataset.stock;
        const limitAttr = container.dataset.limit;
        const stock = (stockAttr !== undefined && stockAttr !== null && stockAttr !== '') ? Number(stockAttr) : null;
        const limit = (limitAttr !== undefined && limitAttr !== null && limitAttr !== '') ? Number(limitAttr) : null;

        // If product is out of stock completely
        if (stock !== null && stock <= 0) {
            container.innerHTML = `
                <button class="add-to-cart-btn" style="background-color: #a0aec0; cursor: not-allowed; opacity: 0.8; margin-top: 10px; width: 100%;" disabled>
                    <i class="fa-solid fa-ban"></i> نفذت الكمية
                </button>
            `;
            return;
        }

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
                <button class="add-to-cart-btn" onclick="addFromGrid('${id}', '${name}', ${price}, '${img}', ${originalPrice}, ${discountPercent}, ${stockAttr !== undefined && stockAttr !== null && stockAttr !== '' ? Number(stockAttr) : 'null'}, ${limitAttr !== undefined && limitAttr !== null && limitAttr !== '' ? Number(limitAttr) : 'null'})">
                    <i class="fa-solid fa-cart-plus"></i> أضف للعربة
                </button>
            `;
        }
    });
}

// Filtering dynamically from Firebase Categories using Premium Category Cards (SWR cached)
const categoriesGrid = document.getElementById('categoriesGrid');

if (categoriesGrid) {
    // 1. Try to load categories instantly from localStorage cache
    try {
        const storedCats = localStorage.getItem('elbadry_categories_cache');
        if (storedCats) {
            const cachedCategories = JSON.parse(storedCats);
            cachedCategories.forEach(cat => {
                categoryDiscounts[cat.name] = Number(cat.discount) || 0;
            });
            renderCategoriesUI(cachedCategories);
        }
    } catch (e) {
        console.error("Error reading categories from cache:", e);
    }

    // 2. Fetch fresh categories from Firestore
    onSnapshot(query(collection(db, 'categories'), orderBy('createdAt', 'asc')), (snapshot) => {
        const freshCategories = [];
        categoryDiscounts = {}; // Clear and re-populate

        snapshot.forEach(docSnap => {
            const cat = docSnap.data();
            categoryDiscounts[cat.name] = Number(cat.discount) || 0;
            freshCategories.push(cat);
        });

        try {
            localStorage.setItem('elbadry_categories_cache', JSON.stringify(freshCategories));
        } catch (e) {}

        renderCategoriesUI(freshCategories);

        // Trigger filter refresh if products are already present
        if (allProducts.length > 0) {
            applyFilters();
        }
    });
}

function renderCategoriesUI(categories) {
    if (!categoriesGrid) return;
    categoriesGrid.innerHTML = '';

    // Add the "All" (الكل) category card first as a real link pointing to store.html (always active on store.html)
    const allCard = document.createElement('a');
    allCard.className = 'category-card active';
    allCard.href = 'store.html';
    allCard.innerHTML = `
        <div class="category-icon-wrapper">
            <i class="fa-solid fa-border-all"></i>
        </div>
        <div class="category-name">الكل</div>
    `;
    categoriesGrid.appendChild(allCard);

    categories.forEach(cat => {
        const card = document.createElement('a');
        card.className = 'category-card';
        card.href = `category.html?name=${encodeURIComponent(cat.name)}`;

        let visualHtml = '';
        if (cat.type === 'icon') {
            visualHtml = `<i class="${cat.icon || 'fa-solid fa-tags'}"></i>`;
        } else if (cat.type === 'image') {
            visualHtml = `<img src="${cat.image || 'https://via.placeholder.com/150'}" alt="${cat.name}" class="category-img" loading="lazy">`;
        } else {
            visualHtml = `<i class="fa-solid fa-tags"></i>`;
        }

        const discountBadgeText = cat.discount ? ` <span style="font-size:11px; color:var(--error-color); font-weight:bold;">(خصم ${cat.discount}%)</span>` : '';

        card.innerHTML = `
            <div class="category-icon-wrapper">
                ${visualHtml}
            </div>
            <div class="category-name">${cat.name}${discountBadgeText}</div>
        `;
        categoriesGrid.appendChild(card);
    });
}

// Search Logic with Instant Filter and Normalization
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
    const currentQty = existing ? existing.quantity : 0;
    const newQty = currentQty + 1;

    // Check stock limit
    if (product.stock !== undefined && product.stock !== null && product.stock !== '') {
        const stock = Number(product.stock);
        if (newQty > stock) {
            alert(`عذراً، لا تتوفر كمية كافية في المخزن (المتاح: ${stock}، لديك في العربة: ${currentQty}).`);
            return;
        }
    }

    // Check max limit
    if (product.maxLimit !== undefined && product.maxLimit !== null && product.maxLimit !== '') {
        const maxLimit = Number(product.maxLimit);
        if (newQty > maxLimit) {
            alert(`عذراً، أقصى كمية مسموح بطلبها من هذا المنتج هي ${maxLimit} قطع.`);
            return;
        }
    }

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
            quantity: 1,
            stock: product.stock !== undefined && product.stock !== null ? Number(product.stock) : null,
            maxLimit: product.maxLimit !== undefined && product.maxLimit !== null ? Number(product.maxLimit) : null
        });
    }
    saveCart();
    updateCartUI();
}

// Global functions for cart UI manipulation
window.updateQty = function (id, delta) {
    const item = cart.find(i => i.id === id);
    if (item) {
        if (delta > 0) {
            // Check stock limit
            if (item.stock !== undefined && item.stock !== null && item.stock !== '') {
                const stock = Number(item.stock);
                if (item.quantity + delta > stock) {
                    alert(`عذراً، لا تتوفر كمية كافية في المخزن. المتاح هو ${stock} قطع فقط.`);
                    return;
                }
            }
            // Check max limit
            if (item.maxLimit !== undefined && item.maxLimit !== null && item.maxLimit !== '') {
                const maxLimit = Number(item.maxLimit);
                if (item.quantity + delta > maxLimit) {
                    alert(`عذراً، الحد الأقصى لطلب هذا المنتج هو ${maxLimit} قطع.`);
                    return;
                }
            }
        }
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
        return;
    }

    // Hide default header, show slider
    if (storeDefaultHeader) storeDefaultHeader.style.display = 'none';
    storeSliderContainer.style.display = 'block';

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
                <img src="${slide.image}" alt="${slide.title || 'Ad'}" class="slide-img" ${idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
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

// Load cached slides first for instant render
try {
    const storedSlides = localStorage.getItem('elbadry_slides_cache');
    if (storedSlides) {
        setupSlider(JSON.parse(storedSlides));
    }
} catch (e) {
    console.error("Error reading slides cache:", e);
}

// Fetch ads slides from Firestore
onSnapshot(query(collection(db, 'slides'), orderBy('createdAt', 'desc')), (snapshot) => {
    const slides = [];
    snapshot.forEach(docSnap => {
        slides.push(docSnap.data());
    });
    try {
        localStorage.setItem('elbadry_slides_cache', JSON.stringify(slides));
    } catch (e) {}
    setupSlider(slides);
});
