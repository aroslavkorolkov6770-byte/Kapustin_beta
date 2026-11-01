import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/app/lib/serverAuth';

const isProtectedPath = (pathname: string) => {
    return pathname.startsWith('/tasks') || pathname.startsWith('/profile') || pathname.startsWith('/admin');
};

export function proxy(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

    if (!isProtectedPath(pathname)) {
        return NextResponse.next();
    }

    const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = verifySessionToken(sessionToken);

    if (!session) {
        const loginUrl = new URL('/login', request.url);
        if (pathname !== '/login') {
            loginUrl.searchParams.set('redirect', `${pathname}${search}`);
        }
        return NextResponse.redirect(loginUrl);
    }

    if (pathname.startsWith('/admin') && session.role !== 'admin') {
        return NextResponse.redirect(new URL('/tasks?tab=welcome', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*', '/profile/:path*', '/tasks/:path*'],
};
