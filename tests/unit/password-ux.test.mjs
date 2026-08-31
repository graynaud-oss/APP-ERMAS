import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { bindPasswordVisibility, passwordsMatch, setPasswordVisibility } from '../../js/password-visibility.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');

function createControl(value = 'secret') {
    const listeners = {};
    const attributes = {};
    const input = { type: 'password', value };
    const button = {
        textContent: '',
        addEventListener(type, listener) { listeners[type] = listener; },
        setAttribute(name, attributeValue) { attributes[name] = attributeValue; }
    };
    return { input, button, attributes, click: () => listeners.click() };
}

test('les champs mot de passe et confirmation sont masqués initialement', () => {
    assert.match(indexSource, /<input type="password" id="password" required>/);
    assert.match(indexSource, /id="password-confirmation-container" class="auth-field hidden"/);
    assert.match(indexSource, /<input type="password" id="password-confirmation" autocomplete="new-password">/);
});

test('les boutons de visibilité sont accessibles et ne soumettent pas le formulaire', () => {
    for (const id of ['password-visibility', 'password-confirmation-visibility']) {
        const pattern = new RegExp(`<button type="button" id="${id}"[^>]*aria-label="Afficher le mot de passe"[^>]*aria-pressed="false"`);
        assert.match(indexSource, pattern);
    }
});

test('afficher puis masquer change uniquement le type et les attributs accessibles', () => {
    const control = createControl();
    bindPasswordVisibility(control.input, control.button);
    assert.equal(control.input.type, 'password');
    assert.equal(control.input.value, 'secret');
    assert.equal(control.attributes['aria-label'], 'Afficher le mot de passe');

    control.click();
    assert.equal(control.input.type, 'text');
    assert.equal(control.input.value, 'secret');
    assert.equal(control.button.textContent, 'MASQUER');
    assert.equal(control.attributes['aria-label'], 'Masquer le mot de passe');
    assert.equal(control.attributes['aria-pressed'], 'true');

    control.click();
    assert.equal(control.input.type, 'password');
    assert.equal(control.input.value, 'secret');
    assert.equal(control.button.textContent, 'AFFICHER');
});

test('la confirmation est requise uniquement en mode inscription', () => {
    assert.ok(indexSource.includes("const isSignup = mode === 'signup';"));
    assert.ok(indexSource.includes("passwordConfirmationContainer.classList.toggle('hidden', !isSignup);"));
    assert.ok(indexSource.includes('passwordConfirmationInput.required = isSignup;'));
});

test('une différence bloque signUp avec un message sans effacer les valeurs', () => {
    const mismatchPosition = indexSource.indexOf('if (!passwordsMatch(password, passwordConfirmationInput.value))');
    const signUpPosition = indexSource.indexOf('supabaseClient.auth.signUp({');
    assert.ok(mismatchPosition > 0 && mismatchPosition < signUpPosition);
    assert.match(indexSource, /Les deux mots de passe ne correspondent pas\./);
    const mismatchBlock = indexSource.slice(mismatchPosition, signUpPosition);
    assert.match(mismatchBlock, /return;/);
    assert.doesNotMatch(mismatchBlock, /\.value\s*=|localStorage|sessionStorage/);
    assert.equal(passwordsMatch('identique', 'identique'), true);
    assert.equal(passwordsMatch('mot-de-passe', 'autre'), false);
});

test('la confirmation email Supabase validée reste branchée après correspondance', () => {
    assert.ok(indexSource.includes('emailRedirectTo: getEmailConfirmationRedirectUrl(window.location)'));
    assert.ok(indexSource.includes('enforceSignUpEmailConfirmation(supabaseClient, data)'));
    assert.ok(indexSource.includes('SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_REQUIRED'));
});

test('le module ne stocke ni ne copie aucun mot de passe', async () => {
    const moduleSource = await readFile(path.join(root, 'js', 'password-visibility.js'), 'utf8');
    assert.doesNotMatch(moduleSource, /localStorage|sessionStorage|cookie|fetch|supabase/i);
    const control = createControl('inchangé');
    setPasswordVisibility(control.input, control.button, true);
    assert.equal(control.input.value, 'inchangé');
});
