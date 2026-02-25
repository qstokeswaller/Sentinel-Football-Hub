/**
 * Sidebar Toggle Logic & Persistence
 * Handles minimizing/maximizing the sidebar and saving the preference in localStorage.
 */

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggleSidebar');

    // Create and append overlay if it doesn't exist
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    if (!sidebar || !mainContent) return;

    // 1. Initial State Check (Desktop only)
    if (window.innerWidth > 768) {
        const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('sidebar-collapsed');
        }
    }

    // 2. Desktop Toggle Handler
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth > 768) {
                const nowCollapsed = sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('sidebar-collapsed', nowCollapsed);

                // Persist
                localStorage.setItem('sidebar-collapsed', nowCollapsed);
            }
        });
    }

    // 3. Mobile Toggle Handler (Delegation to handle dynamically added buttons)
    document.addEventListener('click', (e) => {
        const mobileToggle = e.target.closest('#mobileMenuToggle');
        if (mobileToggle) {
            const isActive = sidebar.classList.contains('mobile-active');
            if (isActive) {
                sidebar.classList.remove('mobile-active');
                overlay.classList.remove('active');
            } else {
                sidebar.classList.add('mobile-active');
                overlay.classList.add('active');
            }
        }

        // Close when clicking overlay
        if (e.target.classList.contains('sidebar-overlay')) {
            sidebar.classList.remove('mobile-active');
            overlay.classList.remove('active');
        }

        // Close when clicking a link on mobile or clicking the minimize button
        if (window.innerWidth <= 768) {
            if (e.target.closest('.sidebar-nav a') || e.target.closest('#toggleSidebar')) {
                sidebar.classList.remove('mobile-active');
                overlay.classList.remove('active');
            }
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('mobile-active');
            overlay.classList.remove('active');
        }
    });
});

