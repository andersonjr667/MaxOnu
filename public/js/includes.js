document.addEventListener('DOMContentLoaded', function() {
    // Load header
    fetch('header.html')
        .then(response => response.text())
        .then(data => {
            const headerInclude = document.querySelector('include[src="header.html"]');
            if (headerInclude) {
                headerInclude.outerHTML = data;
            }
        })
        .catch(error => console.error('Error loading header:', error));

    // Load footer
    fetch('footer.html')
        .then(response => response.text())
        .then(data => {
            const footerInclude = document.querySelector('include[src="footer.html"]');
            if (footerInclude) {
                footerInclude.outerHTML = data;
            }
        })
        .catch(error => console.error('Error loading footer:', error));
});
