// Paints the cached distributor branding (colours, name) before Angular starts,
// so a distributor's app never flashes the built-in red theme. The CSS is the one
// applyTenantTheme() saved (libs/shared/interfaces panel-tenant-theme.util.ts).
// With "Omitir" only the profiles screen takes the owner's colours (panel_owner_pf_css).
(function () {
    try {
        if (localStorage.getItem('panel_dist_choice') !== 'code') {
            // Omitir: solo la pantalla de perfiles con los colores del dueño (applyOwnerProfilesTheme)
            const own = localStorage.getItem('panel_owner_pf_css');
            if (own) {
                const st = document.createElement('style');
                st.id = 'panel-owner-profiles';
                st.textContent = own;
                document.head.appendChild(st);
            }
            return;
        }
        const css = localStorage.getItem('panel_dist_theme_css');
        if (css) {
            const style = document.createElement('style');
            style.id = 'panel-tenant-theme';
            style.textContent = css;
            document.head.appendChild(style);
        }
        const cache = JSON.parse(localStorage.getItem('panel_dist_cache') || 'null');
        const name = cache && typeof cache.name === 'string' ? cache.name : '';
        if (!name) return;
        document.title = name;
        document.addEventListener('DOMContentLoaded', function () {
            const splash = document.getElementById('initial-splash');
            const mark = splash && splash.querySelector('.splash-mark');
            if (mark) mark.textContent = name;
            if (splash) splash.setAttribute('aria-label', 'Cargando ' + name);
        });
    } catch (e) {
        // storage unavailable: built-in look
    }
})();
