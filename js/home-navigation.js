const addHomeLink = () => {
    const header = document.querySelector('.app-page-header');
    if (!header || header.querySelector('[data-home-link]')) return;
    const link = document.createElement('a');
    link.href = 'index.html';
    link.textContent = 'Accueil';
    link.dataset.homeLink = 'true';
    link.className = 'app-back-button';
    const actions = header.querySelector('.app-page-actions') || header;
    actions.append(link);
};
addHomeLink();
