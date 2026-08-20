const addHomeLink = () => {
    const header = document.querySelector('.app-page-header');
    if (!header || header.querySelector('[data-home-link]')) return;
    const link = document.createElement('a');
    link.href = 'index.html';
    link.textContent = 'Accueil';
    link.dataset.homeLink = 'true';
    link.className = 'app-back-button';
    let actions = header.querySelector(':scope > .app-page-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'app-page-actions';
        Array.from(header.children)
            .filter((child) => child.classList.contains('app-back-button'))
            .forEach((button) => actions.append(button));
        header.append(actions);
    }
    actions.append(link);
};
addHomeLink();
