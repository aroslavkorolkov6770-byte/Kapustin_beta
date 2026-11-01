import { NextResponse } from 'next/server';
import {
    getAiKnowledgeSyncState,
    synchronizeAiKnowledge,
} from '@/app/lib/aiKnowledge';
import { getSessionFromCookies } from '@/app/lib/serverAuth';
import {
    assertRateLimit,
    assertTrustedMutationRequest,
    getClientIdentifier,
    securityErrorResponse,
} from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const requireAdministrator = async () => {
    const session = await getSessionFromCookies();
    if (!session || session.role !== 'admin') {
        return null;
    }

    return session;
};

export async function GET(request: Request) {
    try {
        const session = await requireAdministrator();
        if (!session) {
            return NextResponse.json({ error: 'Недостаточно прав доступа' }, { status: 403 });
        }

        assertRateLimit('ai-knowledge-status', getClientIdentifier(request, session.id), 60, 5 * 60 * 1000);
        const state = await getAiKnowledgeSyncState();
        return NextResponse.json({
            vectorStoreConfigured: Boolean(state.vectorStoreId),
            indexedSources: state.sourceCount,
            lastAttemptAt: state.lastAttemptAt,
            lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            lastError: state.lastError,
        });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка получения состояния базы знаний AI:', error);
        return NextResponse.json({ error: 'Не удалось получить состояние базы знаний' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await requireAdministrator();
        if (!session) {
            return NextResponse.json({ error: 'Недостаточно прав доступа' }, { status: 403 });
        }

        assertRateLimit('ai-knowledge-sync', getClientIdentifier(request, session.id), 5, 10 * 60 * 1000);
        const result = await synchronizeAiKnowledge();
        return NextResponse.json({
            success: result.errors.length === 0,
            changed: result.changed,
            indexedSources: result.indexedSources,
            synchronizedAt: result.synchronizedAt,
            errors: result.errors,
        }, { status: result.errors.length === 0 ? 200 : 207 });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        console.error('Ошибка синхронизации базы знаний AI:', error);
        return NextResponse.json({ error: 'Не удалось обновить базу знаний AI' }, { status: 502 });
    }
}
