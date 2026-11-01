import { NextResponse } from 'next/server';

// Этот канал намеренно отключён в сокращённой бета-версии, без чтения контактных данных.
export function POST() {
    return NextResponse.json({ error: 'Уведомления доступны только в личном кабинете.', code: 'EXTERNAL_NOTIFICATIONS_DISABLED' }, { status: 410 });
}
