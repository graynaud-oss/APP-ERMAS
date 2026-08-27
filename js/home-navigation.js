const installHeaderNavigation = () => {
    const headerInner = document.querySelector('.app-header__inner');
    const pageHeader = document.querySelector('.app-page-header');
    if (!headerInner || !pageHeader || headerInner.querySelector('[data-header-navigation]')) return;

    const pageActions = pageHeader.querySelector(':scope > .app-page-actions');
    const directBackButton = Array.from(pageHeader.children)
        .find((child) => child.classList.contains('app-back-button'));
    const backButton = directBackButton
        || pageActions?.querySelector('.app-back-button:not([data-home-link])');
    const existingHomeLink = pageActions?.querySelector('[data-home-link], a[href="index.html"], button[onclick*="index.html"]');
    const logoutButton = headerInner.querySelector('[data-global-logout]');
    const actions = document.createElement('div');

    actions.className = 'app-page-actions';
    actions.classList.add('app-header-actions');
    actions.dataset.headerNavigation = 'true';

    if (backButton) actions.append(backButton);

    if (existingHomeLink) {
        existingHomeLink.dataset.homeLink = 'true';
        actions.append(existingHomeLink);
    } else {
        const link = document.createElement('a');
        link.href = 'index.html';
        link.textContent = 'Accueil';
        link.dataset.homeLink = 'true';
        link.className = 'app-back-button';
        actions.append(link);
    }

    if (logoutButton) logoutButton.remove();
    headerInner.append(actions);

    if (pageActions && !pageActions.children.length) pageActions.remove();
};

installHeaderNavigation();
