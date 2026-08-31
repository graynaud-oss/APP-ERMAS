import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
    classifySignUpConfirmation,
    enforceSignUpEmailConfirmation,
    getEmailConfirmationRedirectUrl,
    getSignInErrorMessage,
    SIGN_UP_CONFIRMATION_STATES
} from '../../js/email-confirmation.js';

const root = new URL('../../', import.meta.url);
const index = fs.readFileSync(new URL('index.html', root), 'utf8');

test('le retour de confirmation email conserve l’origine et la page index courantes', () => {
    assert.equal(
        getEmailConfirmationRedirectUrl({ href: 'https://plateforme-technique.ermas.fr/accueil.html' }),
        'https://plateforme-technique.ermas.fr/index.html'
    );
    assert.equal(
        getEmailConfirmationRedirectUrl({ href: 'http://127.0.0.1:8000/index.html' }),
        'http://127.0.0.1:8000/index.html'
    );
});

test('une inscription sans session exige la confirmation email avant accès', async () => {
    let signOutCalls = 0;
    const client = { auth: { async signOut() { signOutCalls += 1; return { error: null }; } } };
    const data = { user: { id: 'user-test' }, session: null };

    assert.equal(classifySignUpConfirmation(data), SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_REQUIRED);
    assert.deepEqual(await enforceSignUpEmailConfirmation(client, data), {
        state: SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_REQUIRED,
        error: null
    });
    assert.equal(signOutCalls, 0);
});

test('une session immédiate révèle une confirmation serveur inactive et reste fermée localement', async () => {
    const calls = [];
    const client = {
        auth: {
            async signOut(options) {
                calls.push(options);
                return { error: null };
            }
        }
    };
    const data = { user: { id: 'user-test' }, session: { access_token: 'non-utilisé' } };

    assert.deepEqual(await enforceSignUpEmailConfirmation(client, data), {
        state: SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_NOT_ENFORCED,
        error: null
    });
    assert.deepEqual(calls, [{ scope: 'local' }]);
});

test('la connexion non confirmée reçoit un message clair sans modifier les autres erreurs', () => {
    assert.match(getSignInErrorMessage({ code: 'email_not_confirmed' }), /pas encore confirmée/);
    assert.equal(getSignInErrorMessage({ code: 'invalid_credentials' }), 'Identifiants incorrects.');
});

test('index utilise signUp avec redirection, reste fermé sans confirmation et conserve le garde', () => {
    assert.match(index, /auth\.signUp\(\{[\s\S]*emailRedirectTo: getEmailConfirmationRedirectUrl\(window\.location\)/);
    assert.match(index, /enforceSignUpEmailConfirmation\(supabaseClient, data\)/);
    assert.match(index, /Un email de confirmation vient de vous être envoyé/);
    assert.match(index, /SIGN_UP_CONFIRMATION_STATES\.CONFIRMATION_REQUIRED/);
    assert.match(index, /La confirmation de l’adresse email n’est pas disponible\. L’accès reste fermé/);
    assert.match(index, /getSignInErrorMessage\(error\)/);
    assert.match(index, /requireAuthorizedUser/);
    assert.doesNotMatch(index, /email_confirmed_at|device_enrollment_allowed\s*=|device_token\s*=/);
});
