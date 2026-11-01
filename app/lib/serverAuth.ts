import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { readDataValue, writeDataValue } from '@/app/lib/storage/dataStore';
import { readJsonFile, writeJsonFile } from '@/app/lib/storage/jsonFileStore';
import { isSystemWorkspaceAccount } from '@/app/lib/userVisibility';

export { readJsonFile, writeJsonFile };

export const AUTH_COOKIE_NAME = 'tea_hub_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const USERS_KEY = 'tea_hub_users_v1';
const HASH_PREFIX = 'scrypt2';
const LEGACY_HASH_PREFIX = 'scrypt';
const SCRYPT_OPTIONS = {
    N: 32_768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
};

export type UserRole = 'admin' | 'staff';

export interface StoredUser {
    id: string;
    login: string;
    pass?: string;
    passHash?: string;
    authVersion?: number;
    role: UserRole;
    name: string;
    location?: string;
    isRegistered?: boolean;
    registered?: boolean;
    email?: string;
    avatar?: string;
    systemAccount?: boolean;
    ghostAccount?: boolean;
    profileDisabled?: boolean;
    profileOwnerOnly?: boolean;
    hideFromStats?: boolean;
    canSwitchMode?: boolean;
    accountLabel?: string;
}

export interface SessionUser {
    id: string;
    login: string;
    role: UserRole;
    name: string;
    authVersion: number;
    systemAccount?: boolean;
    ghostAccount?: boolean;
    profileDisabled?: boolean;
    profileOwnerOnly?: boolean;
    hideFromStats?: boolean;
    canSwitchMode?: boolean;
    accountLabel?: string;
}

interface SessionPayload extends SessionUser {
    exp: number;
}

const getAuthSecret = () => {
    const configuredSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

    if (configuredSecret && configuredSecret.length >= 32) {
        return configuredSecret;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('AUTH_SECRET должен быть задан на сервере и содержать не менее 32 символов');
    }

    return 'tea-hub-development-secret-not-for-production';
};

const normalizeStoredUser = (user: StoredUser): StoredUser => {
    const normalizedUser: StoredUser = {
        ...user,
        authVersion: Number.isInteger(user.authVersion) && Number(user.authVersion) >= 0
            ? Number(user.authVersion)
            : 0,
    };

    if (typeof normalizedUser.isRegistered !== 'boolean' && typeof normalizedUser.registered === 'boolean') {
        normalizedUser.isRegistered = normalizedUser.registered;
    }

    if (!normalizedUser.name) {
        normalizedUser.name = normalizedUser.role === 'admin' ? 'Главный Мастер' : 'Сотрудник';
    }

    if (!normalizedUser.passHash && typeof normalizedUser.pass === 'string' && normalizedUser.pass) {
        normalizedUser.passHash = hashPassword(normalizedUser.pass);
    }

    delete normalizedUser.pass;
    return normalizedUser;
};

const getBootstrapUsers = (): StoredUser[] => {
    if (process.env.NODE_ENV !== 'production') {
        return [
            {
                id: 'u_admin',
                login: '11',
                passHash: hashPassword('11'),
                authVersion: 0,
                role: 'admin',
                name: 'Главный Мастер',
                isRegistered: true,
            },
            {
                id: 'u_staff',
                login: '1',
                passHash: hashPassword('1'),
                authVersion: 0,
                role: 'staff',
                name: 'Ярик',
                isRegistered: true,
            },
        ];
    }

    const login = process.env.BOOTSTRAP_ADMIN_LOGIN?.trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!login || !password || password.length < 8) {
        return [];
    }

    return [
        {
            id: 'u_admin',
            login,
            passHash: hashPassword(password),
            authVersion: 0,
            role: 'admin',
            name: 'Главный Мастер',
            isRegistered: true,
        },
    ];
};

export const ensureBaseUsers = async () => {
    const currentUsers = await readDataValue<StoredUser[]>(USERS_KEY, []);

    if (!Array.isArray(currentUsers) || currentUsers.length === 0) {
        const bootstrapUsers = getBootstrapUsers();
        if (bootstrapUsers.length > 0) {
            await writeDataValue(USERS_KEY, bootstrapUsers);
        }
        return bootstrapUsers;
    }

    const normalizedUsers = currentUsers.map(normalizeStoredUser);

    if (JSON.stringify(normalizedUsers) !== JSON.stringify(currentUsers)) {
        await writeDataValue(USERS_KEY, normalizedUsers);
    }

    return normalizedUsers;
};

export const getStoredUsers = () => {
    return ensureBaseUsers();
};

export const saveStoredUsers = async (users: StoredUser[]) => {
    await writeDataValue(USERS_KEY, users);
};

export const isHiddenSystemUser = (user: StoredUser | null | undefined) => {
    return isSystemWorkspaceAccount(user);
};

export const hashPassword = (password: string) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex');
    return `${HASH_PREFIX}$${salt}$${hash}`;
};

const verifyPasswordHash = (password: string, storedHash: string) => {
    const [prefix, salt, originalHash] = storedHash.split('$');

    if (
        (prefix !== HASH_PREFIX && prefix !== LEGACY_HASH_PREFIX)
        || !salt
        || !originalHash
    ) {
        return false;
    }

    const hashBuffer = prefix === HASH_PREFIX
        ? crypto.scryptSync(password, salt, 64, SCRYPT_OPTIONS)
        : crypto.scryptSync(password, salt, 64);
    const originalHashBuffer = Buffer.from(originalHash, 'hex');

    if (hashBuffer.length !== originalHashBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(hashBuffer, originalHashBuffer);
};

export const verifyPassword = (user: StoredUser, password: string) => {
    if (user.passHash) {
        return verifyPasswordHash(password, user.passHash);
    }

    return false;
};

export const passwordHashNeedsUpgrade = (user: StoredUser) => {
    return !user.passHash?.startsWith(`${HASH_PREFIX}$`);
};

export const normalizeStoredPassword = (user: StoredUser, nextPassword: string) => {
    const normalizedUser: StoredUser = {
        ...user,
        passHash: hashPassword(nextPassword),
        authVersion: (user.authVersion || 0) + 1,
    };

    delete normalizedUser.pass;

    return normalizedUser;
};

export const toSessionUser = (user: StoredUser): SessionUser => ({
    id: user.id,
    login: user.login,
    role: user.role,
    name: user.name || (user.role === 'admin' ? 'Главный Мастер' : 'Сотрудник'),
    authVersion: user.authVersion || 0,
    systemAccount: Boolean(user.systemAccount),
    ghostAccount: Boolean(user.ghostAccount),
    profileDisabled: Boolean(user.profileDisabled),
    profileOwnerOnly: Boolean(user.profileOwnerOnly),
    hideFromStats: Boolean(user.hideFromStats),
    canSwitchMode: Boolean(user.canSwitchMode),
    accountLabel: user.accountLabel || '',
});

export const toPublicUser = (user: StoredUser) => ({
    id: user.id,
    login: user.login,
    role: user.role,
    name: user.name || (user.role === 'admin' ? 'Главный Мастер' : 'Сотрудник'),
    location: user.location || '',
    isRegistered: user.isRegistered ?? true,
    avatar: user.avatar || '',
    hasPassword: Boolean(user.passHash || user.pass),
    systemAccount: Boolean(user.systemAccount),
    ghostAccount: Boolean(user.ghostAccount),
    profileDisabled: Boolean(user.profileDisabled),
    profileOwnerOnly: Boolean(user.profileOwnerOnly),
    hideFromStats: Boolean(user.hideFromStats),
    canSwitchMode: Boolean(user.canSwitchMode),
    accountLabel: user.accountLabel || '',
});

const signValue = (value: string) => {
    return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('base64url');
};

export const createSessionToken = (sessionUser: SessionUser) => {
    const payload: SessionPayload = {
        ...sessionUser,
        exp: Date.now() + SESSION_TTL_MS,
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = signValue(encodedPayload);
    return `${encodedPayload}.${signature}`;
};

export const verifySessionToken = (token: string | undefined) => {
    if (!token) {
        return null;
    }

    const tokenParts = token.split('.');
    if (tokenParts.length !== 2) {
        return null;
    }

    const [encodedPayload, signature] = tokenParts;
    const expectedSignature = signValue(encodedPayload);
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
        signatureBuffer.length !== expectedSignatureBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;

        if (
            !Number.isFinite(payload.exp) ||
            payload.exp < Date.now() ||
            typeof payload.id !== 'string' ||
            typeof payload.login !== 'string' ||
            typeof payload.name !== 'string' ||
            (payload.role !== 'admin' && payload.role !== 'staff') ||
            !Number.isInteger(payload.authVersion) ||
            payload.authVersion < 0
        ) {
            return null;
        }

        return payload;
    } catch (error) {
        console.error('Ошибка разбора сессии:', error);
        return null;
    }
};

export const getSessionFromCookies = async () => {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    const payload = verifySessionToken(token);

    if (!payload) {
        return null;
    }

    const users = await getStoredUsers();
    const storedUser = users.find((user) => user.id === payload.id);

    if (
        !storedUser ||
        storedUser.login !== payload.login ||
        storedUser.role !== payload.role ||
        (storedUser.authVersion || 0) !== payload.authVersion
    ) {
        return null;
    }

    return toSessionUser(storedUser);
};

export const getCurrentStoredUser = async () => {
    const session = await getSessionFromCookies();

    if (!session) {
        return null;
    }

    const users = await getStoredUsers();
    const currentUser = users.find((user) => user.id === session.id);

    if (!currentUser) {
        return null;
    }

    return currentUser;
};

export const requireSession = async () => {
    const session = await getSessionFromCookies();

    if (!session) {
        return null;
    }

    return session;
};

export const requireAdminSession = async () => {
    const session = await requireSession();

    if (!session || session.role !== 'admin') {
        return null;
    }

    return session;
};

export const applySessionCookie = (response: NextResponse, sessionUser: SessionUser) => {
    response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: createSessionToken(sessionUser),
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
};

export const clearSessionCookie = (response: NextResponse) => {
    response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    });
};
