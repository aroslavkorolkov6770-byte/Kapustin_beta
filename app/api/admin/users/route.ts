import { NextResponse } from 'next/server';
import {
    getStoredUsers,
    hashPassword,
    isHiddenSystemUser,
    requireAdminSession,
    saveStoredUsers,
    toPublicUser,
    type StoredUser,
    type UserRole,
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
        const session = await requireAdminSession();

        if (!session) {
            return NextResponse.json({ error: 'Доступ только для администратора' }, { status: 403 });
        }

        assertRateLimit('admin-users-create', getClientIdentifier(request, session.id), 60, 60 * 60 * 1000);
        const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const login = typeof body.login === 'string' ? body.login.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const location = typeof body.location === 'string' ? body.location.trim() : '';
        const role: UserRole = body.role === 'admin' ? 'admin' : 'staff';

        if (!name || !login || !password) {
            return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 });
        }

        if (name.length > 120 || login.length > 120 || password.length < 8 || password.length > 128) {
            return NextResponse.json(
                { error: 'Имя и логин должны быть короче 120 символов, пароль — от 8 до 128 символов' },
                { status: 400 },
            );
        }

        if (location.length > 120) {
            return NextResponse.json({ error: 'Название точки не должно превышать 120 символов' }, { status: 400 });
        }

        const users = await getStoredUsers();

        if (users.some((user) => user.login === login)) {
            return NextResponse.json({ error: 'Логин уже существует' }, { status: 409 });
        }

        const createdUser: StoredUser = {
            id: `u_${Date.now()}`,
            login,
            passHash: hashPassword(password),
            role,
            name,
            location: location || undefined,
            // В сокращённой бета-версии учётная запись сразу готова к первому входу.
            isRegistered: true,
        };

        const updatedUsers = [...users, createdUser];
        await saveStoredUsers(updatedUsers);

        return NextResponse.json({
            success: true,
            user: toPublicUser(createdUser),
        });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка создания сотрудника:', error);
        return NextResponse.json({ error: 'Ошибка создания сотрудника' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await requireAdminSession();

        if (!session) {
            return NextResponse.json({ error: 'Доступ только для администратора' }, { status: 403 });
        }

        assertRateLimit('admin-users-delete', getClientIdentifier(request, session.id), 30, 60 * 60 * 1000);
        const body = await readJsonBody<{ userId?: unknown }>(request, 8 * 1024);
        const userId = typeof body.userId === 'string' ? body.userId : '';

        if (!userId) {
            return NextResponse.json({ error: 'Не указан пользователь' }, { status: 400 });
        }

        const users = await getStoredUsers();
        const protectedIds = new Set(['u_admin', 'u_staff', 'u_staff_new']);
        const targetUser = users.find((user) => user.id === userId);

        if (protectedIds.has(userId) || isHiddenSystemUser(targetUser)) {
            return NextResponse.json({ error: 'Базовые аккаунты удалять нельзя' }, { status: 400 });
        }

        const updatedUsers = users.filter((user) => user.id !== userId);
        await saveStoredUsers(updatedUsers);

        return NextResponse.json({ success: true, userId });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка удаления сотрудника:', error);
        return NextResponse.json({ error: 'Ошибка удаления сотрудника' }, { status: 500 });
    }
}
