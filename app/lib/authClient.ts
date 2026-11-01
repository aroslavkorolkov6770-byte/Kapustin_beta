'use client';

export interface ClientSessionUser {
    id: string;
    login: string;
    role: 'admin' | 'staff';
    name: string;
    systemAccount?: boolean;
    ghostAccount?: boolean;
    profileDisabled?: boolean;
    profileOwnerOnly?: boolean;
    hideFromStats?: boolean;
    canSwitchMode?: boolean;
    accountLabel?: string;
}

export type ClientViewMode = 'admin' | 'staff';

const setCookie = (name: string, value: string, days: number | null = 7) => {
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${date.toUTCString()};path=/`;
        return;
    }

    document.cookie = `${name}=${encodeURIComponent(value)};path=/`;
};

const deleteCookie = (name: string) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

export const applyClientAuthState = (user: ClientSessionUser) => {
    const hasConsent = localStorage.getItem('cookieConsent') === 'true';
    const storage = hasConsent ? localStorage : sessionStorage;
    const secondaryStorage = hasConsent ? sessionStorage : localStorage;
    const storedViewMode = storage.getItem('system_view_mode') || secondaryStorage.getItem('system_view_mode');
    const nextViewMode: ClientViewMode = user.canSwitchMode && storedViewMode === 'staff'
        ? 'staff'
        : user.role;

    storage.setItem('isLoggedIn', 'true');
    storage.setItem('userRole', nextViewMode);
    storage.setItem('actual_user_role', user.role);
    storage.setItem('current_user_id', user.id);
    storage.setItem('current_user_name', user.name);
    storage.setItem('login', user.login);
    storage.setItem('is_system_account', user.systemAccount ? 'true' : 'false');
    storage.setItem('profile_disabled', user.profileDisabled ? 'true' : 'false');
    storage.setItem('profile_owner_only', user.profileOwnerOnly ? 'true' : 'false');
    storage.setItem('can_switch_mode', user.canSwitchMode ? 'true' : 'false');
    storage.setItem('account_label', user.accountLabel || '');
    storage.setItem('system_view_mode', nextViewMode);

    secondaryStorage.removeItem('isLoggedIn');
    secondaryStorage.removeItem('userRole');
    secondaryStorage.removeItem('actual_user_role');
    secondaryStorage.removeItem('current_user_id');
    secondaryStorage.removeItem('current_user_name');
    secondaryStorage.removeItem('login');
    secondaryStorage.removeItem('is_system_account');
    secondaryStorage.removeItem('profile_disabled');
    secondaryStorage.removeItem('profile_owner_only');
    secondaryStorage.removeItem('can_switch_mode');
    secondaryStorage.removeItem('account_label');
    secondaryStorage.removeItem('system_view_mode');

    setCookie('isLoggedIn', 'true', hasConsent ? 7 : null);
    setCookie('userRole', nextViewMode, hasConsent ? 7 : null);
    setCookie('current_user_id', user.id, hasConsent ? 7 : null);
    setCookie('current_user_name', user.name, hasConsent ? 7 : null);
};

const readBrowserFlag = (key: string) => {
    if (typeof window === 'undefined') {
        return null;
    }

    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
};

export const getClientViewMode = (user?: Partial<ClientSessionUser> | null): ClientViewMode => {
    const canSwitchMode = user?.canSwitchMode ?? readBrowserFlag('can_switch_mode') === 'true';

    if (canSwitchMode) {
        const storedMode = readBrowserFlag('system_view_mode');
        return storedMode === 'staff' ? 'staff' : 'admin';
    }

    const role = user?.role || readBrowserFlag('actual_user_role') || readBrowserFlag('userRole');
    return role === 'admin' ? 'admin' : 'staff';
};

export const isClientAdminView = (user?: Partial<ClientSessionUser> | null) => {
    return getClientViewMode(user) === 'admin';
};

export const setClientViewMode = (mode: ClientViewMode) => {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.setItem('system_view_mode', mode);
    sessionStorage.setItem('system_view_mode', mode);
    localStorage.setItem('userRole', mode);
    sessionStorage.setItem('userRole', mode);
    setCookie('userRole', mode, localStorage.getItem('cookieConsent') === 'true' ? 7 : null);
    window.dispatchEvent(new CustomEvent('teaHubViewModeChanged', { detail: { mode } }));
    window.dispatchEvent(new Event('storage'));
};

export const getClientLandingPath = (user?: Partial<ClientSessionUser> | null) => {
    return isClientAdminView(user) ? '/admin' : '/tasks?tab=welcome';
};

export const clearClientAuthState = () => {
    const keysToRemove = [
        'isLoggedIn',
        'userRole',
        'actual_user_role',
        'current_user_id',
        'current_user_name',
        'login',
        'th_current_user',
        'currentUser',
        'user',
        'profile',
        'userData',
        'account',
        'is_system_account',
        'profile_disabled',
        'profile_owner_only',
        'can_switch_mode',
        'account_label',
        'system_view_mode',
    ];

    keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });

    deleteCookie('isLoggedIn');
    deleteCookie('userRole');
    deleteCookie('current_user_id');
    deleteCookie('current_user_name');
};
