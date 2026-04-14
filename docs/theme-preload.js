// Synchronous theme preload — must be a regular <script> (not module) in <head>.
// Reads the user's theme preference from localStorage and applies data-theme
// attribute BEFORE first paint to prevent flash of wrong theme.
(function () {
    var theme = 'light';
    try { theme = localStorage.getItem('sentinel-theme') || 'light'; } catch (e) {}
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();
