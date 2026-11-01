import { NextResponse } from 'next/server';
import { getStoredUsers, isHiddenSystemUser, requireAdminSession } from '@/app/lib/serverAuth';
import { getUsersPresence } from '@/app/lib/userPresence';
import { assertRateLimit, getClientIdentifier, securityErrorResponse } from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const session = await requireAdminSession();

        if (!session) {
            return NextResponse.json({ error: 'Доступ только для администратора' }, { status: 403 });
        }

        assertRateLimit('admin-presence-read', getClientIdentifier(request, session.id), 120, 5 * 60 * 1000);

        const users = await getStoredUsers();
        const visibleUserIds = users
            .filter((user) => !isHiddenSystemUser(user))
            .map((user) => user.id);
        const presence = await getUsersPresence(visibleUserIds);

        return NextResponse.json(
            { presence },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
        );
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка загрузки присутствия сотрудников:', error);
        return NextResponse.json({ error: 'Не удалось загрузить присутствие сотрудников' }, { status: 500 });
    }
}
