// Sidebar Toggle Handler
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const dashboardContainer = document.getElementById('dashboardContainer');

if (localStorage.getItem('sidebarCollapsed') === 'true' && dashboardContainer) {
    dashboardContainer.classList.add('sidebar-collapsed');
}

if (sidebarToggleBtn && dashboardContainer) {
    sidebarToggleBtn.addEventListener('click', () => {
        dashboardContainer.classList.toggle('sidebar-collapsed');
        const isCollapsed = dashboardContainer.classList.contains('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    });
}

// Simple UI Navigation Script
const links = document.querySelectorAll('.sidebar-menu a[data-target]');
const sections = document.querySelectorAll('.dashboard-section');
const topBarTitle = document.getElementById('topBarTitle');

links.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const target = link.getAttribute('data-target');
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(target).classList.add('active');

        topBarTitle.textContent = link.textContent.trim();

        if (window.innerWidth <= 992) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

// Modal Handlers
const modal = document.getElementById('productModal');
const openBtn = document.getElementById('openAddProductModal');
const closeBtn = document.querySelector('.close-modal');

openBtn.addEventListener('click', () => {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('modalTitle').textContent = 'إضافة منتج جديد';
    modal.classList.add('active');
});

closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
});

document.getElementById('closeOrderModal').addEventListener('click', () => {
    document.getElementById('orderDetailsModal').classList.remove('active');
});