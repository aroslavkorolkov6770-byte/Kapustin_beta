import { NextResponse } from 'next/server';
import {
    applySessionCookie,
    getCurrentStoredUser,
    getStoredUsers,
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

export async function PUT(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const currentUser = await getCurrentStoredUser();
        if (!currentUser) {
            return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
        }

        assertRateLimit('account-login', getClientIdentifier(request, currentUser.id), 15, 60 * 60 * 1000);
        const body = await readJsonBody<{ login?: unknown; currentPassword?: unknown }>(request, 8 * 1024);
        const login = typeof body.login === 'string' ? body.login.trim() : '';
        const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
        if (!login || login.length > 120 || /[\s\u0000-\u001f\u007f]/u.test(login)) {
            return NextResponse.json({ error: 'Логин должен содержать от 1 до 120 символов без пробелов' }, { status: 400 });
        }
        if (!currentPassword || currentPassword.length > 128) {
            return NextResponse.json({ error: 'Введите текущий пароль' }, { status: 400 });
        }

        const users = await getStoredUsers();
        const targetUser = users.find(user => user.id === currentUser.id);
        if (!targetUser || !verifyPassword(targetUser, currentPassword)) {
            return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 403 });
        }
        if (users.some(user => user.id !== targetUser.id && user.login === login)) {
            return NextResponse.json({ error: 'Логин уже занят другим пользователем' }, { status: 409 });
        }

        // Сохраняем тот же ID и пароль. Новая версия доступа отзывает прежние сессии при реальной смене логина.
        const updatedUser = login === targetUser.login ? targetUser : {
            ...targetUser,
            login,
            authVersion: (targetUser.authVersion || 0) + 1,
        };
        if (updatedUser !== targetUser) {
            await saveStoredUsers(users.map(user => user.id === updatedUser.id ? updatedUser : user));
        }

        const response = NextResponse.json({ success: true, user: toPublicUser(updatedUser) });
        // В текущем окне пользователь продолжает работу уже с обновлённой подписанной сессией.
        applySessionCookie(response, toSessionUser(updatedUser));
        return response;
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) return securityResponse;
        console.error('Ошибка смены логина:', error);
        return NextResponse.json({ error: 'Не удалось изменить логин' }, { status: 500 });
    }
}
