/**
 * Sidebar Toggle Logic & Persistence
 * Handles minimizing/maximizing the sidebar and saving the preference in localStorage.
 */

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('toggleSidebar');

    if (!sidebar || !mainContent) return;

    // 1. Initial State Check
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-collapsed');
    }

    // 2. Toggle Handler
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const nowCollapsed = sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('sidebar-collapsed', nowCollapsed);

            // Persist
            localStorage.setItem('sidebar-collapsed', nowCollapsed);
        });
    }
});
