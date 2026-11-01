import { NextResponse } from 'next/server';
import { clearSessionCookie, getSessionFromCookies } from '@/app/lib/serverAuth';
import { markUserOffline } from '@/app/lib/userPresence';
import { assertTrustedMutationRequest, securityErrorResponse } from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);

        try {
            const session = await getSessionFromCookies();
            if (session) {
                await markUserOffline(session.id);
            }
        } catch (presenceError) {
            console.error('Не удалось зафиксировать выход пользователя:', presenceError);
        }

        const response = NextResponse.json({ success: true });
        clearSessionCookie(response);
        return response;
    } catch (error) {
        return securityErrorResponse(error) || NextResponse.json({ error: 'Не удалось завершить сеанс' }, { status: 500 });
    }
}
