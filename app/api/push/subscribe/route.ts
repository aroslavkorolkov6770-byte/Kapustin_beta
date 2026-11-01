import { NextResponse } from 'next/server';

// Этот канал намеренно отключён в сокращённой бета-версии, без чтения контактных данных.
export function POST() {
    return NextResponse.json({ error: 'Подписка на внешние уведомления не используется в этой бета-версии.', code: 'EXTERNAL_NOTIFICATIONS_DISABLED' }, { status: 410 });
}
