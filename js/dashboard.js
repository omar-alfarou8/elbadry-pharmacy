import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc, limit, startAfter, where, startAt, endAt, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// Check Auth state immediately
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'admin.html';
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
        window.location.href = 'admin.html';
    });
});

// Collections
const productsCol = collection(db, 'products');
const ordersCol = collection(db, 'orders');
const categoriesCol = collection(db, 'categories');

// Local products cache
let allProducts = {};

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
const productCategory = document.getElementById('productCategory');
const newCategoryName = document.getElementById('newCategoryName');
const addCategoryBtn = document.getElementById('addCategoryBtn');

if (openCategoriesModal) {
    openCategoriesModal.addEventListener('click', () => categoriesModal.classList.add('active'));
    closeCategoriesModal.addEventListener('click', () => categoriesModal.classList.remove('active'));
}

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
    const name = document.getElementById('productName').value;
    const price = document.getElementById('productPrice').value;
    const category = document.getElementById('productCategory').value;
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

        const productData = {
            name,
            price: Number(price),
            category,
            image,
            description,
            usage,
            activeIngredients,
            warnings
        };

        if (id) {
            await updateDoc(doc(db, 'products', id), productData);
        } else {
            productData.createdAt = new Date();
            await addDoc(productsCol, productData);
        }
        document.getElementById('productModal').classList.remove('active');
        productForm.reset();

        // Refresh products list and count
        cachedProductsList = [];
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
    document.getElementById('productPrice').value = prod.price || '';
    document.getElementById('productCategory').value = prod.category || '';
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
            cachedProductsList = [];
            loadProductsPage(currentPage);
            updateTotalProductsCount();
        } catch (error) {
            console.error("Error deleting product:", error);
            alert("حدث خطأ أثناء حذف المنتج.");
        }
    }
};

window.viewOrder = function (id, name, phone, governorate, address, items, total, status, prescriptionUrl) {
    const modal = document.getElementById('orderDetailsModal');
    const content = document.getElementById('orderDetailsContent');
    const actionDiv = document.getElementById('orderActionDiv');

    let itemsHtml = ``;
    try {
        let parsedItems = JSON.parse(decodeURIComponent(items));
        itemsHtml = `<ul>`;
        parsedItems.forEach(item => {
            itemsHtml += `<li>${item.name} - الكمية: ${item.quantity} - ${item.price} ج.م</li>`;
        });
        itemsHtml += `</ul>`;
    } catch (e) {
        itemsHtml = `<div style="white-space: pre-wrap; padding: 10px; background: rgba(0,0,0,0.03); border-radius: 5px; border: 1px solid var(--border-color);">${decodeURIComponent(items)}</div>`; // Fallback for textual strings
    }

    let prescriptionHtml = '';
    if (prescriptionUrl && prescriptionUrl !== 'undefined' && prescriptionUrl !== 'null' && prescriptionUrl.length > 5) {
        prescriptionHtml = `
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid var(--border-color);">
            <p><strong>صورة الروشتة المرفقة:</strong></p>
            <a href="${prescriptionUrl}" target="_blank">
                <img src="${prescriptionUrl}" style="max-width: 100%; max-height: 250px; border-radius: 10px; margin-top: 10px; border: 1px solid var(--border-color);">
            </a>
        `;
    }

    content.innerHTML = `
        <p><strong>اسم العميل:</strong> ${name}</p>
        <p><strong>رقم الهاتف:</strong> <a href="tel:${phone}" dir="ltr">${phone}</a></p>
        <p><strong>المحافظة:</strong> <span style="color: var(--primary-color); font-weight: bold;">${governorate !== 'undefined' ? governorate : 'غير محدد'}</span></p>
        <p><strong>العنوان:</strong> ${address}</p>
        <hr style="margin: 10px 0; border: 0; border-top: 1px solid var(--border-color);">
        <p><strong>الطلب / المنتجات:</strong></p>
        ${itemsHtml}
        <p style="font-size: 18px; color: var(--primary-color);"><strong>الإجمالي:</strong> ${total} ج.م</p>
        ${prescriptionHtml}
    `;

    if (status === 'new') {
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
        const defaults = ['أدوية', 'مستحضرات تجميل', 'إكسسوارات طبية'];
        for (let cat of defaults) {
            await addDoc(categoriesCol, { name: cat, createdAt: new Date() });
        }
        return;
    }

    categoriesList.innerHTML = '';
    productCategory.innerHTML = '';

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

        // Modal List
        const li = document.createElement('li');
        li.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.02); margin-bottom: 8px; border-radius: 8px; border: 1px solid var(--border-color);";
        li.innerHTML = `
            <span style="font-weight: bold;">${cat.name}</span>
            <button onclick="deleteCategory('${id}')" style="background: var(--error-color); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
        `;
        categoriesList.appendChild(li);

        // Filter Select Options
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;
        productCategory.appendChild(option);

        if (excelCategorySelect) {
            excelCategorySelect.appendChild(option.cloneNode(true));
        }

        if (adminProductCategoryFilter) {
            adminProductCategoryFilter.appendChild(option.cloneNode(true));
        }
    });
});

if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', async () => {
        const val = newCategoryName.value.trim();
        if (val) {
            addCategoryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            addCategoryBtn.disabled = true;
            await addDoc(categoriesCol, { name: val, createdAt: new Date() });
            newCategoryName.value = '';
            addCategoryBtn.textContent = 'إضافة';
            addCategoryBtn.disabled = false;
        }
    });
}

// --- Pagination and Search Logic for Products ---

async function loadProductsPage(page = 1) {
    if (isFetchingProducts) return;

    try {
        // Update current page
        currentPage = page;
        const currentPageNum = document.getElementById('currentPageNum');
        if (currentPageNum) currentPageNum.textContent = currentPage;

        // If cache is empty, fetch all products from Firestore
        if (cachedProductsList.length === 0) {
            isFetchingProducts = true;
            productsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل المنتجات...</td></tr>`;
            
            const q = query(productsCol, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            
            cachedProductsList = [];
            querySnapshot.forEach(docSnap => {
                cachedProductsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            isFetchingProducts = false;
        }

        // Apply filters locally (Category and Case-insensitive Search)
        let filteredProducts = cachedProductsList;

        if (selectedCategory) {
            filteredProducts = filteredProducts.filter(p => p.category === selectedCategory);
        }

        if (searchQuery.trim() !== '') {
            const searchLower = searchQuery.toLowerCase().trim();
            filteredProducts = filteredProducts.filter(p => 
                p.name && p.name.toLowerCase().includes(searchLower)
            );
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
        productsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--error-color);"><i class="fa-solid fa-circle-exclamation"></i> حدث خطأ أثناء تحميل المنتجات.</td></tr>`;
        isFetchingProducts = false;
    }
}

function renderProductsList(products) {
    productsTableBody.innerHTML = '';
    allProducts = {}; // Reset local cache for editProduct functionality
    
    if (products.length === 0) {
        productsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">لا توجد منتجات مطابقة.</td></tr>`;
        return;
    }

    products.forEach((prod) => {
        const id = prod.id;
        allProducts[id] = prod; // Store product in local cache for edit modal

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${prod.image}" width="50" height="50" style="border-radius:8px; object-fit:cover;"></td>
            <td><strong>${prod.name}</strong></td>
            <td>${prod.category}</td>
            <td>${prod.price} ج.م</td>
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
        // Next button is disabled if we are at the last page
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

let searchDebounceTimeout = null;

if (adminProductSearch) {
    adminProductSearch.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            searchQuery = e.target.value;
            loadProductsPage(1);
        }, 300); // 300ms debounce
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

// Real-time listener for Orders
onSnapshot(query(ordersCol, orderBy('createdAt', 'desc')), (snapshot) => {
    recentOrdersBody.innerHTML = '';
    allOrdersBody.innerHTML = '';
    totalOrdersCount.textContent = snapshot.size;

    let count = 0;
    snapshot.forEach((docSnap) => {
        const order = docSnap.data();
        const id = docSnap.id;
        const statusBadge = order.status === 'done'
            ? `<span class="status-badge status-done">مكتمل</span>`
            : `<span class="status-badge status-new">جديد</span>`;

        const dateObj = order.createdAt ? order.createdAt.toDate() : new Date();
        const dateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let itemsToPass = order.orderDetails || "لا توجد تفاصيل";
        if (order.items && order.items.length > 0) {
            itemsToPass = JSON.stringify(order.items);
        }
        const safeItems = encodeURIComponent(itemsToPass);
        const total = order.total || 0;
        const prescriptionUrl = order.prescriptionUrl || '';

        const governorate = order.governorate || 'غير محدد';

        // Add to All orders
        const allTr = document.createElement('tr');
        allTr.innerHTML = `
            <td dir="ltr" style="font-size:14px; color:var(--text-gray)">${dateStr}</td>
            <td><strong>${order.name}</strong><div style="font-size: 12px; color: var(--primary-color)">${governorate}</div></td>
            <td dir="ltr">${order.phone}</td>
            <td><button class="btn-outline" style="padding: 5px 10px; font-size:13px;" onclick="viewOrder('${id}', '${order.name.replace(/'/g, "\\'")}', '${order.phone}', '${governorate}', '${order.address.replace(/'/g, "\\'")}', '${safeItems}', '${total}', '${order.status || 'new'}', '${prescriptionUrl}')">التفاصيل</button></td>
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
                <td><strong>${order.name}</strong></td>
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
                        category: selectedCategory,
                        image: 'logo.png', // Default image
                        createdAt: new Date()
                    };

                    await addDoc(productsCol, productData);
                    successCount++;
                }

                alert(`تم بنجاح! إضافة ${successCount} منتج إلى قسم "${selectedCategory}".`);
                cachedProductsList = [];
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
