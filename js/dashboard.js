import { auth, db, storage, escapeHTML } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc, limit, startAfter, where, startAt, endAt, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// Check Auth state immediately
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '/admin';
    } else {
        // Securely show dashboard and hide loading screen
        const loader = document.getElementById('authLoading');
        const container = document.getElementById('dashboardContainer');
        if (loader) loader.style.display = 'none';
        if (container) {
            container.style.setProperty('display', 'flex', 'important');
        }
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = '/admin';
    });
});

// Prevent mouse wheel from changing input[type=number] values
document.addEventListener('wheel', function () {
    if (document.activeElement && document.activeElement.type === 'number') {
        document.activeElement.blur();
    }
});

// Collections
const productsCol = collection(db, 'products');
const ordersCol = collection(db, 'orders');
const categoriesCol = collection(db, 'categories');
const reservationsCol = collection(db, 'reservations');

// Local products cache
let allProducts = {};

// Local orders cache
let allOrders = {};

// Pagination and Filter State
const PAGE_SIZE = 15;
let currentPage = 1;
let searchQuery = '';
let selectedCategory = '';
let isFetchingProducts = false;
let cachedProductsList = []; // Cache of all products for case-insensitive search and fast local filtering

// DOM Elements
const productsTableBody = document.querySelector('#productsTable tbody');
const totalProductsCount = document.getElementById('totalProductsCount');
const totalOrdersCount = document.getElementById('totalOrdersCount');

const recentOrdersBody = document.querySelector('#recentOrdersTable tbody');
const allOrdersBody = document.querySelector('#allOrdersTable tbody');

// Categories Elements
const categoriesModal = document.getElementById('categoriesModal');
const openCategoriesModal = document.getElementById('openCategoriesModal');
const closeCategoriesModal = document.getElementById('closeCategoriesModal');
const categoriesList = document.getElementById('categoriesList');
const productCategoriesContainer = document.getElementById('productCategoriesContainer');
const newCategoryName = document.getElementById('newCategoryName');
const addCategoryBtn = document.getElementById('addCategoryBtn');

if (openCategoriesModal) {
    openCategoriesModal.addEventListener('click', () => categoriesModal.classList.add('active'));
    closeCategoriesModal.addEventListener('click', () => categoriesModal.classList.remove('active'));
}

// Icon grid option selection
document.addEventListener('DOMContentLoaded', () => {
    const iconOptions = document.querySelectorAll('.icon-option');
    const selectedIconClassInput = document.getElementById('selectedIconClass');
    if (iconOptions.length > 0 && selectedIconClassInput) {
        iconOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                iconOptions.forEach(o => {
                    o.classList.remove('active');
                    o.style.borderColor = 'var(--border-color)';
                    o.style.background = 'none';
                    o.style.color = 'var(--text-gray)';
                });
                opt.classList.add('active');
                opt.style.borderColor = 'var(--primary-color)';
                opt.style.background = 'rgba(11,128,122,0.05)';
                opt.style.color = 'var(--primary-color)';
                selectedIconClassInput.value = opt.getAttribute('data-icon');
            });
        });
    }

    // Category type toggle
    const newCategoryType = document.getElementById('newCategoryType');
    const newCategoryIconGroup = document.getElementById('newCategoryIconGroup');
    const newCategoryImageGroup = document.getElementById('newCategoryImageGroup');
    if (newCategoryType) {
        newCategoryType.addEventListener('change', (e) => {
            if (e.target.value === 'icon') {
                newCategoryIconGroup.style.display = 'block';
                newCategoryImageGroup.style.display = 'none';
            } else {
                newCategoryIconGroup.style.display = 'none';
                newCategoryImageGroup.style.display = 'block';
            }
        });
    }
});

// Form Submit (Add/Edit Product)
const productForm = document.getElementById('productForm');
const saveBtn = document.getElementById('saveProductBtn');

// Product Image Upload Elements
const productImageFile = document.getElementById('productImageFile');
const productImagePreviewContainer = document.getElementById('productImagePreviewContainer');
const productImagePreview = document.getElementById('productImagePreview');
let selectedProductImageFile = null;

if (productImageFile) {
    productImageFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedProductImageFile = file;
            const reader = new FileReader();
            reader.onload = function (e) {
                productImagePreview.src = e.target.result;
                productImagePreviewContainer.style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    });
}
const productImageUrlInput = document.getElementById('productImage');
if (productImageUrlInput) {
    productImageUrlInput.addEventListener('input', (e) => {
        if (!selectedProductImageFile && e.target.value) {
            productImagePreview.src = e.target.value;
            productImagePreviewContainer.style.display = 'block';
        }
    });
}

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.innerHTML = 'جاري الحفظ... <span class="spinner"></span>';
    saveBtn.disabled = true;

    const id = document.getElementById('productId').value;
    const name = (document.getElementById('productName').value || '').trim();
    const nameEn = (document.getElementById('productNameEn').value || '').trim();

    if (!name && !nameEn) {
        alert('يرجى كتابة اسم للمنتج (بالعربية أو الإنجليزية على الأقل).');
        saveBtn.innerHTML = 'حفظ المنتج';
        saveBtn.disabled = false;
        return;
    }
    const price = document.getElementById('productPrice').value;

    // Read checked categories
    const checkedBoxes = document.querySelectorAll('input[name="productCategories"]:checked');
    const category = Array.from(checkedBoxes).map(cb => cb.value);

    if (category.length === 0) {
        alert('يرجى اختيار قسم واحد على الأقل للمنتج.');
        saveBtn.innerHTML = 'حفظ المنتج';
        saveBtn.disabled = false;
        return;
    }

    const discountInput = document.getElementById('productDiscount');
    const discount = discountInput && discountInput.value ? Number(discountInput.value) : 0;

    const stockInput = document.getElementById('productStock');
    const stock = stockInput && stockInput.value !== '' ? Number(stockInput.value) : null;

    const limitInput = document.getElementById('productLimit');
    const maxLimit = limitInput && limitInput.value !== '' ? Number(limitInput.value) : null;

    let image = document.getElementById('productImage').value || 'https://via.placeholder.com/150';

    // Additional fields
    const description = document.getElementById('productDescription').value || '';
    const usage = document.getElementById('productUsage').value || '';
    const activeIngredients = document.getElementById('productActiveIngredients').value || '';
    const warnings = document.getElementById('productWarnings').value || '';

    try {
        if (selectedProductImageFile) {
            const fileName = Date.now() + '_' + selectedProductImageFile.name;
            const storageRef = ref(storage, 'products/' + fileName);
            const snapshot = await uploadBytes(storageRef, selectedProductImageFile);
            image = await getDownloadURL(snapshot.ref);
        }

        const rawSlug = nameEn || name || 'product';
        const slug = rawSlug.toLowerCase().replace(/[^\w\u0600-\u06FF\s-]/g, '').trim().replace(/\s+/g, '-');

        const productData = {
            name,
            nameEn,
            slug,
            price: Number(price),
            discount: Number(discount) || 0,
            category,
            image,
            description,
            usage,
            activeIngredients,
            warnings,
            stock: stock,
            maxLimit: maxLimit
        };

        if (id) {
            await updateDoc(doc(db, 'products', id), productData);
            // Update in local memory cache to save Firestore reads
            const idx = cachedProductsList.findIndex(p => p.id === id);
            if (idx !== -1) {
                cachedProductsList[idx] = { ...cachedProductsList[idx], ...productData };
            }
        } else {
            productData.createdAt = new Date();
            const docRef = await addDoc(productsCol, productData);
            // Prepend new product to local cache to save Firestore reads
            cachedProductsList.unshift({ id: docRef.id, ...productData });
            currentPage = 1; // Go back to page 1 to see the new product
        }
        document.getElementById('productModal').classList.remove('active');
        productForm.reset();

        // Reset checkboxes and discounts
        const checkboxes = document.querySelectorAll('input[name="productCategories"]');
        checkboxes.forEach(cb => cb.checked = false);
        if (discountInput) discountInput.value = '';

        // Refresh products list view locally without re-fetching from database
        loadProductsPage(currentPage);
        updateTotalProductsCount();

        // Reset image selection
        selectedProductImageFile = null;
        if (productImageFile) productImageFile.value = '';
        productImagePreviewContainer.style.display = 'none';
        document.getElementById('productImage').value = '';

        // Reset extra fields
        document.getElementById('productDescription').value = '';
        document.getElementById('productUsage').value = '';
        document.getElementById('productActiveIngredients').value = '';
        document.getElementById('productWarnings').value = '';

    } catch (error) {
        console.error("Error saving product: ", error);
        alert('حدث خطأ أثناء إتمام العملية.');
    } finally {
        saveBtn.innerHTML = 'حفظ المنتج';
        saveBtn.disabled = false;
    }
});

// Global functions for inline HTML buttons
window.editProduct = function (id) {
    const prod = allProducts[id];
    if (!prod) return;

    document.getElementById('productId').value = id;
    document.getElementById('productName').value = prod.name || '';
    if (document.getElementById('productNameEn')) {
        document.getElementById('productNameEn').value = prod.nameEn || '';
    }
    document.getElementById('productPrice').value = prod.price || '';

    // Set discount input field
    const discountInput = document.getElementById('productDiscount');
    if (discountInput) {
        discountInput.value = prod.discount || '';
    }

    // Set stock and limit fields
    const stockInput = document.getElementById('productStock');
    if (stockInput) {
        stockInput.value = prod.stock !== undefined && prod.stock !== null ? prod.stock : '';
    }

    const limitInput = document.getElementById('productLimit');
    if (limitInput) {
        limitInput.value = prod.maxLimit !== undefined && prod.maxLimit !== null ? prod.maxLimit : '';
    }

    // Set checked checkboxes for categories
    const productCats = Array.isArray(prod.category) ? prod.category : (prod.category ? [prod.category] : []);
    const checkboxes = document.querySelectorAll('input[name="productCategories"]');
    checkboxes.forEach(cb => {
        cb.checked = productCats.includes(cb.value);
    });

    document.getElementById('productImage').value = prod.image || '';

    // Additional fields
    document.getElementById('productDescription').value = prod.description || '';
    document.getElementById('productUsage').value = prod.usage || '';
    document.getElementById('productActiveIngredients').value = prod.activeIngredients || '';
    document.getElementById('productWarnings').value = prod.warnings || '';

    // Show old image preview
    const image = prod.image;
    if (image && image !== 'https://via.placeholder.com/150') {
        productImagePreview.src = image;
        productImagePreviewContainer.style.display = 'block';
    } else {
        productImagePreviewContainer.style.display = 'none';
    }

    // Clear file selection cache
    selectedProductImageFile = null;
    if (productImageFile) productImageFile.value = '';

    document.getElementById('modalTitle').textContent = 'تعديل منتج';
    document.getElementById('productModal').classList.add('active');
};

window.deleteProduct = async function (id) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟')) {
        try {
            await deleteDoc(doc(db, 'products', id));
            // Remove from local memory cache to save Firestore reads
            cachedProductsList = cachedProductsList.filter(p => p.id !== id);

            // Adjust page number if the current page has no products left after deletion
            const maxPage = Math.max(1, Math.ceil(cachedProductsList.length / PAGE_SIZE));
            if (currentPage > maxPage) {
                currentPage = maxPage;
            }

            loadProductsPage(currentPage);
            updateTotalProductsCount();
        } catch (error) {
            console.error("Error deleting product:", error);
            alert("حدث خطأ أثناء حذف المنتج.");
        }
    }
};

window.viewOrder = function (id) {
    const order = allOrders[id];
    if (!order) return;

    const modal = document.getElementById('orderDetailsModal');
    const content = document.getElementById('orderDetailsContent');
    const actionDiv = document.getElementById('orderActionDiv');

    let itemsHtml = ``;
    if (order.items && order.items.length > 0) {
        itemsHtml = `<ul>`;
        order.items.forEach(item => {
            itemsHtml += `<li>${escapeHTML(item.name)} - الكمية: ${Number(item.quantity)} - ${Number(item.price)} ج.م</li>`;
        });
        itemsHtml += `</ul>`;
    } else {
        itemsHtml = `<div style="white-space: pre-wrap; padding: 10px; background: rgba(0,0,0,0.03); border-radius: 5px; border: 1px solid var(--border-color);">${escapeHTML(order.orderDetails || 'لا توجد تفاصيل')}</div>`;
    }

    let prescriptionHtml = '';
    const pUrl = order.prescriptionUrl;
    if (pUrl && typeof pUrl === 'string' && pUrl.length > 5 && (pUrl.startsWith('http://') || pUrl.startsWith('https://'))) {
        const escapedUrl = escapeHTML(pUrl);
        prescriptionHtml = `
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid var(--border-color);">
            <p><strong>صورة الروشتة المرفقة:</strong></p>
            <a href="${escapedUrl}" target="_blank">
                <img src="${escapedUrl}" style="max-width: 100%; max-height: 250px; border-radius: 10px; margin-top: 10px; border: 1px solid var(--border-color);">
            </a>
        `;
    }

    const name = escapeHTML(order.name);
    const phone = escapeHTML(order.phone);
    const governorate = order.governorate ? escapeHTML(order.governorate) : 'غير محدد';
    const address = escapeHTML(order.address || 'غير محدد');
    const total = Number(order.total) || 0;

    content.innerHTML = `
        <p><strong>اسم العميل:</strong> ${name}</p>
        <p><strong>رقم الهاتف:</strong> <a href="tel:${phone}" dir="ltr">${phone}</a></p>
        <p><strong>المحافظة:</strong> <span style="color: var(--primary-color); font-weight: bold;">${governorate}</span></p>
        <p><strong>العنوان:</strong> ${address}</p>
        <hr style="margin: 10px 0; border: 0; border-top: 1px solid var(--border-color);">
        <p><strong>الطلب / المنتجات:</strong></p>
        ${itemsHtml}
        <p style="font-size: 18px; color: var(--primary-color);"><strong>الإجمالي:</strong> ${total} ج.م</p>
        ${prescriptionHtml}
    `;

    if (order.status === 'new' || !order.status) {
        actionDiv.innerHTML = `<button class="btn-primary" onclick="markOrderDone('${id}')">تحديد كـ "مكتمل"</button>`;
    } else {
        actionDiv.innerHTML = `<span style="color: var(--success-color); font-weight: bold;"><i class="fa-solid fa-check-circle"></i> هذا الطلب مكتمل</span>`;
    }

    modal.classList.add('active');
};

window.markOrderDone = async function (id) {
    await updateDoc(doc(db, 'orders', id), { status: 'done' });
    document.getElementById('orderDetailsModal').classList.remove('active');
};

window.deleteCategory = async function (id) {
    if (confirm('هل أنت متأكد من حذف هذا القسم؟ (لن يتم حذف المنتجات الموجودة به تلقائياً)')) {
        await deleteDoc(doc(db, 'categories', id));
    }
};

// Real-time listener for Categories
onSnapshot(query(categoriesCol, orderBy('createdAt', 'asc')), async (snapshot) => {
    if (snapshot.empty) {
        const defaults = [
            { name: 'أدوية', type: 'icon', icon: 'fa-solid fa-pills', image: '', discount: 0 },
            { name: 'مستحضرات تجميل', type: 'icon', icon: 'fa-solid fa-wand-magic-sparkles', image: '', discount: 0 },
            { name: 'إكسسوارات طبية', type: 'icon', icon: 'fa-solid fa-heart-pulse', image: '', discount: 0 }
        ];
        for (let cat of defaults) {
            await addDoc(categoriesCol, { ...cat, createdAt: new Date() });
        }
        return;
    }

    categoriesList.innerHTML = '';
    if (productCategoriesContainer) {
        productCategoriesContainer.innerHTML = '';
    }

    const excelCategorySelect = document.getElementById('excelCategorySelect');
    if (excelCategorySelect) {
        excelCategorySelect.innerHTML = '<option value="">اختر القسم للإكسيل...</option>';
    }

    const adminProductCategoryFilter = document.getElementById('adminProductCategoryFilter');
    if (adminProductCategoryFilter) {
        adminProductCategoryFilter.innerHTML = '<option value="">كل الأقسام</option>';
    }

    snapshot.forEach(docSnap => {
        const cat = docSnap.data();
        const id = docSnap.id;

        // Visual indicator for category icon/image
        let visualHtml = '';
        if (cat.type === 'icon') {
            visualHtml = `<span style="margin-left: 10px; font-size: 18px; color: var(--primary-color);"><i class="${escapeHTML(cat.icon) || 'fa-solid fa-tags'}"></i></span>`;
        } else if (cat.type === 'image') {
            const catImgUrl = cat.image && (cat.image.startsWith('http://') || cat.image.startsWith('https://')) ? escapeHTML(cat.image) : 'https://via.placeholder.com/150';
            visualHtml = `<img src="${catImgUrl}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: cover; margin-left: 10px; border: 1px solid var(--border-color);">`;
        } else {
            visualHtml = `<span style="margin-left: 10px; font-size: 18px; color: var(--text-gray);"><i class="fa-solid fa-tags"></i></span>`;
        }

        const discountHtml = cat.discount ? `<span style="color: var(--error-color); font-weight: bold; margin-right: 8px;">(خصم ${cat.discount}%)</span>` : '';

        // Modal List
        const li = document.createElement('li');
        li.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.02); margin-bottom: 8px; border-radius: 8px; border: 1px solid var(--border-color);";

        const safeCatName = escapeHTML(cat.name).replace(/'/g, "\\'");
        const safeIcon = escapeHTML(cat.icon || '').replace(/'/g, "\\'");
        const safeImage = escapeHTML(cat.image || '').replace(/'/g, "\\'");

        li.innerHTML = `
            <div style="display: flex; align-items: center;">
                ${visualHtml}
                <span style="font-weight: bold;">${escapeHTML(cat.name)}</span>
                ${discountHtml}
            </div>
            <div style="display: flex; gap: 5px;">
                <button onclick="editCategory('${id}', '${safeCatName}', '${escapeHTML(cat.type || 'icon')}', '${safeIcon}', '${safeImage}', ${cat.discount || 0})" style="background: var(--primary-color); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCategory('${id}')" style="background: var(--error-color); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        categoriesList.appendChild(li);

        // Populate checkboxes in product modal
        if (productCategoriesContainer) {
            const div = document.createElement('div');
            div.style = "display: flex; align-items: center; gap: 8px; font-family: inherit;";
            const catDiscountText = cat.discount ? ` <span style="color: var(--error-color); font-size: 13px;">(خصم ${cat.discount}%)</span>` : '';
            div.innerHTML = `
                <input type="checkbox" name="productCategories" value="${escapeHTML(cat.name)}" id="cat_chk_${id}" style="width: 18px; height: 18px; accent-color: var(--primary-color); cursor: pointer;">
                <label for="cat_chk_${id}" style="margin: 0; cursor: pointer; font-weight: 500; font-size: 15px;">${escapeHTML(cat.name)}${catDiscountText}</label>
            `;
            productCategoriesContainer.appendChild(div);
        }

        // Filter Select Options
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;

        if (excelCategorySelect) {
            excelCategorySelect.appendChild(option.cloneNode(true));
        }

        if (adminProductCategoryFilter) {
            adminProductCategoryFilter.appendChild(option.cloneNode(true));
        }
    });
});

window.editCategory = function (id, name, type, icon, image, discount) {
    document.getElementById('editCategoryId').value = id;
    document.getElementById('newCategoryName').value = name;

    const newCategoryDiscount = document.getElementById('newCategoryDiscount');
    if (newCategoryDiscount) {
        newCategoryDiscount.value = discount || '';
    }

    const typeSelect = document.getElementById('newCategoryType');
    if (typeSelect) {
        typeSelect.value = type;
        typeSelect.dispatchEvent(new Event('change'));
    }

    if (type === 'icon') {
        document.getElementById('selectedIconClass').value = icon;
        const iconOptions = document.querySelectorAll('.icon-option');
        iconOptions.forEach(opt => {
            if (opt.getAttribute('data-icon') === icon) {
                opt.classList.add('active');
                opt.style.borderColor = 'var(--primary-color)';
                opt.style.background = 'rgba(11,128,122,0.05)';
                opt.style.color = 'var(--primary-color)';
            } else {
                opt.classList.remove('active');
                opt.style.borderColor = 'var(--border-color)';
                opt.style.background = 'none';
                opt.style.color = 'var(--text-gray)';
            }
        });
    } else {
        document.getElementById('categoryImage').value = image;
    }

    document.getElementById('addCategoryBtn').textContent = 'حفظ تعديلات القسم';
    document.getElementById('cancelEditCategoryBtn').style.display = 'block';
};

window.resetCategoryForm = function () {
    document.getElementById('editCategoryId').value = '';
    document.getElementById('newCategoryName').value = '';

    const newCategoryDiscount = document.getElementById('newCategoryDiscount');
    if (newCategoryDiscount) newCategoryDiscount.value = '';

    const imageInput = document.getElementById('categoryImage');
    if (imageInput) imageInput.value = '';

    const imageFile = document.getElementById('categoryImageFile');
    if (imageFile) imageFile.value = '';

    document.getElementById('addCategoryBtn').textContent = 'إضافة القسم الجديد';
    document.getElementById('cancelEditCategoryBtn').style.display = 'none';
};

const cancelEditCategoryBtn = document.getElementById('cancelEditCategoryBtn');
if (cancelEditCategoryBtn) {
    cancelEditCategoryBtn.addEventListener('click', () => {
        resetCategoryForm();
    });
}

if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', async () => {
        const val = newCategoryName.value.trim();
        const editId = document.getElementById('editCategoryId').value;
        if (val) {
            addCategoryBtn.innerHTML = editId ? 'جاري الحفظ... <i class="fa-solid fa-spinner fa-spin"></i>' : 'جاري الإضافة... <i class="fa-solid fa-spinner fa-spin"></i>';
            addCategoryBtn.disabled = true;

            const type = document.getElementById('newCategoryType').value;
            let icon = '';
            let image = '';
            const discountInput = document.getElementById('newCategoryDiscount');
            const discount = discountInput && discountInput.value ? Number(discountInput.value) : 0;

            try {
                if (type === 'icon') {
                    icon = document.getElementById('selectedIconClass').value || 'fa-solid fa-pills';
                } else {
                    const imgFile = document.getElementById('categoryImageFile').files[0];
                    const imgUrl = document.getElementById('categoryImage').value.trim();
                    if (imgFile) {
                        const fileName = Date.now() + '_' + imgFile.name;
                        const storageRef = ref(storage, 'categories/' + fileName);
                        const snapshot = await uploadBytes(storageRef, imgFile);
                        image = await getDownloadURL(snapshot.ref);
                    } else if (imgUrl) {
                        image = imgUrl;
                    } else {
                        image = 'https://via.placeholder.com/150';
                    }
                }

                const catData = {
                    name: val,
                    type: type,
                    icon: icon,
                    image: image,
                    discount: Number(discount) || 0
                };

                if (editId) {
                    await updateDoc(doc(db, 'categories', editId), catData);
                } else {
                    catData.createdAt = new Date();
                    await addDoc(categoriesCol, catData);
                }

                resetCategoryForm();
            } catch (err) {
                console.error("Error saving category:", err);
                alert("حدث خطأ أثناء حفظ القسم.");
            } finally {
                addCategoryBtn.textContent = editId ? 'حفظ تعديلات القسم' : 'إضافة القسم الجديد';
                addCategoryBtn.disabled = false;
            }
        }
    });
}

// --- Pagination and Search Logic for Products ---

async function loadProductsPage(page = 1) {
    if (isFetchingProducts) return;

    try {
        currentPage = page;
        const currentPageNum = document.getElementById('currentPageNum');
        if (currentPageNum) currentPageNum.textContent = currentPage;

        // If cache is empty, fetch all products from Firestore once
        if (cachedProductsList.length === 0) {
            isFetchingProducts = true;
            productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل المنتجات...</td></tr>`;

            const q = query(productsCol, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            cachedProductsList = [];
            querySnapshot.forEach(docSnap => {
                cachedProductsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            isFetchingProducts = false;
        }

        // Apply filters locally (Category and Case-insensitive Arabic Normalized Search)
        let filteredProducts = cachedProductsList;

        if (selectedCategory) {
            filteredProducts = filteredProducts.filter(p => {
                const cats = Array.isArray(p.category) ? p.category : [p.category || ''];
                return cats.includes(selectedCategory);
            });
        }

        if (searchQuery.trim() !== '') {
            const searchLower = searchQuery.toLowerCase().trim();
            const normalizeArabic = (str) => {
                return str
                    .replace(/[أإآ]/g, 'ا')
                    .replace(/ة/g, 'ه')
                    .replace(/ى/g, 'ي')
                    .toLowerCase();
            };
            const normalizedSearch = normalizeArabic(searchLower);
            filteredProducts = filteredProducts.filter(p => {
                const matchAr = p.name && normalizeArabic(p.name).includes(normalizedSearch);
                const matchEn = p.nameEn && p.nameEn.toLowerCase().includes(searchLower);
                return matchAr || matchEn;
            });
        }

        const totalCount = filteredProducts.length;

        // Paginate local array
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const paginatedItems = filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);

        // Render products
        renderProductsList(paginatedItems);

        // Update UI pagination controls
        updatePaginationUI(totalCount, startIndex, paginatedItems.length);

    } catch (error) {
        console.error("Error loading products:", error);
        productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--error-color);"><i class="fa-solid fa-circle-exclamation"></i> حدث خطأ أثناء تحميل المنتجات.</td></tr>`;
        isFetchingProducts = false;
    }
}

function renderProductsList(products) {
    productsTableBody.innerHTML = '';
    allProducts = {}; // Reset local cache for editProduct functionality

    if (products.length === 0) {
        productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">لا توجد منتجات مطابقة.</td></tr>`;
        return;
    }

    products.forEach((prod) => {
        const id = prod.id;
        allProducts[id] = prod; // Store product in local cache for edit modal

        const categoryText = Array.isArray(prod.category) ? prod.category.join('، ') : (prod.category || 'غير محدد');

        let priceHtml = `${prod.price} ج.م`;
        if (prod.discount) {
            const finalPrice = Math.round(prod.price * (1 - prod.discount / 100) * 100) / 100;
            priceHtml = `
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: bold; color: var(--primary-dark);">${finalPrice} ج.م</span>
                    <span style="text-decoration: line-through; color: var(--text-gray); font-size: 12px;">${prod.price} ج.م</span>
                    <span style="color: var(--error-color); font-size: 11px; font-weight: bold;">(خصم %${prod.discount})</span>
                </div>
            `;
        }

        const stockVal = prod.stock !== undefined && prod.stock !== null && prod.stock !== '' ? prod.stock : 'مفتوح';
        const limitVal = prod.maxLimit !== undefined && prod.maxLimit !== null && prod.maxLimit !== '' ? prod.maxLimit : 'لا يوجد';
        const stockLimitHtml = `
            <div style="font-size: 13px; line-height: 1.4;">
                <div>المخزن: <span style="font-weight: bold; color: ${stockVal === 0 ? 'var(--error-color)' : 'inherit'};">${stockVal}</span></div>
                <div>الحد: <span style="font-weight: bold; color: var(--primary-color);">${limitVal}</span></div>
            </div>
        `;

        const tr = document.createElement('tr');
        const imgUrl = prod.image && (prod.image.startsWith('http://') || prod.image.startsWith('https://')) ? escapeHTML(prod.image) : 'https://via.placeholder.com/150';

        const displayNameAr = prod.name ? escapeHTML(prod.name) : '';
        const displayNameEn = prod.nameEn ? escapeHTML(prod.nameEn) : '';
        let nameCellContent = '';
        if (displayNameAr && displayNameEn) {
            nameCellContent = `<div style="font-weight: bold; font-family: inherit;">${displayNameAr}</div><div style="font-weight: 500; color: var(--text-gray); font-size: 13px; font-family: inherit; margin-top: 2px;">${displayNameEn}</div>`;
        } else {
            nameCellContent = `<div style="font-weight: bold; font-family: inherit;">${displayNameAr || displayNameEn}</div>`;
        }

        tr.innerHTML = `
            <td><img src="${imgUrl}" width="50" height="50" style="border-radius:8px; object-fit:cover;"></td>
            <td>${nameCellContent}</td>
            <td>${escapeHTML(categoryText)}</td>
            <td>${priceHtml}</td>
            <td>${stockLimitHtml}</td>
            <td>
                <button class="action-btn edit-btn" onclick="editProduct('${id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete-btn" onclick="deleteProduct('${id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        productsTableBody.appendChild(tr);
    });
}

function updatePaginationUI(totalCount, startIndex, countOnPage) {
    const paginationTotal = document.getElementById('paginationTotal');
    const paginationRange = document.getElementById('paginationRange');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    if (paginationTotal) paginationTotal.textContent = totalCount;

    if (paginationRange) {
        if (totalCount === 0) {
            paginationRange.textContent = '0 - 0';
        } else {
            const start = startIndex + 1;
            const end = startIndex + countOnPage;
            paginationRange.textContent = `${start} - ${end}`;
        }
    }

    if (prevPageBtn) {
        prevPageBtn.disabled = currentPage === 1;
    }

    if (nextPageBtn) {
        const hasNext = startIndex + countOnPage < totalCount;
        nextPageBtn.disabled = !hasNext;
    }
}

async function updateTotalProductsCount() {
    try {
        if (cachedProductsList.length > 0) {
            if (totalProductsCount) totalProductsCount.textContent = cachedProductsList.length;
            return;
        }
        const snapshot = await getCountFromServer(productsCol);
        const count = snapshot.data().count;
        if (totalProductsCount) totalProductsCount.textContent = count;
    } catch (e) {
        console.error("Error fetching total products count:", e);
    }
}

// Search and Filter Event Listeners
const adminProductSearch = document.getElementById('adminProductSearch');
const adminProductCategoryFilter = document.getElementById('adminProductCategoryFilter');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

if (adminProductSearch) {
    adminProductSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        loadProductsPage(1);
    });
}

if (adminProductCategoryFilter) {
    adminProductCategoryFilter.addEventListener('change', (e) => {
        selectedCategory = e.target.value;
        loadProductsPage(1);
    });
}

if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            loadProductsPage(currentPage - 1);
        }
    });
}

if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
        loadProductsPage(currentPage + 1);
    });
}

// Trigger initial load
loadProductsPage(1);
updateTotalProductsCount();

// Real-time listener for Orders (limit to 50 for fast loading and low reads)
onSnapshot(query(ordersCol, orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
    recentOrdersBody.innerHTML = '';
    allOrdersBody.innerHTML = '';
    totalOrdersCount.textContent = snapshot.size;
    allOrders = {}; // Reset local cache of orders

    let count = 0;
    snapshot.forEach((docSnap) => {
        const order = docSnap.data();
        const id = docSnap.id;
        allOrders[id] = order; // Cache order locally for viewOrder

        const statusBadge = order.status === 'done'
            ? `<span class="status-badge status-done">مكتمل</span>`
            : `<span class="status-badge status-new">جديد</span>`;

        const dateObj = order.createdAt ? order.createdAt.toDate() : new Date();
        const dateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const total = order.total || 0;
        const governorate = order.governorate || 'غير محدد';

        // Add to All orders
        const allTr = document.createElement('tr');
        allTr.innerHTML = `
            <td dir="ltr" style="font-size:14px; color:var(--text-gray)">${dateStr}</td>
            <td><strong>${escapeHTML(order.name)}</strong><div style="font-size: 12px; color: var(--primary-color)">${escapeHTML(governorate)}</div></td>
            <td dir="ltr">${escapeHTML(order.phone)}</td>
            <td><button class="btn-outline" style="padding: 5px 10px; font-size:13px;" onclick="viewOrder('${id}')">التفاصيل</button></td>
            <td>${statusBadge}</td>
            <td>
                ${order.status !== 'done' ? `<button class="action-btn" style="color:var(--success-color)" title="إكمال" onclick="markOrderDone('${id}')"><i class="fa-solid fa-check"></i></button>` : ''}
            </td>
        `;
        allOrdersBody.appendChild(allTr);

        // Add to Recent orders (limit 5)
        if (count < 5) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family:monospace; color:var(--text-gray)">${id.substring(0, 6)}...</td>
                <td><strong>${escapeHTML(order.name)}</strong></td>
                <td dir="ltr" style="font-size:14px;">${dateStr}</td>
                <td>${statusBadge}</td>
            `;
            recentOrdersBody.appendChild(tr);
            count++;
        }
    });

    if (snapshot.empty) {
        recentOrdersBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">لا توجد طلبات حتى الآن.</td></tr>`;
        allOrdersBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">لا توجد طلبات حتى الآن.</td></tr>`;
    }
});

// Delivery Settings Logic
const deliverySettingsDoc = doc(db, 'settings', 'delivery');
const deliveryTableBody = document.querySelector('#deliveryTable tbody');
const saveDeliveryBtn = document.getElementById('saveDeliveryBtn');

const governoratesList = [
    "القاهرة", "الإسكندرية", "الجيزة", "القليوبية", "بورسعيد", "السويس", "الإسماعيلية",
    "الدقهلية", "الشرقية (بلبيس)", "الشرقية (مناطق أخرى)", "الغربية", "المنوفية", "البحيرة", "دمياط", "كفر الشيخ",
    "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان",
    "البحر الأحمر", "الوادي الجديد", "مطروح", "شمال سيناء", "جنوب سيناء"
];

let currentDeliveryFees = {};

onSnapshot(deliverySettingsDoc, async (docSnap) => {
    if (!docSnap.exists()) {
        const defaultFees = {};
        governoratesList.forEach(gov => defaultFees[gov] = 50);
        await setDoc(deliverySettingsDoc, { fees: defaultFees }).catch(console.error);
        return;
    }

    currentDeliveryFees = docSnap.data().fees || {};
    if (deliveryTableBody) {
        deliveryTableBody.innerHTML = '';

        governoratesList.forEach(gov => {
            const fee = currentDeliveryFees[gov] !== undefined ? currentDeliveryFees[gov] : 50;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${gov}</strong></td>
                <td>
                    <input type="number" class="delivery-fee-input" data-gov="${gov}" value="${fee}" style="width: 100px; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
                </td>
            `;
            deliveryTableBody.appendChild(tr);
        });
    }
});

if (saveDeliveryBtn) {
    saveDeliveryBtn.addEventListener('click', async () => {
        saveDeliveryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
        saveDeliveryBtn.disabled = true;

        const inputs = document.querySelectorAll('.delivery-fee-input');
        const updatedFees = {};
        inputs.forEach(input => {
            updatedFees[input.dataset.gov] = Number(input.value) || 0;
        });

        try {
            await setDoc(deliverySettingsDoc, { fees: updatedFees }, { merge: true });
            saveDeliveryBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم الحفظ';
            setTimeout(() => {
                saveDeliveryBtn.innerHTML = '<i class="fa-solid fa-save"></i> حفظ التعديلات';
                saveDeliveryBtn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error("Error saving delivery fees: ", error);
            alert("حدث خطأ أثناء حفظ رسوم التوصيل.");
            saveDeliveryBtn.innerHTML = '<i class="fa-solid fa-save"></i> حفظ التعديلات';
            saveDeliveryBtn.disabled = false;
        }
    });
}

// Excel Upload Logic
const excelFileInput = document.getElementById('excelFileInput');
if (excelFileInput) {
    excelFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const excelCategorySelect = document.getElementById('excelCategorySelect');
        const selectedCategory = excelCategorySelect ? excelCategorySelect.value : '';

        if (!selectedCategory) {
            alert('يرجى اختيار القسم أولاً قبل رفع ملف الإكسيل.');
            excelFileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to array of arrays
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (rows.length < 2) {
                    alert('الملف فارغ أو لا يحتوي على بيانات صحيحة.');
                    return;
                }

                if (!confirm(`تم العثور على ${rows.length - 1} صف. هل تريد إضافة هذه المنتجات لقسم "${selectedCategory}"؟`)) {
                    excelFileInput.value = '';
                    return;
                }

                let successCount = 0;

                // Assuming first row is header, start from index 1
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;

                    const name = row[0]; // First column
                    const priceRaw = row[2]; // Third column

                    if (!name || isNaN(parseFloat(priceRaw))) {
                        continue;
                    }

                    const price = parseFloat(priceRaw);

                    const productData = {
                        name: String(name).trim(),
                        price: price,
                        category: [selectedCategory], // Store as array
                        image: 'logo.png', // Default image
                        createdAt: new Date()
                    };

                    const docRef = await addDoc(productsCol, productData);
                    // Add to cache locally to avoid full re-fetches
                    cachedProductsList.unshift({ id: docRef.id, ...productData });
                    successCount++;
                }

                alert(`تم بنجاح! إضافة ${successCount} منتج إلى قسم "${selectedCategory}".`);
                loadProductsPage(1);
                updateTotalProductsCount();
            } catch (error) {
                console.error("Excel processing error: ", error);
                alert("حدث خطأ أثناء معالجة ملف الإكسيل.");
            } finally {
                excelFileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// Export Products to Excel
const exportProductsBtn = document.getElementById('exportProductsExcelBtn');
if (exportProductsBtn) {
    exportProductsBtn.addEventListener('click', async () => {
        try {
            exportProductsBtn.disabled = true;
            exportProductsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التصدير...';

            const querySnapshot = await getDocs(collection(db, 'products'));
            if (querySnapshot.empty) {
                alert("لا توجد منتجات لتصديرها.");
                return;
            }

            const excelData = [];
            let index = 1;
            querySnapshot.forEach(docSnap => {
                const prod = docSnap.data();
                excelData.push({
                    "م": index++,
                    "اسم المنتج (بالعربية)": prod.name || '',
                    "اسم المنتج (بالإنجليزية)": prod.nameEn || '',
                    "السعر (ج.م)": prod.price || 0,
                    "نسبة الخصم (%)": prod.discount || 0,
                    "السعر بعد الخصم (ج.م)": prod.finalPrice || prod.price || 0,
                    "المخزون": prod.stock !== undefined && prod.stock !== null ? prod.stock : 'غير محدود',
                    "القسم": prod.category || '',
                    "رابط الصورة": prod.image || ''
                });
            });

            const worksheet = XLSX.utils.json_to_sheet(excelData);
            worksheet['!cols'] = [
                { wch: 6 },  // م
                { wch: 30 }, // اسم المنتج (بالعربية)
                { wch: 30 }, // اسم المنتج (بالإنجليزية)
                { wch: 12 }, // السعر
                { wch: 12 }, // الخصم
                { wch: 15 }, // السعر بعد الخصم
                { wch: 12 }, // المخزون
                { wch: 20 }, // القسم
                { wch: 40 }  // رابط الصورة
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "منتجات صيدلية البدري");

            const today = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `منتجات_صيدلية_البدري_${today}.xlsx`);
        } catch (err) {
            console.error("Error exporting products:", err);
            alert("حدث خطأ أثناء تصدير المنتجات.");
        } finally {
            exportProductsBtn.disabled = false;
            exportProductsBtn.innerHTML = '<i class="fa-solid fa-file-excel"></i> تصدير المنتجات (إكسيل)';
        }
    });
}

// ------------- Slide Slider Management -------------
const slidesCol = collection(db, 'slides');
const slideForm = document.getElementById('slideForm');
const saveSlideBtn = document.getElementById('saveSlideBtn');
const slideImageFile = document.getElementById('slideImageFile');
const slideImagePreviewContainer = document.getElementById('slideImagePreviewContainer');
const slideImagePreview = document.getElementById('slideImagePreview');
const slideImageUrlInput = document.getElementById('slideImage');
const slidesTableBody = document.querySelector('#slidesTable tbody');
let selectedSlideImageFile = null;

if (slideImageFile) {
    slideImageFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedSlideImageFile = file;
            const reader = new FileReader();
            reader.onload = function (e) {
                slideImagePreview.src = e.target.result;
                slideImagePreviewContainer.style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    });
}

if (slideImageUrlInput) {
    slideImageUrlInput.addEventListener('input', (e) => {
        if (!selectedSlideImageFile && e.target.value) {
            slideImagePreview.src = e.target.value;
            slideImagePreviewContainer.style.display = 'block';
        }
    });
}

let allSlides = {};

window.resetSlideForm = function () {
    if (slideForm) slideForm.reset();
    document.getElementById('slideId').value = '';

    if (saveSlideBtn) saveSlideBtn.innerHTML = 'إضافة الشريحة الإعلانية';

    const cancelSlideEditBtn = document.getElementById('cancelSlideEditBtn');
    if (cancelSlideEditBtn) cancelSlideEditBtn.style.display = 'none';

    selectedSlideImageFile = null;
    if (slideImageFile) slideImageFile.value = '';
    if (slideImageUrlInput) slideImageUrlInput.value = '';
    if (slideImagePreviewContainer) slideImagePreviewContainer.style.display = 'none';
};

const cancelSlideEditBtn = document.getElementById('cancelSlideEditBtn');
if (cancelSlideEditBtn) {
    cancelSlideEditBtn.addEventListener('click', () => {
        resetSlideForm();
    });
}

if (slideForm) {
    slideForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveSlideBtn.innerHTML = 'جاري الحفظ... <span class="spinner"></span>';
        saveSlideBtn.disabled = true;

        const id = document.getElementById('slideId').value;
        const title = document.getElementById('slideTitle').value.trim();
        const description = document.getElementById('slideDescription').value.trim();
        const link = document.getElementById('slideLink').value.trim();
        let image = slideImageUrlInput.value.trim() || 'https://via.placeholder.com/800x400';

        try {
            if (selectedSlideImageFile) {
                const fileName = Date.now() + '_' + selectedSlideImageFile.name;
                const storageRef = ref(storage, 'slides/' + fileName);
                const snapshot = await uploadBytes(storageRef, selectedSlideImageFile);
                image = await getDownloadURL(snapshot.ref);
            }

            const slideData = {
                title,
                description,
                link,
                image
            };

            if (id) {
                await updateDoc(doc(db, 'slides', id), slideData);
                alert('تم تعديل الشريحة الإعلانية بنجاح!');
            } else {
                slideData.createdAt = new Date();
                await addDoc(slidesCol, slideData);
                alert('تم إضافة الشريحة الإعلانية بنجاح!');
            }

            resetSlideForm();

        } catch (error) {
            console.error("Error saving slide: ", error);
            alert('حدث خطأ أثناء حفظ الشريحة.');
        } finally {
            saveSlideBtn.innerHTML = id ? 'تعديل الشريحة الإعلانية' : 'إضافة الشريحة الإعلانية';
            saveSlideBtn.disabled = false;
        }
    });
}

// Real-time listener for slides
if (slidesTableBody) {
    onSnapshot(query(slidesCol, orderBy('createdAt', 'desc')), (snapshot) => {
        slidesTableBody.innerHTML = '';
        allSlides = {};
        if (snapshot.empty) {
            slidesTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">لا توجد إعلانات نشطة حالياً.</td></tr>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const slide = docSnap.data();
            const id = docSnap.id;
            allSlides[id] = slide;

            const tr = document.createElement('tr');
            const slideImgUrl = slide.image && (slide.image.startsWith('http://') || slide.image.startsWith('https://')) ? escapeHTML(slide.image) : 'https://via.placeholder.com/150';
            const slideLink = slide.link && (slide.link.startsWith('http://') || slide.link.startsWith('https://')) ? escapeHTML(slide.link) : '#';
            tr.innerHTML = `
                <td><img src="${slideImgUrl}" width="100" height="50" style="border-radius:6px; object-fit:cover; border: 1px solid var(--border-color);"></td>
                <td><strong>${escapeHTML(slide.title || 'بدون عنوان')}</strong></td>
                <td>${escapeHTML(slide.description || 'بدون وصف')}</td>
                <td><a href="${slideLink}" target="_blank" style="color: var(--primary-color); word-break: break-all;">${slideLink}</a></td>
                <td>
                    <button class="action-btn edit-btn" style="color: var(--primary-color); margin-left: 8px;" onclick="editSlide('${id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn delete-btn" onclick="deleteSlide('${id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            slidesTableBody.appendChild(tr);
        });
    });
}

window.editSlide = function (id) {
    const slide = allSlides[id];
    if (!slide) return;

    document.getElementById('slideId').value = id;
    document.getElementById('slideTitle').value = slide.title || '';
    document.getElementById('slideDescription').value = slide.description || '';
    document.getElementById('slideLink').value = slide.link || '';
    document.getElementById('slideImage').value = slide.image || '';

    if (slide.image && slideImagePreview && slideImagePreviewContainer) {
        slideImagePreview.src = slide.image;
        slideImagePreviewContainer.style.display = 'block';
    } else if (slideImagePreviewContainer) {
        slideImagePreviewContainer.style.display = 'none';
    }

    selectedSlideImageFile = null;
    if (slideImageFile) slideImageFile.value = '';

    if (saveSlideBtn) saveSlideBtn.innerHTML = 'حفظ التعديلات';

    const cancelSlideEditBtn = document.getElementById('cancelSlideEditBtn');
    if (cancelSlideEditBtn) cancelSlideEditBtn.style.display = 'block';

    const slideForm = document.getElementById('slideForm');
    if (slideForm) {
        slideForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.deleteSlide = async function (id) {
    if (confirm('هل أنت متأكد من حذف هذا الإعلان نهائياً؟')) {
        try {
            await deleteDoc(doc(db, 'slides', id));
        } catch (error) {
            console.error("Error deleting slide:", error);
            alert("حدث خطأ أثناء حذف الإعلان.");
        }
    }
};

// ==================== MEDICINE RESERVATIONS MODULE ====================
let allReservations = {};
let currentWaReservationId = null;

// DOM Elements
const totalReservationsCountEl = document.getElementById('totalReservationsCount');
const totalCollectedAmountEl = document.getElementById('totalCollectedAmount');
const totalRemainingAmountEl = document.getElementById('totalRemainingAmount');
const totalReservationsValueEl = document.getElementById('totalReservationsValue');
const reservationsTableBody = document.querySelector('#reservationsTable tbody');

const openAddReservationModalBtn = document.getElementById('openAddReservationModal');
const closeReservationModalBtn = document.getElementById('closeReservationModal');
const reservationModalEl = document.getElementById('reservationModal');
const reservationFormEl = document.getElementById('reservationForm');

const resIdInput = document.getElementById('reservationId');
const resCustomerNameInput = document.getElementById('resCustomerName');
const resCustomerPhoneInput = document.getElementById('resCustomerPhone');
const resCustomerAddressInput = document.getElementById('resCustomerAddress');
const resBranchInput = document.getElementById('resBranch');
const resOrderDetailsInput = document.getElementById('resOrderDetails');
const resTotalPriceInput = document.getElementById('resTotalPrice');
const resPaidAmountInput = document.getElementById('resPaidAmount');
const resRemainingAmountInput = document.getElementById('resRemainingAmount');
const resStatusInput = document.getElementById('resStatus');
const resNotesInput = document.getElementById('resNotes');
const resContactPersonInput = document.getElementById('resContactPerson');
const resContactNoteInput = document.getElementById('resContactNote');

const resSearchInput = document.getElementById('resSearchInput');
const resStatusFilter = document.getElementById('resStatusFilter');

const whatsappModalEl = document.getElementById('whatsappModal');
const closeWhatsappModalBtn = document.getElementById('closeWhatsappModal');
const cancelWaBtn = document.getElementById('cancelWaBtn');
const waCustomerNameDisplay = document.getElementById('waCustomerNameDisplay');
const waCustomerPhoneDisplay = document.getElementById('waCustomerPhoneDisplay');
const waMessageText = document.getElementById('waMessageText');
const sendWaBtn = document.getElementById('sendWaBtn');

// Helper to format creation date cleanly
function formatReservationDate(dateVal) {
    if (!dateVal) return '<span style="color:var(--text-gray);">-</span>';
    let dateObj;
    if (dateVal.toDate && typeof dateVal.toDate === 'function') {
        dateObj = dateVal.toDate();
    } else if (typeof dateVal === 'object' && dateVal.seconds) {
        dateObj = new Date(dateVal.seconds * 1000);
    } else {
        dateObj = new Date(dateVal);
    }
    
    if (isNaN(dateObj.getTime())) return '<span style="color:var(--text-gray);">-</span>';

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    
    let hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeStr = `${hours}:${minutes} ${ampm}`;

    return `<div style="font-weight:600; font-size:13px; color:#1e293b;">${year}/${month}/${day}</div><div style="font-size:11px; color:var(--text-gray); font-family:monospace; margin-top:2px;" dir="ltr">${timeStr}</div>`;
}

// Auto-calculate remaining amount
function updateRemaining() {
    if (!resTotalPriceInput || !resPaidAmountInput || !resRemainingAmountInput) return;
    const total = parseFloat(resTotalPriceInput.value) || 0;
    const paid = parseFloat(resPaidAmountInput.value) || 0;
    const rem = Math.max(0, total - paid);
    resRemainingAmountInput.value = rem.toFixed(2);
}

if (resTotalPriceInput) resTotalPriceInput.addEventListener('input', updateRemaining);
if (resPaidAmountInput) resPaidAmountInput.addEventListener('input', updateRemaining);

// Open Modal
if (openAddReservationModalBtn) {
    openAddReservationModalBtn.addEventListener('click', () => {
        if (reservationFormEl) reservationFormEl.reset();
        if (resIdInput) resIdInput.value = '';
        if (resBranchInput) resBranchInput.value = '';
        if (resRemainingAmountInput) resRemainingAmountInput.value = '0.00';
        const modalTitle = document.getElementById('resModalTitle');
        if (modalTitle) modalTitle.textContent = 'إضافة حجز دواء جديد';
        if (reservationModalEl) reservationModalEl.classList.add('active');
    });
}

if (closeReservationModalBtn) {
    closeReservationModalBtn.addEventListener('click', () => {
        if (reservationModalEl) reservationModalEl.classList.remove('active');
    });
}

// Export Reservations to Excel
const exportReservationsBtn = document.getElementById('exportReservationsExcelBtn');
if (exportReservationsBtn) {
    exportReservationsBtn.addEventListener('click', () => {
        const resList = Object.values(allReservations);
        if (resList.length === 0) {
            alert("لا توجد حجوزات لتصديرها.");
            return;
        }

        // Sort desc by createdAt
        resList.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));

        const excelData = resList.map((res, index) => {
            const price = parseFloat(res.totalPrice) || 0;
            const paid = parseFloat(res.paidAmount) || 0;
            const rem = Math.max(0, price - paid);

            let dateStr = '-';
            if (res.createdAt || res.updatedAt) {
                const dateVal = res.createdAt || res.updatedAt;
                let dateObj = dateVal.toDate ? dateVal.toDate() : new Date(dateVal.seconds ? dateVal.seconds * 1000 : dateVal);
                if (!isNaN(dateObj.getTime())) {
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const year = dateObj.getFullYear();
                    let hours = dateObj.getHours();
                    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                    const ampm = hours >= 12 ? 'م' : 'ص';
                    hours = hours % 12 || 12;
                    dateStr = `${year}/${month}/${day} ${hours}:${minutes} ${ampm}`;
                }
            }

            return {
                "م": index + 1,
                "تاريخ الحجز": dateStr,
                "اسم العميل": res.customerName || 'بدون اسم',
                "رقم التليفون": res.customerPhone || '',
                "العنوان": res.customerAddress || '',
                "شركة / مصدر الدواء": res.branch || res.sourceLocation || '',
                "تفاصيل الطلب والأدوية": res.orderDetails || '',
                "تم التواصل بواسطة": res.contactPerson || '',
                "ملاحظة التواصل": res.contactNote || '',
                "سعر الطلب (ج.م)": price,
                "المحصل (ج.م)": paid,
                "المتبقي (ج.م)": rem,
                "حالة الحجز": res.status || 'غير مكتمل',
                "ملاحظات": res.notes || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        worksheet['!cols'] = [
            { wch: 6 },  // م
            { wch: 22 }, // تاريخ الحجز
            { wch: 22 }, // اسم العميل
            { wch: 15 }, // رقم التليفون
            { wch: 25 }, // العنوان
            { wch: 22 }, // شركة / مصدر الدواء
            { wch: 35 }, // تفاصيل الطلب والأدوية
            { wch: 20 }, // تم التواصل بواسطة
            { wch: 30 }, // ملاحظة التواصل
            { wch: 15 }, // سعر الطلب
            { wch: 14 }, // المحصل
            { wch: 14 }, // المتبقي
            { wch: 12 }, // حالة الحجز
            { wch: 25 }  // ملاحظات
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "حجوزات الأدوية");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `حجوزات_الأدوية_صيدلية_البدري_${today}.xlsx`);
    });
}

// Filter listeners
if (resSearchInput) resSearchInput.addEventListener('input', renderReservations);
if (resStatusFilter) resStatusFilter.addEventListener('change', renderReservations);

// Listen to Firestore real-time updates
function initReservationsListener() {
    onSnapshot(reservationsCol, (snapshot) => {
        allReservations = {};
        snapshot.forEach((docSnap) => {
            allReservations[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        renderReservations();
    }, (err) => {
        console.error("Error loading reservations:", err);
    });
}
initReservationsListener();

// Render reservations table & stats
function renderReservations() {
    if (!reservationsTableBody) return;

    const resList = Object.values(allReservations);

    // Sort desc by createdAt or updatedAt
    resList.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));

    // Live recalculate overall statistics
    // Note: status 'ملغي' is excluded from revenue stats
    let totalCount = 0;
    let totalCollected = 0;
    let totalRemaining = 0;
    let totalValue = 0;

    resList.forEach(res => {
        if (res.status !== 'ملغي') {
            totalCount++;
            const price = parseFloat(res.totalPrice) || 0;
            const paid = parseFloat(res.paidAmount) || 0;
            const rem = Math.max(0, price - paid);

            totalValue += price;
            totalCollected += paid;
            totalRemaining += rem;
        }
    });

    if (totalReservationsCountEl) totalReservationsCountEl.textContent = totalCount;
    if (totalCollectedAmountEl) totalCollectedAmountEl.textContent = totalCollected.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    if (totalRemainingAmountEl) totalRemainingAmountEl.textContent = totalRemaining.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    if (totalReservationsValueEl) totalReservationsValueEl.textContent = totalValue.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

    // Apply Filter & Search
    const searchVal = (resSearchInput ? resSearchInput.value : '').trim().toLowerCase();
    const statusVal = resStatusFilter ? resStatusFilter.value : '';

    const filtered = resList.filter(res => {
        const matchesSearch = !searchVal ||
            (res.customerName && res.customerName.toLowerCase().includes(searchVal)) ||
            (res.customerPhone && res.customerPhone.includes(searchVal)) ||
            (res.orderDetails && res.orderDetails.toLowerCase().includes(searchVal)) ||
            (res.branch && res.branch.toLowerCase().includes(searchVal)) ||
            (res.sourceLocation && res.sourceLocation.toLowerCase().includes(searchVal)) ||
            (res.contactPerson && res.contactPerson.toLowerCase().includes(searchVal)) ||
            (res.contactNote && res.contactNote.toLowerCase().includes(searchVal));
        const matchesStatus = !statusVal || res.status === statusVal;
        return matchesSearch && matchesStatus;
    });

    reservationsTableBody.innerHTML = '';

    if (filtered.length === 0) {
        reservationsTableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--text-gray);">لا توجد حجوزات مطابقة.</td></tr>`;
        return;
    }

    filtered.forEach((res, index) => {
        const tr = document.createElement('tr');

        const price = parseFloat(res.totalPrice) || 0;
        const paid = parseFloat(res.paidAmount) || 0;
        const rem = Math.max(0, price - paid);

        let statusClass = 'status-pending';
        if (res.status === 'مكتمل') statusClass = 'status-completed';
        else if (res.status === 'ملغي') statusClass = 'status-cancelled';

        const branchName = res.branch || res.sourceLocation || '';
        const createdDateHtml = formatReservationDate(res.createdAt || res.updatedAt);
        const branchBadgeHtml = branchName 
            ? `<button type="button" onclick="openCompanySelector('${res.id}')" title="انقر لتغيير شركة الدواء" style="background: rgba(11, 128, 122, 0.08); color: var(--primary-color); border: 1px solid rgba(11, 128, 122, 0.25); padding: 4px 8px; border-radius: 15px; font-weight:600; font-size:11px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:0.2s;" onmouseenter="this.style.background='rgba(11, 128, 122, 0.18)'" onmouseleave="this.style.background='rgba(11, 128, 122, 0.08)'"><i class="fa-solid fa-building"></i> ${escapeHTML(branchName)} <i class="fa-solid fa-pen" style="font-size:8.5px; opacity:0.6; margin-right:1px;"></i></button>`
            : `<button type="button" onclick="openCompanySelector('${res.id}')" title="إضافة شركة الدواء" style="background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; padding: 3px 8px; border-radius: 12px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:0.2s;" onmouseenter="this.style.background='#e2e8f0'" onmouseleave="this.style.background='#f8fafc'"><i class="fa-solid fa-plus" style="font-size:9.5px;"></i> إضافة شركة</button>`;

        const contactPerson = res.contactPerson || '';
        const contactNote = res.contactNote || '';

        let contactBadgeHtml = '';
        if (contactPerson || contactNote) {
            contactBadgeHtml = `
                <div style="display:flex; flex-direction:column; gap:3px; align-items:flex-start;">
                    <button type="button" onclick="openContactSelector('${res.id}')" title="انقر لتعديل بيانات التواصل والملاحظة"
                        style="background: rgba(14, 165, 233, 0.08); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.25); padding: 4px 8px; border-radius: 15px; font-weight:600; font-size:11px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:0.2s;"
                        onmouseenter="this.style.background='rgba(14, 165, 233, 0.18)'" onmouseleave="this.style.background='rgba(14, 165, 233, 0.08)'">
                        <i class="fa-solid fa-user-check" style="font-size:10px;"></i> ${escapeHTML(contactPerson || 'تم التواصل')} <i class="fa-solid fa-pen" style="font-size:8.5px; opacity:0.6; margin-right:1px;"></i>
                    </button>
                    ${contactNote ? `<div style="font-size:10.5px; color:#334155; background:#f1f5f9; border-right:2.5px solid #0284c7; padding:3px 6px; border-radius:4px; max-width:130px; word-break:break-word; line-height:1.3;" title="${escapeHTML(contactNote)}"><i class="fa-regular fa-comment-dots" style="font-size:9.5px; color:#0284c7;"></i> ${escapeHTML(contactNote)}</div>` : ''}
                </div>
            `;
        } else {
            contactBadgeHtml = `
                <button type="button" onclick="openContactSelector('${res.id}')" title="تحديد من تواصل وملاحظة"
                    style="background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; padding: 3px 8px; border-radius: 12px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:0.2s;"
                    onmouseenter="this.style.background='#e2e8f0'" onmouseleave="this.style.background='#f8fafc'">
                    <i class="fa-solid fa-plus" style="font-size:9.5px;"></i> تم التواصل
                </button>
            `;
        }

        tr.innerHTML = `
            <td><strong>${index + 1}</strong></td>
            <td style="white-space: nowrap; font-size:11.5px;">${createdDateHtml}</td>
            <td>
                <div style="font-weight:700; font-size:12px;">${escapeHTML(res.customerName || 'بدون اسم')}</div>
                <div style="font-size:11px; color:var(--text-gray); font-family:monospace;" dir="ltr">${escapeHTML(res.customerPhone || '')}</div>
            </td>
            <td style="max-width: 110px; font-size:11.5px;">${branchBadgeHtml}</td>
            <td style="max-width: 140px; white-space: pre-wrap; word-break: break-word; font-size:11.5px;">${escapeHTML(res.orderDetails || '-')}</td>
            <td style="max-width: 140px; font-size:11.5px;">${contactBadgeHtml}</td>
            <td style="color:#16a34a; white-space: nowrap; font-size:12px;"><strong>${paid.toFixed(2)}</strong> <span style="font-size:10px;">ج.م</span></td>
            <td>
                <select style="padding: 3px 4px; border-radius: 6px; border: 1px solid var(--border-color); font-family: inherit; font-size: 11.5px; font-weight: bold; width: 100%; max-width: 88px;"
                        onchange="updateReservationStatus('${res.id}', this.value)" class="${statusClass}">
                    <option value="غير مكتمل" ${res.status === 'غير مكتمل' ? 'selected' : ''}>غير مكتمل</option>
                    <option value="مكتمل" ${res.status === 'مكتمل' ? 'selected' : ''}>مكتمل</option>
                    <option value="ملغي" ${res.status === 'ملغي' ? 'selected' : ''}>ملغي</option>
                </select>
            </td>
            <td style="white-space: nowrap; font-size:12px;"><strong>${price.toFixed(2)}</strong> <span style="font-size:10px;">ج.م</span></td>
            <td style="max-width: 110px; font-size:11.5px; word-break: break-word;">${escapeHTML(res.customerAddress || '-')}</td>
            <td style="white-space: nowrap;">
                <span class="remaining-tag ${rem > 0 ? 'remaining-has-balance' : 'remaining-zero'}">
                    ${rem.toFixed(2)} ج.م
                </span>
            </td>
            <td>
                <div style="display:flex; gap:4px; align-items:center; white-space:nowrap;">
                    <button class="btn-whatsapp" onclick="openWaModal('${res.id}')" title="مشاركة عبر واتساب">
                        <i class="fa-brands fa-whatsapp"></i> واتساب
                    </button>
                    <button class="action-btn edit-btn" onclick="editReservation('${res.id}')" title="تعديل الحجز">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteReservation('${res.id}')" title="حذف الحجز">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        reservationsTableBody.appendChild(tr);
    });
}

// Auto sync paid amount when status select changes in modal form
if (resStatusInput) {
    resStatusInput.addEventListener('change', () => {
        if (resStatusInput.value === 'مكتمل' && resTotalPriceInput && resPaidAmountInput) {
            resPaidAmountInput.value = resTotalPriceInput.value;
            updateRemaining();
        }
    });
}

// Form Submit: Add or Edit Reservation
if (reservationFormEl) {
    reservationFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = resIdInput ? resIdInput.value.trim() : '';
        const name = resCustomerNameInput ? resCustomerNameInput.value.trim() : '';
        const phone = resCustomerPhoneInput ? resCustomerPhoneInput.value.trim() : '';
        const address = resCustomerAddressInput ? resCustomerAddressInput.value.trim() : '';
        const branch = resBranchInput ? resBranchInput.value.trim() : '';
        const details = resOrderDetailsInput ? resOrderDetailsInput.value.trim() : '';
        const totalPrice = parseFloat(resTotalPriceInput ? resTotalPriceInput.value : 0) || 0;
        let paidAmount = parseFloat(resPaidAmountInput ? resPaidAmountInput.value : 0) || 0;
        const status = resStatusInput ? resStatusInput.value : 'غير مكتمل';
        const notes = resNotesInput ? resNotesInput.value.trim() : '';
        const contactPerson = resContactPersonInput ? resContactPersonInput.value.trim() : '';
        const contactNote = resContactNoteInput ? resContactNoteInput.value.trim() : '';

        if (status === 'مكتمل' && paidAmount < totalPrice) {
            paidAmount = totalPrice;
        }

        const remainingAmount = Math.max(0, totalPrice - paidAmount);

        const data = {
            customerName: name,
            customerPhone: phone,
            customerAddress: address,
            branch: branch,
            sourceLocation: branch,
            orderDetails: details,
            totalPrice: totalPrice,
            paidAmount: paidAmount,
            remainingAmount: remainingAmount,
            status: status,
            notes: notes,
            contactPerson: contactPerson,
            contactNote: contactNote,
            updatedAt: new Date().toISOString()
        };

        const saveBtn = document.getElementById('saveReservationBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            if (id) {
                const existingRes = allReservations[id];
                data.createdAt = (existingRes && existingRes.createdAt) ? existingRes.createdAt : new Date().toISOString();
                await updateDoc(doc(db, 'reservations', id), data);
            } else {
                data.createdAt = new Date().toISOString();
                await addDoc(reservationsCol, data);
            }
            if (reservationModalEl) reservationModalEl.classList.remove('active');
            reservationFormEl.reset();
        } catch (error) {
            console.error("Error saving reservation:", error);
            alert("حدث خطأ أثناء حفظ الحجز. يرجى المحاولة مرة أخرى.");
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    });
}

// Edit Reservation Window Function
window.editReservation = function (id) {
    const res = allReservations[id];
    if (!res) return;

    if (resIdInput) resIdInput.value = id;
    if (resCustomerNameInput) resCustomerNameInput.value = res.customerName || '';
    if (resCustomerPhoneInput) resCustomerPhoneInput.value = res.customerPhone || '';
    if (resCustomerAddressInput) resCustomerAddressInput.value = res.customerAddress || '';
    if (resBranchInput) resBranchInput.value = res.branch || res.sourceLocation || '';
    if (resOrderDetailsInput) resOrderDetailsInput.value = res.orderDetails || '';
    if (resTotalPriceInput) resTotalPriceInput.value = res.totalPrice || '';
    if (resPaidAmountInput) resPaidAmountInput.value = res.paidAmount || 0;
    if (resStatusInput) resStatusInput.value = res.status || 'غير مكتمل';
    if (resNotesInput) resNotesInput.value = res.notes || '';
    if (resContactPersonInput) resContactPersonInput.value = res.contactPerson || '';
    if (resContactNoteInput) resContactNoteInput.value = res.contactNote || '';

    updateRemaining();

    const modalTitle = document.getElementById('resModalTitle');
    if (modalTitle) modalTitle.textContent = 'تعديل حجز الدواء';

    if (reservationModalEl) reservationModalEl.classList.add('active');
};

// Update status directly from table dropdown
window.updateReservationStatus = async function (id, newStatus) {
    const res = allReservations[id];
    const updateData = {
        status: newStatus,
        updatedAt: new Date().toISOString()
    };

    if (res) {
        const price = parseFloat(res.totalPrice) || 0;
        if (newStatus === 'مكتمل') {
            updateData.paidAmount = price;
            updateData.remainingAmount = 0;
        }
    }

    try {
        await updateDoc(doc(db, 'reservations', id), updateData);
    } catch (err) {
        console.error("Error updating status:", err);
        alert("تعذر تحديث الحالة.");
    }
};

// Delete Reservation
window.deleteReservation = async function (id) {
    if (confirm("هل أنت متأكد من حذف هذا الحجز نهائياً؟")) {
        try {
            await deleteDoc(doc(db, 'reservations', id));
        } catch (err) {
            console.error("Error deleting reservation:", err);
            alert("تعذر حذف الحجز.");
        }
    }
};

// WhatsApp Modal & Pre-filled editable message
window.openWaModal = function (id) {
    const res = allReservations[id];
    if (!res) return;

    currentWaReservationId = id;
    if (waCustomerNameDisplay) waCustomerNameDisplay.textContent = res.customerName || 'عميل صيدلية البدري';
    if (waCustomerPhoneDisplay) waCustomerPhoneDisplay.textContent = res.customerPhone || '-';

    const price = parseFloat(res.totalPrice) || 0;
    const paid = parseFloat(res.paidAmount) || 0;
    const rem = Math.max(0, price - paid);

    const flower = '\u{1F338}';
    const hospital = '\u{1F3E5}';
    const clipboard = '\u{1F4CB}';
    const pin = '\u{1F4CD}';
    const money = '\u{1F4B0}';
    const dollar = '\u{1F4B5}';
    const pushpin = '\u{1F4CE}';
    const heart = '\u{2764}\u{FE0F}';

    // Draft message template (exact original layout & emojis - internal supplier company is NOT included)
    const templateMsg = `أهلاً بك أستاذ/ة ${res.customerName || ''} ${flower}
من صيدلية البدري ${hospital}

تفاصيل حجز الدواء الخاص بكم:
${clipboard} الطلب: ${res.orderDetails || ''}
${pin} العنوان: ${res.customerAddress || ''}
${money} إجمالي المبلغ: ${price.toFixed(2)} ج.م
${dollar} المبلغ المدفوع: ${paid.toFixed(2)} ج.م
${pushpin} المبلغ المتبقي: ${rem.toFixed(2)} ج.م

شكراً لثقتكم بصيدلية البدري ${heart}
لأي استفسار تواصل معنا عبر هذا الرقم.`;

    if (waMessageText) waMessageText.value = templateMsg;
    if (whatsappModalEl) whatsappModalEl.classList.add('active');
};

if (closeWhatsappModalBtn) {
    closeWhatsappModalBtn.addEventListener('click', () => {
        if (whatsappModalEl) whatsappModalEl.classList.remove('active');
    });
}

if (cancelWaBtn) {
    cancelWaBtn.addEventListener('click', () => {
        if (whatsappModalEl) whatsappModalEl.classList.remove('active');
    });
}

// Send message to WhatsApp via api.whatsapp.com link (prevents double-encoding)
if (sendWaBtn) {
    sendWaBtn.addEventListener('click', () => {
        const res = allReservations[currentWaReservationId];
        let phone = res ? res.customerPhone : '';
        if (waCustomerPhoneDisplay && !phone) phone = waCustomerPhoneDisplay.textContent;

        if (!phone) {
            alert("رقم الهاتف غير متاح.");
            return;
        }

        // Normalize Egypt Phone number format (e.g. 010... -> 2010...)
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('01')) {
            cleaned = '2' + cleaned;
        } else if (cleaned.startsWith('1')) {
            cleaned = '20' + cleaned;
        }

        const editedMessage = waMessageText ? waMessageText.value : '';
        const encoded = encodeURIComponent(editedMessage);
        
        // Direct WhatsApp API URL (bypasses wa.me double-encoding redirect)
        const waUrl = `https://api.whatsapp.com/send?phone=${cleaned}&text=${encoded}`;

        window.open(waUrl, '_blank');

        if (whatsappModalEl) whatsappModalEl.classList.remove('active');
    });
}

/* =========================================================
   Quick Company Selector & Option Management for Reservations
   ========================================================= */

const DEFAULT_COMPANY_OPTIONS = [
    "الشركة المتحدة للدواء",
    "ابن سينا فارما",
    "فارما أوفرسيز",
    "مالتي فارما",
    "طيبة"
];

function getCompanyOptions() {
    try {
        const saved = localStorage.getItem('pharmacy_company_options');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.error("Error reading company options:", e);
    }
    return [...DEFAULT_COMPANY_OPTIONS];
}

function saveCompanyOptions(optionsList) {
    try {
        localStorage.setItem('pharmacy_company_options', JSON.stringify(optionsList));
    } catch (e) {
        console.error("Error saving company options:", e);
    }
    syncBranchesDatalist(optionsList);
}

function syncBranchesDatalist(optionsList) {
    const datalist = document.getElementById('branchesList');
    if (!datalist) return;
    const options = optionsList || getCompanyOptions();
    datalist.innerHTML = options.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
}

// Initial sync of full edit form datalist
syncBranchesDatalist();

// Company Modal DOM Elements
const companyModalEl = document.getElementById('companySelectModal');
const closeCompanyModalBtn = document.getElementById('closeCompanyModal');
const cancelCompanyModalBtn = document.getElementById('cancelCompanyModalBtn');
const companySelectResIdInput = document.getElementById('companySelectResId');
const companyPresetOptionsContainer = document.getElementById('companyPresetOptions');
const customCompanyInput = document.getElementById('customCompanyInput');
const applyCustomCompanyBtn = document.getElementById('applyCustomCompanyBtn');
const saveCustomCompanyCheckbox = document.getElementById('saveCustomCompanyCheckbox');
const clearCompanyBtn = document.getElementById('clearCompanyBtn');

let currentCompanyResId = null;

// Open Company Selector Modal
window.openCompanySelector = function (resId) {
    const res = allReservations[resId];
    if (!res) return;

    currentCompanyResId = resId;
    if (companySelectResIdInput) companySelectResIdInput.value = resId;

    const currentCompany = res.branch || res.sourceLocation || '';
    if (customCompanyInput) customCompanyInput.value = currentCompany;
    if (saveCustomCompanyCheckbox) saveCustomCompanyCheckbox.checked = false;

    renderCompanyPresetChips(currentCompany);

    if (companyModalEl) companyModalEl.classList.add('active');
};

// Close modal helpers
function closeCompanyModal() {
    if (companyModalEl) companyModalEl.classList.remove('active');
    currentCompanyResId = null;
}

if (closeCompanyModalBtn) closeCompanyModalBtn.addEventListener('click', closeCompanyModal);
if (cancelCompanyModalBtn) cancelCompanyModalBtn.addEventListener('click', closeCompanyModal);

// Render Chips in Selector Modal
function renderCompanyPresetChips(selectedCompany) {
    if (!companyPresetOptionsContainer) return;

    const options = getCompanyOptions();
    companyPresetOptionsContainer.innerHTML = '';

    if (options.length === 0) {
        companyPresetOptionsContainer.innerHTML = `<span style="font-size:12px; color:var(--text-gray);">لا توجد شركات مسجلة بالقائمة. أضف شركة من الحقل أدناه.</span>`;
        return;
    }

    options.forEach(opt => {
        const isSelected = opt === selectedCompany;
        const chip = document.createElement('div');
        chip.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${isSelected ? 'var(--primary-color)' : 'rgba(11, 128, 122, 0.08)'};
            color: ${isSelected ? '#ffffff' : 'var(--primary-color)'};
            border: 1px solid ${isSelected ? 'var(--primary-color)' : 'rgba(11, 128, 122, 0.25)'};
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        chip.innerHTML = `
            <span class="chip-title" style="flex:1;">${escapeHTML(opt)}</span>
            <button type="button" title="حذف هذه الشركة من القائمة" style="background:none; border:none; color:${isSelected ? 'rgba(255,255,255,0.8)' : '#94a3b8'}; cursor:pointer; padding:0 2px; font-size:12px; line-height:1; display:flex; align-items:center;"
                onclick="event.stopPropagation(); window.removePresetCompany('${escapeHTML(opt).replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        // Click chip to select company for reservation
        chip.addEventListener('click', () => {
            selectCompanyForReservation(currentCompanyResId, opt);
        });

        companyPresetOptionsContainer.appendChild(chip);
    });
}

// Remove company option from preset choices list permanently
window.removePresetCompany = function (optToRemove) {
    let options = getCompanyOptions();
    options = options.filter(opt => opt !== optToRemove);
    saveCompanyOptions(options);
    const currentRes = allReservations[currentCompanyResId];
    const currentCompany = currentRes ? (currentRes.branch || currentRes.sourceLocation || '') : '';
    renderCompanyPresetChips(currentCompany);
};

// Select company and save to Firestore
async function selectCompanyForReservation(resId, companyName) {
    if (!resId) return;

    try {
        await updateDoc(doc(db, 'reservations', resId), {
            branch: companyName,
            sourceLocation: companyName,
            updatedAt: new Date().toISOString()
        });
        closeCompanyModal();
    } catch (err) {
        console.error("Error updating reservation company:", err);
        alert("حدث خطأ أثناء تحديث اسم الشركة.");
    }
}

// Apply Custom / Other Company Name
if (applyCustomCompanyBtn) {
    applyCustomCompanyBtn.addEventListener('click', async () => {
        const val = customCompanyInput ? customCompanyInput.value.trim() : '';

        if (saveCustomCompanyCheckbox && saveCustomCompanyCheckbox.checked && val) {
            let options = getCompanyOptions();
            if (!options.includes(val)) {
                options.push(val);
                saveCompanyOptions(options);
            }
        }

        await selectCompanyForReservation(currentCompanyResId, val);
    });
}

// Clear / Erase company for current reservation
if (clearCompanyBtn) {
    clearCompanyBtn.addEventListener('click', async () => {
        await selectCompanyForReservation(currentCompanyResId, '');
    });
}

/* =========================================================
   Quick Contact Person & Note Selector for Reservations
   ========================================================= */

const DEFAULT_CONTACT_PERSON_OPTIONS = [
    "د. أحمد",
    "د. محمد",
    "د. محمود",
    "صيدلي نوبتي",
    "خدمة العملاء"
];

function getContactPersonOptions() {
    try {
        const saved = localStorage.getItem('pharmacy_contact_person_options');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.error("Error reading contact person options:", e);
    }
    return [...DEFAULT_CONTACT_PERSON_OPTIONS];
}

function saveContactPersonOptions(optionsList) {
    try {
        localStorage.setItem('pharmacy_contact_person_options', JSON.stringify(optionsList));
    } catch (e) {
        console.error("Error saving contact person options:", e);
    }
    syncContactPersonsDatalist(optionsList);
}

function syncContactPersonsDatalist(optionsList) {
    const datalist = document.getElementById('contactPersonsList');
    if (!datalist) return;
    const options = optionsList || getContactPersonOptions();
    datalist.innerHTML = options.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
}

// Initial sync of full edit form datalist
syncContactPersonsDatalist();

// Contact Modal DOM Elements
const contactModalEl = document.getElementById('contactSelectModal');
const closeContactModalBtn = document.getElementById('closeContactModal');
const cancelContactModalBtn = document.getElementById('cancelContactModalBtn');
const saveContactModalBtn = document.getElementById('saveContactModalBtn');
const clearContactBtn = document.getElementById('clearContactBtn');
const contactSelectResIdInput = document.getElementById('contactSelectResId');
const contactPresetOptionsContainer = document.getElementById('contactPresetOptions');
const customContactPersonInput = document.getElementById('customContactPersonInput');
const saveCustomContactCheckbox = document.getElementById('saveCustomContactCheckbox');
const contactNoteInput = document.getElementById('contactNoteInput');

let currentContactResId = null;

// Open Contact Selector Modal
window.openContactSelector = function (resId) {
    const res = allReservations[resId];
    if (!res) return;

    currentContactResId = resId;
    if (contactSelectResIdInput) contactSelectResIdInput.value = resId;

    const currentPerson = res.contactPerson || '';
    const currentNote = res.contactNote || '';

    if (customContactPersonInput) customContactPersonInput.value = currentPerson;
    if (contactNoteInput) contactNoteInput.value = currentNote;
    if (saveCustomContactCheckbox) saveCustomContactCheckbox.checked = false;

    renderContactPresetChips(currentPerson);

    if (contactModalEl) contactModalEl.classList.add('active');
};

// Close contact modal
function closeContactModal() {
    if (contactModalEl) contactModalEl.classList.remove('active');
    currentContactResId = null;
}

if (closeContactModalBtn) closeContactModalBtn.addEventListener('click', closeContactModal);
if (cancelContactModalBtn) cancelContactModalBtn.addEventListener('click', closeContactModal);

// Render Chips in Contact Selector Modal
function renderContactPresetChips(selectedPerson) {
    if (!contactPresetOptionsContainer) return;

    const options = getContactPersonOptions();
    contactPresetOptionsContainer.innerHTML = '';

    if (options.length === 0) {
        contactPresetOptionsContainer.innerHTML = `<span style="font-size:12px; color:var(--text-gray);">لا يوجد مسؤولو تواصل مسجلون بالقائمة. أضف اسماً من الحقل أدناه.</span>`;
        return;
    }

    options.forEach(opt => {
        const isSelected = opt === selectedPerson;
        const chip = document.createElement('div');
        chip.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${isSelected ? '#0284c7' : 'rgba(14, 165, 233, 0.08)'};
            color: ${isSelected ? '#ffffff' : '#0284c7'};
            border: 1px solid ${isSelected ? '#0284c7' : 'rgba(14, 165, 233, 0.25)'};
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        chip.innerHTML = `
            <span class="chip-title" style="flex:1;"><i class="fa-solid fa-user" style="font-size:10px; margin-left:2px;"></i> ${escapeHTML(opt)}</span>
            <button type="button" title="حذف هذا الاسم من القائمة" style="background:none; border:none; color:${isSelected ? 'rgba(255,255,255,0.8)' : '#94a3b8'}; cursor:pointer; padding:0 2px; font-size:12px; line-height:1; display:flex; align-items:center;"
                onclick="event.stopPropagation(); window.removePresetContactPerson('${escapeHTML(opt).replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        // Click chip to pick person name into input
        chip.addEventListener('click', () => {
            if (customContactPersonInput) customContactPersonInput.value = opt;
            renderContactPresetChips(opt);
        });

        contactPresetOptionsContainer.appendChild(chip);
    });
}

// Remove contact person option from preset choices list permanently
window.removePresetContactPerson = function (optToRemove) {
    let options = getContactPersonOptions();
    options = options.filter(opt => opt !== optToRemove);
    saveContactPersonOptions(options);
    const currentPerson = customContactPersonInput ? customContactPersonInput.value : '';
    renderContactPresetChips(currentPerson);
};

// Save Contact Info & Note to Firestore
if (saveContactModalBtn) {
    saveContactModalBtn.addEventListener('click', async () => {
        if (!currentContactResId) return;

        const personVal = customContactPersonInput ? customContactPersonInput.value.trim() : '';
        const noteVal = contactNoteInput ? contactNoteInput.value.trim() : '';

        if (saveCustomContactCheckbox && saveCustomContactCheckbox.checked && personVal) {
            let options = getContactPersonOptions();
            if (!options.includes(personVal)) {
                options.push(personVal);
                saveContactPersonOptions(options);
            }
        }

        try {
            await updateDoc(doc(db, 'reservations', currentContactResId), {
                contactPerson: personVal,
                contactNote: noteVal,
                updatedAt: new Date().toISOString()
            });
            closeContactModal();
        } catch (err) {
            console.error("Error updating contact info:", err);
            alert("حدث خطأ أثناء حفظ بيانات التواصل.");
        }
    });
}

// Clear / Erase contact info for current reservation
if (clearContactBtn) {
    clearContactBtn.addEventListener('click', async () => {
        if (!currentContactResId) return;

        try {
            await updateDoc(doc(db, 'reservations', currentContactResId), {
                contactPerson: '',
                contactNote: '',
                updatedAt: new Date().toISOString()
            });
            closeContactModal();
        } catch (err) {
            console.error("Error clearing contact info:", err);
            alert("حدث خطأ أثناء مسح البيانات.");
        }
    });
}


