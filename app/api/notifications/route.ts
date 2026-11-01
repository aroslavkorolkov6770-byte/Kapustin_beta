import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getStoredUsers, isHiddenSystemUser, requireAdminSession } from '@/app/lib/serverAuth';
import { readDataValue, writeDataValue } from '@/app/lib/storage/dataStore';
import { assertRateLimit, assertTrustedMutationRequest, getClientIdentifier, readJsonBody, securityErrorResponse } from '@/app/lib/serverSecurity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await requireAdminSession();
        if (!session) return NextResponse.json({ error: 'Доступ только для администратора' }, { status: 403 });

        assertRateLimit('in-app-notifications', getClientIdentifier(request, session.id), 120, 60 * 60 * 1000);
        const body = await readJsonBody<Record<string, unknown>>(request, 32 * 1024);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const target = typeof body.target === 'string' ? body.target.trim() : '';
        if (!title || !text || !target || title.length > 200 || text.length > 8000 || target.length > 120) {
            return NextResponse.json({ error: 'Проверьте получателя, заголовок и текст уведомления' }, { status: 400 });
        }
        if (target !== 'Все') {
            const recipient = (await getStoredUsers()).find(user => user.id === target && !isHiddenSystemUser(user));
            if (!recipient) return NextResponse.json({ error: 'Получатель не найден' }, { status: 400 });
        }

        const notification = {
            id: `n_${randomUUID()}`,
            title,
            text,
            target,
            time: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
        };
        // Сервер дописывает сообщение ко всему списку, включая чужие личные уведомления.
        // Клиент получает только созданную запись; чтение кабинета по-прежнему фильтруется по получателю.
        const current = await readDataValue<unknown>('tea_hub_notifications_v1', []);
        await writeDataValue('tea_hub_notifications_v1', [notification, ...(Array.isArray(current) ? current : [])]);
        return NextResponse.json({ success: true, notification }, { status: 201 });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) return securityResponse;
        console.error('Ошибка создания уведомления:', error);
        return NextResponse.json({ error: 'Не удалось сохранить уведомление' }, { status: 500 });
    }
}
