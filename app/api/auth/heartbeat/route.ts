import { NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/serverAuth';
import { markUserOnline } from '@/app/lib/userPresence';
import {
    assertRateLimit,
    assertTrustedMutationRequest,
    getClientIdentifier,
    securityErrorResponse,
} from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await requireSession();

        if (!session) {
            return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
        }

        assertRateLimit('auth-heartbeat', getClientIdentifier(request, session.id), 20, 60 * 1000);
        const presence = await markUserOnline(session.id);

        return NextResponse.json(
            { success: true, lastSeenAt: presence.lastSeenAt },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        return securityErrorResponse(error) || NextResponse.json({ error: 'Не удалось обновить статус присутствия' }, { status: 500 });
    }
}
