import 'server-only';

import { NextResponse } from 'next/server';

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
let rateLimitChecks = 0;

export class RequestSecurityError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'RequestSecurityError';
        this.status = status;
    }
}

const getForwardedOrigin = (request: Request) => {
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

    if (!forwardedHost || !forwardedProtocol) {
        return '';
    }

    return `${forwardedProtocol}://${forwardedHost}`;
};

const getConfiguredOrigins = () => {
    return [process.env.APP_ORIGIN, process.env.ALLOWED_ORIGINS]
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean);
};

export const assertTrustedMutationRequest = (request: Request) => {
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite === 'cross-site') {
        throw new RequestSecurityError('Запрос с внешнего сайта отклонен', 403);
    }

    const origin = request.headers.get('origin');
    if (!origin) {
        if (fetchSite === 'same-origin' || (process.env.NODE_ENV !== 'production' && !fetchSite)) {
            return;
        }

        throw new RequestSecurityError('Не удалось подтвердить источник запроса', 403);
    }

    const configuredOrigins = getConfiguredOrigins();
    if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
        throw new RequestSecurityError('APP_ORIGIN не настроен на сервере', 500);
    }

    const allowedOrigins = new Set<string>(
        configuredOrigins.length > 0
            ? configuredOrigins
            : [
                new URL(request.url).origin,
                getForwardedOrigin(request),
            ].filter(Boolean),
    );

    if (!allowedOrigins.has(origin)) {
        throw new RequestSecurityError('Источник запроса не разрешен', 403);
    }
};

export const assertContentLength = (request: Request, maximumBytes: number) => {
    const rawContentLength = request.headers.get('content-length');
    if (!rawContentLength) {
        return;
    }

    const contentLength = Number.parseInt(rawContentLength, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
        throw new RequestSecurityError('Некорректный размер запроса', 400);
    }

    if (contentLength > maximumBytes) {
        throw new RequestSecurityError('Размер запроса превышает допустимый лимит', 413);
    }
};

export const readJsonBody = async <T = Record<string, unknown>>(
    request: Request,
    maximumBytes: number,
): Promise<T> => {
    assertContentLength(request, maximumBytes);

    if (!request.body) {
        throw new RequestSecurityError('Тело запроса отсутствует', 400);
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let bodyText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        totalBytes += value.byteLength;
        if (totalBytes > maximumBytes) {
            await reader.cancel();
            throw new RequestSecurityError('Размер запроса превышает допустимый лимит', 413);
        }

        bodyText += decoder.decode(value, { stream: true });
    }

    bodyText += decoder.decode();

    try {
        return JSON.parse(bodyText) as T;
    } catch {
        throw new RequestSecurityError('Передан некорректный JSON', 400);
    }
};

export const getClientIdentifier = (request: Request, userId?: string) => {
    if (userId) {
        return `user:${userId}`;
    }

    const realIp = request.headers.get('x-real-ip')?.trim();
    const forwardedAddresses = request.headers.get('x-forwarded-for')
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const closestForwardedAddress = forwardedAddresses?.at(-1);
    return `ip:${realIp || closestForwardedAddress || 'unknown'}`;
};

const cleanupExpiredRateLimits = (now: number) => {
    rateLimitChecks += 1;
    if (rateLimitChecks % 200 !== 0) {
        return;
    }

    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt <= now) {
            rateLimitStore.delete(key);
        }
    }
};

export const assertRateLimit = (
    scope: string,
    identifier: string,
    maximumRequests: number,
    windowMilliseconds: number,
) => {
    const now = Date.now();
    cleanupExpiredRateLimits(now);

    const key = `${scope}:${identifier}`;
    const currentEntry = rateLimitStore.get(key);

    if (!currentEntry || currentEntry.resetAt <= now) {
        rateLimitStore.set(key, {
            count: 1,
            resetAt: now + windowMilliseconds,
        });
        return;
    }

    if (currentEntry.count >= maximumRequests) {
        throw new RequestSecurityError('Слишком много запросов. Повторите попытку позже.', 429);
    }

    currentEntry.count += 1;
};

export const securityErrorResponse = (error: unknown) => {
    if (!(error instanceof RequestSecurityError)) {
        return null;
    }

    return NextResponse.json({ error: error.message }, { status: error.status });
};

export const escapeHtml = (value: string) => {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
};
