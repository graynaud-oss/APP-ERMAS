export function setPasswordVisibility(input, button, visible) {
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'MASQUER' : 'AFFICHER';
    button.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    button.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export function bindPasswordVisibility(input, button) {
    setPasswordVisibility(input, button, false);
    button.addEventListener('click', () => {
        setPasswordVisibility(input, button, input.type === 'password');
    });
}

export function passwordsMatch(password, confirmation) {
    return password === confirmation;
}
