import { NextResponse } from 'next/server';
import {
    applySessionCookie,
    getStoredUsers,
    isHiddenSystemUser,
    normalizeStoredPassword,
    requireAdminSession,
    saveStoredUsers,
    toPublicUser,
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
        const session = await requireAdminSession();

        if (!session) {
            return NextResponse.json({ error: 'Доступ только для администратора' }, { status: 403 });
        }

        assertRateLimit('admin-user-credentials', getClientIdentifier(request, session.id), 30, 60 * 60 * 1000);
        const body = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const login = typeof body.login === 'string' ? body.login.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!userId || !login || !password) {
            return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
        }

        if (login.length > 120 || password.length < 8 || password.length > 128) {
            return NextResponse.json({ error: 'Логин должен быть короче 120 символов, пароль — от 8 до 128 символов' }, { status: 400 });
        }

        const users = await getStoredUsers();
        const targetUser = users.find((user) => user.id === userId);

        if (isHiddenSystemUser(targetUser) && session.id !== userId) {
            return NextResponse.json({ error: 'Доступ к системному аккаунту закрыт' }, { status: 403 });
        }

        if (users.some((user) => user.login === login && user.id !== userId)) {
            return NextResponse.json({ error: 'Логин уже занят другим пользователем' }, { status: 409 });
        }

        let updatedUser = null;
        const updatedUsers = users.map((user) => {
            if (user.id !== userId) {
                return user;
            }

            updatedUser = normalizeStoredPassword(
                {
                    ...user,
                    login,
                },
                password,
            );

            return updatedUser;
        });

        if (!updatedUser) {
            return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
        }

        await saveStoredUsers(updatedUsers);

        const response = NextResponse.json({
            success: true,
            user: toPublicUser(updatedUser),
        });
        if (session.id === userId) {
            applySessionCookie(response, toSessionUser(updatedUser));
        }
        return response;
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка обновления доступов:', error);
        return NextResponse.json({ error: 'Ошибка обновления доступов' }, { status: 500 });
    }
}
