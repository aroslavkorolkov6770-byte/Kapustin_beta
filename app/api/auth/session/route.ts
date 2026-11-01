import { NextResponse } from 'next/server';
import { clearSessionCookie, getCurrentStoredUser, toPublicUser } from '@/app/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const currentUser = await getCurrentStoredUser();

        if (!currentUser) {
            const response = NextResponse.json({ authenticated: false }, { status: 401 });
            clearSessionCookie(response);
            return response;
        }

        return NextResponse.json({
            authenticated: true,
            user: toPublicUser(currentUser),
        });
    } catch (error) {
        console.error('Ошибка получения сессии:', error);
        return NextResponse.json({ authenticated: false }, { status: 500 });
    }
}
