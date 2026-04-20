document.addEventListener('DOMContentLoaded', function() {
    // Load header
    const loadInclude = async (src) => {
        // Try absolute path first, then relative
        const tries = [('/' + src).replace(/\\/g, '/'), src];
        for (const path of tries) {
            try {
                const res = await fetch(path);
                if (!res.ok) continue;
                const data = await res.text();
                const el = document.querySelector(`include[src="${src}"]`);
                if (el) el.outerHTML = data;
                return true;
            } catch (err) {
                // continue to next try
            }
        }
        console.error(`Failed to load include: ${src} (tried absolute and relative paths)`);
        return false;
    };

    loadInclude('header.html');

    // Load footer
    loadInclude('footer.html');
});
