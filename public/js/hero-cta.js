// Hero CTA functionality for MaxOnu 2026
(function() {
    'use strict';
    
    function initHeroCta() {
        const heroCtaGroup = document.getElementById('heroCtaGroup');
        if (!heroCtaGroup) return;
        
        const token = localStorage.getItem('token');
        const isLoggedIn = token && token !== 'null' && token !== 'undefined' && token.trim() !== '';
        
        if (!isLoggedIn) {
            heroCtaGroup.hidden = false;
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeroCta);
    } else {
        initHeroCta();
    }
})();
