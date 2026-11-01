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

const MIN_TEMPORARY_PASSWORD_LENGTH = 8;
const MAX_TEMPORARY_PASSWORD_LENGTH = 128;

export async function PUT(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await requireAdminSession();

        if (!session) {
            return NextResponse.json({ error: 'Доступ только для администратора' }, { status: 403 });
        }

        assertRateLimit('admin-user-password', getClientIdentifier(request, session.id), 30, 60 * 60 * 1000);
        const body = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
        const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
        const temporaryPassword = typeof body.temporaryPassword === 'string' ? body.temporaryPassword.trim() : '';

        if (!userId || !temporaryPassword) {
            return NextResponse.json({ error: 'Укажите сотрудника и временный пароль' }, { status: 400 });
        }

        if (temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
            return NextResponse.json(
                { error: `Временный пароль должен содержать не менее ${MIN_TEMPORARY_PASSWORD_LENGTH} символов` },
                { status: 400 },
            );
        }

        if (temporaryPassword.length > MAX_TEMPORARY_PASSWORD_LENGTH) {
            return NextResponse.json(
                { error: `Временный пароль не должен превышать ${MAX_TEMPORARY_PASSWORD_LENGTH} символов` },
                { status: 400 },
            );
        }

        const users = await getStoredUsers();
        const targetUser = users.find((user) => user.id === userId);

        if (!targetUser) {
            return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 });
        }

        if (isHiddenSystemUser(targetUser)) {
            return NextResponse.json({ error: 'Пароль служебного аккаунта нельзя сбросить из карточки сотрудника' }, { status: 403 });
        }

        const updatedUser = normalizeStoredPassword(targetUser, temporaryPassword);
        const updatedUsers = users.map((user) => (user.id === userId ? updatedUser : user));
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

        console.error('Ошибка сброса пароля сотрудника:', error);
        return NextResponse.json({ error: 'Не удалось сбросить пароль сотрудника' }, { status: 500 });
    }
}
