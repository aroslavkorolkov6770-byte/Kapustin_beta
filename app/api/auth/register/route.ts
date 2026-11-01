import { NextResponse } from 'next/server';

// Этот канал намеренно отключён в сокращённой бета-версии, без чтения контактных данных.
export function POST() {
    return NextResponse.json({ error: 'Дополнительная регистрация не требуется. Войдите по данным, выданным администратором.', code: 'REGISTRATION_DISABLED' }, { status: 410 });
}
