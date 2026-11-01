import { NextResponse } from 'next/server';
import {
    applySessionCookie,
    getStoredUsers,
    normalizeStoredPassword,
    passwordHashNeedsUpgrade,
    saveStoredUsers,
    toPublicUser,
    toSessionUser,
    verifyPassword,
} from '@/app/lib/serverAuth';
import {
    assertRateLimit,
    assertTrustedMutationRequest,
    getClientIdentifier,
    readJsonBody,
    securityErrorResponse,
} from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        assertRateLimit('auth-login', getClientIdentifier(request), 20, 15 * 60 * 1000);

        const body = await readJsonBody<{ login?: unknown; password?: unknown }>(request, 8 * 1024);
        const login = typeof body.login === 'string' ? body.login.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!login || !password) {
            return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
        }

        if (login.length > 120 || password.length > 128) {
            return NextResponse.json({ error: 'Неправильный логин или пароль' }, { status: 401 });
        }

        const users = await getStoredUsers();
        let foundUser = users.find((user) => user.login === login);

        if (!foundUser || !verifyPassword(foundUser, password)) {
            return NextResponse.json({ error: 'Неправильный логин или пароль' }, { status: 401 });
        }

        // Сотрудник входит сразу по выданным данным; старый флаг активации больше не блокирует вход.
        if (passwordHashNeedsUpgrade(foundUser) || !foundUser.isRegistered) {
            const upgradedUser = normalizeStoredPassword({ ...foundUser, isRegistered: true }, password);
            const updatedUsers = users.map((user) => user.id === foundUser?.id ? upgradedUser : user);
            await saveStoredUsers(updatedUsers);
            foundUser = upgradedUser;
        }

        const response = NextResponse.json({
            success: true,
            user: toPublicUser(foundUser),
        });

        applySessionCookie(response, toSessionUser(foundUser));
        return response;
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка входа:', error);
        return NextResponse.json({ error: 'Ошибка сервера при входе' }, { status: 500 });
    }
}
