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
        const defaults = [
            { name: 'أدوية', type: 'icon', icon: 'fa-solid fa-pills', image: '' },
            { name: 'مستحضرات تجميل', type: 'icon', icon: 'fa-solid fa-wand-magic-sparkles', image: '' },
            { name: 'إكسسوارات طبية', type: 'icon', icon: 'fa-solid fa-heart-pulse', image: '' }
        ];
        for (let cat of defaults) {
            await addDoc(categoriesCol, { ...cat, createdAt: new Date() });
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

        // Visual indicator for category icon/image
        let visualHtml = '';
        if (cat.type === 'icon') {
            visualHtml = `<span style="margin-left: 10px; font-size: 18px; color: var(--primary-color);"><i class="${cat.icon || 'fa-solid fa-tags'}"></i></span>`;
        } else if (cat.type === 'image') {
            visualHtml = `<img src="${cat.image || 'https://via.placeholder.com/150'}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: cover; margin-left: 10px; border: 1px solid var(--border-color);">`;
        } else {
            visualHtml = `<span style="margin-left: 10px; font-size: 18px; color: var(--text-gray);"><i class="fa-solid fa-tags"></i></span>`;
        }

        // Modal List
        const li = document.createElement('li');
        li.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.02); margin-bottom: 8px; border-radius: 8px; border: 1px solid var(--border-color);";
        li.innerHTML = `
            <div style="display: flex; align-items: center;">
                ${visualHtml}
                <span style="font-weight: bold;">${cat.name}</span>
            </div>
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
            addCategoryBtn.innerHTML = 'جاري الإضافة... <i class="fa-solid fa-spinner fa-spin"></i>';
            addCategoryBtn.disabled = true;
            
            const type = document.getElementById('newCategoryType').value;
            let icon = '';
            let image = '';
            
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
                
                await addDoc(categoriesCol, { 
                    name: val, 
                    type: type,
                    icon: icon,
                    image: image,
                    createdAt: new Date() 
                });
                
                // Reset fields
                newCategoryName.value = '';
                document.getElementById('categoryImage').value = '';
                const fileInput = document.getElementById('categoryImageFile');
                if (fileInput) fileInput.value = '';
            } catch (err) {
                console.error("Error adding category:", err);
                alert("حدث خطأ أثناء إضافة القسم.");
            } finally {
                addCategoryBtn.textContent = 'إضافة القسم الجديد';
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
            productsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل المنتجات...</td></tr>`;
            
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
            filteredProducts = filteredProducts.filter(p => p.category === selectedCategory);
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
            filteredProducts = filteredProducts.filter(p => 
                p.name && normalizeArabic(p.name).includes(normalizedSearch)
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

if (slideForm) {
    slideForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveSlideBtn.innerHTML = 'جاري الحفظ... <span class="spinner"></span>';
        saveSlideBtn.disabled = true;

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
                image,
                createdAt: new Date()
            };

            await addDoc(slidesCol, slideData);

            // Reset form
            slideForm.reset();
            selectedSlideImageFile = null;
            if (slideImageFile) slideImageFile.value = '';
            slideImagePreviewContainer.style.display = 'none';

        } catch (error) {
            console.error("Error saving slide: ", error);
            alert('حدث خطأ أثناء إضافة الشريحة.');
        } finally {
            saveSlideBtn.innerHTML = 'إضافة الشريحة الإعلانية';
            saveSlideBtn.disabled = false;
        }
    });
}

// Real-time listener for slides
if (slidesTableBody) {
    onSnapshot(query(slidesCol, orderBy('createdAt', 'desc')), (snapshot) => {
        slidesTableBody.innerHTML = '';
        if (snapshot.empty) {
            slidesTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">لا توجد إعلانات نشطة حالياً.</td></tr>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const slide = docSnap.data();
            const id = docSnap.id;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${slide.image}" width="100" height="50" style="border-radius:6px; object-fit:cover; border: 1px solid var(--border-color);"></td>
                <td><strong>${slide.title || 'بدون عنوان'}</strong></td>
                <td>${slide.description || 'بدون وصف'}</td>
                <td><a href="${slide.link}" target="_blank" style="color: var(--primary-color); word-break: break-all;">${slide.link}</a></td>
                <td>
                    <button class="action-btn delete-btn" onclick="deleteSlide('${id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            slidesTableBody.appendChild(tr);
        });
    });
}

window.deleteSlide = async function(id) {
    if (confirm('هل أنت متأكد من حذف هذا الإعلان نهائياً؟')) {
        try {
            await deleteDoc(doc(db, 'slides', id));
        } catch (error) {
            console.error("Error deleting slide:", error);
            alert("حدث خطأ أثناء حذف الإعلان.");
        }
    }
};
