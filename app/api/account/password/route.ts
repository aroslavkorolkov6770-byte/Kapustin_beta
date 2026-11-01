import { NextResponse } from 'next/server';
import {
    applySessionCookie,
    getCurrentStoredUser,
    getStoredUsers,
    normalizeStoredPassword,
    saveStoredUsers,
    toSessionUser,
} from '@/app/lib/serverAuth';
import {
    assertRateLimit,
    assertTrustedMutationRequest,
    getClientIdentifier,
    readJsonBody,
    securityErrorResponse,
} from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const currentUser = await getCurrentStoredUser();

        if (!currentUser) {
            return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
        }

        assertRateLimit('account-password', getClientIdentifier(request, currentUser.id), 5, 60 * 60 * 1000);
        const body = await readJsonBody<{ password?: unknown }>(request, 8 * 1024);
        const newPassword = typeof body.password === 'string' ? body.password : '';

        if (newPassword.length < 8 || newPassword.length > 128) {
            return NextResponse.json({ error: 'Пароль должен содержать от 8 до 128 символов' }, { status: 400 });
        }

        const users = await getStoredUsers();
        let updatedUser = currentUser;
        const updatedUsers = users.map((user) => {
            if (user.id !== currentUser.id) {
                return user;
            }

            updatedUser = normalizeStoredPassword(user, newPassword);
            return updatedUser;
        });

        await saveStoredUsers(updatedUsers);

        const response = NextResponse.json({ success: true });
        applySessionCookie(response, toSessionUser(updatedUser));
        return response;
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка смены пароля:', error);
        return NextResponse.json({ error: 'Ошибка смены пароля' }, { status: 500 });
    }
}
