let deferredInstallPrompt = null;

export function isStandalone(windowObject = globalThis.window) {
    return windowObject?.matchMedia?.('(display-mode: standalone)').matches === true
        || windowObject?.navigator?.standalone === true;
}

export function isMobileOrTablet(navigatorObject = globalThis.navigator) {
    const userAgent = navigatorObject?.userAgent || '';
    const mobileHint = navigatorObject?.userAgentData?.mobile === true;
    const ipadDesktopMode = navigatorObject?.platform === 'MacIntel' && navigatorObject?.maxTouchPoints > 1;
    return mobileHint || /Android|iPhone|iPad|iPod/i.test(userAgent) || ipadDesktopMode;
}

export function isIosDevice(navigatorObject = globalThis.navigator) {
    const userAgent = navigatorObject?.userAgent || '';
    return /iPhone|iPad|iPod/i.test(userAgent)
        || (navigatorObject?.platform === 'MacIntel' && navigatorObject?.maxTouchPoints > 1);
}

export function isIosSafari(navigatorObject = globalThis.navigator) {
    const userAgent = navigatorObject?.userAgent || '';
    const safari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    return isIosDevice(navigatorObject) && safari;
}

export async function registerServiceWorker(navigatorObject = globalThis.navigator) {
    if (!navigatorObject?.serviceWorker) return null;
    try {
        return await navigatorObject.serviceWorker.register('/service-worker.js', { scope: '/' });
    } catch {
        return null;
    }
}

export function configureInstallPage({ button, androidPanel, iosPanel, desktopMessage }, windowObject = globalThis.window) {
    const standalone = isStandalone(windowObject);
    const mobileOrTablet = isMobileOrTablet(windowObject?.navigator);
    const iosDevice = isIosDevice(windowObject?.navigator);
    const iosSafari = isIosSafari(windowObject?.navigator);

    if (standalone) return 'standalone';
    if (!mobileOrTablet) {
        desktopMessage?.classList.remove('hidden');
        return 'desktop';
    }
    if (iosDevice) {
        if (iosSafari) iosPanel?.classList.remove('hidden');
        return iosSafari ? 'ios' : 'ios-unsupported';
    }

    if (/Android/i.test(windowObject?.navigator?.userAgent || '')) {
        androidPanel?.classList.remove('hidden');
        if (deferredInstallPrompt && button) button.classList.remove('hidden');
        return 'android';
    }

    desktopMessage?.classList.remove('hidden');
    return 'unsupported';
}

export async function promptInstall(button) {
    if (!deferredInstallPrompt || !button) return false;
    button.disabled = true;
    try {
        await deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        button.classList.add('hidden');
        return true;
    } finally {
        button.disabled = false;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        if (!isMobileOrTablet(window.navigator) || isStandalone(window)) return;
        event.preventDefault();
        deferredInstallPrompt = event;
        window.dispatchEvent(new CustomEvent('ermas-install-available'));
    });
    window.addEventListener('load', () => { registerServiceWorker(); }, { once: true });
}
