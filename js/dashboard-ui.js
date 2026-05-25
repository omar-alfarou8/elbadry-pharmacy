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