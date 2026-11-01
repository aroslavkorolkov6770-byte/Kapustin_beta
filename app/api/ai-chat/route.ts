import { NextResponse } from 'next/server';
import { AliceAiRequestError, extractAliceText, type AliceInputMessage, requestAliceAi } from '@/app/lib/aliceAi';
import { buildLiveLmsContext, buildSelectedDocumentContext, synchronizeAiKnowledge } from '@/app/lib/aiKnowledge';
import { getAiTopicRestriction } from '@/app/lib/aiTopicPolicy';
import { requireSession } from '@/app/lib/serverAuth';
import {
    assertRateLimit,
    assertTrustedMutationRequest,
    getClientIdentifier,
    readJsonBody,
    securityErrorResponse,
} from '@/app/lib/serverSecurity';

type IncomingMessage = {
    role?: string;
    content?: unknown;
};

type YandexInputMessage = {
    role: 'user' | 'assistant';
    content: Array<{
        type: 'input_text' | 'output_text';
        text: string;
    }>;
};

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARACTERS = 12_000;
const MAX_TOTAL_CHARACTERS = 25_000;
const USER_QUESTION_MARKER = 'ВОПРОС ПОЛЬЗОВАТЕЛЯ:';
const MARKDOWN_STAR_CHARACTERS = /[*＊﹡∗⁎⁕✱✲✳]/gu;
const INTERNAL_LMS_LINK = /(?:https?:\/\/(?:www\.)?tea-hub\.ru)?\/tasks\?[^\s<>"'`]+/gu;

let initialKnowledgeSyncPromise: Promise<unknown> | null = null;

const limitText = (text: string, maxCharacters: number): string => {
    if (text.length <= maxCharacters) {
        return text;
    }

    // Сохраняем начало контекста и конец сообщения, где обычно находится
    // актуальный вопрос пользователя.
    const headLength = Math.floor(maxCharacters * 0.65);
    const tailLength = maxCharacters - headLength;

    return `${text.slice(0, headLength)}\n\n[Контекст сокращен]\n\n${text.slice(-tailLength)}`;
};

const normalizeRole = (role: string | undefined): 'user' | 'assistant' => {
    if (role === 'assistant') {
        return role;
    }

    return 'user';
};

const normalizeContentText = (content: unknown): string => {
    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        const textParts = content
            .map((item) => {
                if (typeof item === 'string') {
                    return item.trim();
                }

                if (item && typeof item === 'object' && 'text' in item) {
                    const textValue = (item as { text?: unknown }).text;
                    return typeof textValue === 'string' ? textValue.trim() : '';
                }

                return '';
            })
            .filter(Boolean);

        return textParts.join('\n').trim();
    }

    return '';
};

const extractCurrentQuestion = (messages: IncomingMessage[]): string => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (normalizeRole(messages[index].role) !== 'user') {
            continue;
        }

        const content = normalizeContentText(messages[index].content);
        const markerIndex = content.lastIndexOf(USER_QUESTION_MARKER);
        return markerIndex >= 0
            ? content.slice(markerIndex + USER_QUESTION_MARKER.length).trim()
            : content;
    }

    return '';
};

const replaceCurrentQuestion = (messages: IncomingMessage[], question: string): IncomingMessage[] => {
    const normalizedMessages = messages.map((message) => ({ ...message }));
    for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
        if (normalizeRole(normalizedMessages[index].role) === 'user') {
            normalizedMessages[index].content = question;
            break;
        }
    }

    return normalizedMessages;
};

const ensureInitialKnowledgeSync = () => {
    if (!initialKnowledgeSyncPromise) {
        initialKnowledgeSyncPromise = synchronizeAiKnowledge().catch((error) => {
            console.error('Не удалось выполнить начальную синхронизацию базы знаний AI:', error);
            return null;
        });
    }

    return initialKnowledgeSyncPromise;
};

const mapMessagesToYandexInput = (messages: IncomingMessage[]): YandexInputMessage[] => {
    return messages
        .map((message) => {
            const normalizedRole = normalizeRole(message.role);
            const text = limitText(normalizeContentText(message.content), MAX_MESSAGE_CHARACTERS);

            if (!text) {
                return null;
            }

            return {
                role: normalizedRole,
                content: [
                    {
                        type: normalizedRole === 'assistant' ? 'output_text' : 'input_text',
                        text,
                    },
                ],
            } satisfies YandexInputMessage;
        })
        .filter((message): message is YandexInputMessage => Boolean(message));
};

const countCharacters = (messages: YandexInputMessage[]): number => messages.reduce((sum, message) => {
    return sum + message.content.reduce((messageSum, item) => messageSum + item.text.length, 0);
}, 0);

const compactInputForProvider = (messages: YandexInputMessage[]): YandexInputMessage[] => {
    const compacted = messages.slice(-MAX_HISTORY_MESSAGES);

    // Сначала убираем самые старые сообщения, сохраняя весь последний вопрос
    // и ближайшую часть диалога для связности ответа.
    while (compacted.length > 1 && countCharacters(compacted) > MAX_TOTAL_CHARACTERS) {
        compacted.shift();
    }

    if (countCharacters(compacted) <= MAX_TOTAL_CHARACTERS) {
        return compacted;
    }

    const lastMessage = compacted[compacted.length - 1];
    const lastItem = lastMessage?.content[0];
    if (lastItem) {
        lastItem.text = limitText(lastItem.text, MAX_TOTAL_CHARACTERS);
    }

    return compacted;
};

const hideInternalIdentifiers = (value: string): string => {
    const links: string[] = [];
    const textWithMaskedLinks = value.replace(INTERNAL_LMS_LINK, (link) => {
        const placeholder = `__LMS_LINK_${links.length}__`;
        links.push(link);
        return placeholder;
    });
    const cleanedText = textWithMaskedLinks
        .replace(/\b(?:id|ид|идентификатор)(?:\s+(?:документа|темы|теста|товара|источника|файла))?\s*[:№#-]?\s*[a-z0-9][a-z0-9_-]{2,}/giu, '')
        .replace(/\b(?:file|document|topic|test|product|route|lms|chat|msg)_[a-z0-9_-]{3,}\b/giu, '')
        .replace(/[ \t]{2,}/gu, ' ')
        .replace(/\n[ \t]+/gu, '\n')
        .replace(/\n{3,}/gu, '\n\n');

    return links.reduce((result, link, index) => {
        return result.replace(`__LMS_LINK_${index}__`, link);
    }, cleanedText).trim();
};

const sanitizeAiPlainText = (value: string): string => hideInternalIdentifiers(
    value
        .replace(/\r\n?/gu, '\n')
        .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/gu, '$1 $2')
        .replace(/\\([*_`~#>])/gu, '$1')
        .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
        .replace(/^\s{0,3}>\s?/gmu, '')
        .replace(MARKDOWN_STAR_CHARACTERS, '')
        .replace(/[`~]/gu, '')
        .replace(/(^|\n)\s*[-+]\s+/gmu, '$1')
        .replace(/\n{3,}/gu, '\n\n')
        .trim(),
);

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await requireSession();
        if (!session) {
            return NextResponse.json({ error: 'Требуется вход в систему' }, { status: 401 });
        }

        assertRateLimit('ai-chat', getClientIdentifier(request, session.id), 30, 5 * 60 * 1000);
        const body = await readJsonBody<{ messages?: unknown; documentId?: unknown }>(request, 64 * 1024);
        const messages = Array.isArray(body.messages)
            ? body.messages.slice(-MAX_HISTORY_MESSAGES) as IncomingMessage[]
            : [];

        const currentQuestion = extractCurrentQuestion(messages);
        if (!currentQuestion) {
            return NextResponse.json({ error: 'Сообщения для ИИ не переданы' }, { status: 400 });
        }

        const topicRestriction = getAiTopicRestriction(currentQuestion);
        if (topicRestriction) {
            return NextResponse.json({ output_text: topicRestriction.response });
        }

        const selectedDocumentId = typeof body.documentId === 'string'
            ? body.documentId.trim().slice(0, 200)
            : '';
        void ensureInitialKnowledgeSync();
        const [liveLmsContext, selectedDocumentContext] = await Promise.all([
            buildLiveLmsContext(currentQuestion),
            selectedDocumentId ? buildSelectedDocumentContext(selectedDocumentId) : Promise.resolve(''),
        ]);
        const compactedMessages = compactInputForProvider(
            mapMessagesToYandexInput(replaceCurrentQuestion(messages, currentQuestion)),
        );
        const yandexInput: AliceInputMessage[] = [
            {
                role: 'system',
                content: [{
                    type: 'input_text',
                    text: selectedDocumentContext
                        ? `${liveLmsContext}\n\n${selectedDocumentContext}`
                        : liveLmsContext,
                }],
            },
            ...compactedMessages,
        ];

        if (yandexInput.length === 0) {
            return NextResponse.json({ error: 'Сообщения для ИИ не переданы' }, { status: 400 });
        }

        const data = await requestAliceAi(yandexInput);
        const plainText = sanitizeAiPlainText(extractAliceText(data));
        if (!plainText) {
            return NextResponse.json({ error: 'AI не вернул текст ответа' }, { status: 502 });
        }

        return NextResponse.json({ output_text: plainText });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        if (error instanceof AliceAiRequestError) {
            const details = error.details.toLowerCase();
            console.error('Ошибка AI-провайдера:', error.status, error.details);

            if (details.includes('ai_project_id is missing')) {
                return NextResponse.json(
                    { error: 'AI не настроен: укажите AI_PROJECT_ID на сервере' },
                    { status: 503 },
                );
            }

            if (error.status === 401) {
                return NextResponse.json(
                    { error: 'AI-ключ не принят Yandex Cloud: проверьте ключ на сервере' },
                    { status: 502 },
                );
            }

            if (error.status === 403 || details.includes('permission') || details.includes('exec denied')) {
                return NextResponse.json(
                    { error: 'У AI-ключа нет прав на проект, prompt или базу знаний Yandex Cloud' },
                    { status: 502 },
                );
            }

            const quotaExceeded = error.status === 429
                || error.status === 402
                || details.includes('quota')
                || details.includes('resource_exhausted')
                || details.includes('billing')
                || details.includes('balance');
            const status = quotaExceeded ? 429 : 502;
            const message = quotaExceeded
                ? 'Закончились токены, просьба обратиться к администратору'
                : 'AI-сервис временно недоступен';
            return NextResponse.json({ error: message }, { status });
        }

        console.error('Внутренняя ошибка AI-чата:', error);
        return NextResponse.json({ error: 'Не удалось получить ответ AI-ассистента' }, { status: 500 });
    }
}
