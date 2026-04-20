document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('[data-tab-target]');
    const tabContents = document.querySelectorAll('.tab-content');

    if (!tabButtons.length || !tabContents.length) {
        return;
    }

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.tabTarget;
            const targetTab = document.getElementById(targetId);

            if (!targetTab) {
                return;
            }

            tabContents.forEach((tab) => tab.classList.remove('active'));
            tabButtons.forEach((tabButton) => tabButton.classList.remove('active'));

            targetTab.classList.add('active');
            button.classList.add('active');
        });
    });
});
