import OpenAI from 'openai';

export type AliceInputMessage = {
    role: 'user' | 'assistant' | 'system';
    content: Array<{
        type: 'input_text' | 'output_text';
        text: string;
    }>;
};

const DEFAULT_AI_PROJECT_ID = 'b1gggcekj6heiblum23f';
const DEFAULT_AI_PROMPT_ID = 'fvth3ukik96j74cfqu17';
const DEFAULT_AI_VECTOR_STORE_ID = 'fvt76sm8vtdbo4m77tk5';
const AI_API_BASE_URL = 'https://ai.api.cloud.yandex.net/v1';
const AI_KNOWLEDGE_MANAGED_BY = 'tea_hub_current';

type AliceAiRequestOptions = {
    useKnowledgeTools?: boolean;
};

export type AliceAiConfig = {
    apiKey: string;
    projectId: string;
    promptId: string;
    vectorStoreId: string;
};

const stringifyInput = (input: AliceInputMessage[]): string => input
    .map((message) => {
        const text = message.content
            .map((contentItem) => contentItem.text)
            .filter(Boolean)
            .join('\n');

        return `${message.role.toUpperCase()}:\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');

const getErrorStatus = (error: unknown): number => {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status?: unknown }).status;
        if (typeof status === 'number') {
            return status;
        }
    }

    return 502;
};

const getErrorDetails = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message.slice(0, 2000);
    }

    try {
        return JSON.stringify(error).slice(0, 2000);
    } catch {
        return 'Unknown AI provider error';
    }
};

export class AliceAiRequestError extends Error {
    status: number;
    details: string;

    constructor(message: string, status: number, details: string) {
        super(message);
        this.name = 'AliceAiRequestError';
        this.status = status;
        this.details = details;
    }
}

export async function requestAliceAi(
    input: AliceInputMessage[],
    options: AliceAiRequestOptions = {},
): Promise<unknown> {
    const config = getAliceAiConfig();
    const useKnowledgeTools = options.useKnowledgeTools ?? true;

    try {
        const client = createAliceAiClient(config);
        const fileSearchTool = {
            type: 'file_search' as const,
            vector_store_ids: [config.vectorStoreId],
            max_num_results: 15,
            filters: {
                type: 'eq' as const,
                key: 'managed_by',
                value: AI_KNOWLEDGE_MANAGED_BY,
            },
        };
        const webSearchTool = {
            type: 'web_search' as const,
            filters: {
                allowed_domains: ['tea-hub.ru'],
            },
            search_context_size: 'medium' as const,
            user_location: {
                type: 'approximate' as const,
                region: '225',
            },
        };
        const knowledgeTools = process.env.AI_ENABLE_WEB_SEARCH?.trim().toLowerCase() === 'true'
            ? [fileSearchTool, webSearchTool]
            : [fileSearchTool];

        const response = await client.responses.create({
            prompt: {
                id: config.promptId,
            },
            input: stringifyInput(input),
            ...(useKnowledgeTools
                ? {
                    tools: knowledgeTools,
                }
                : {}),
        });

        const providerError = getResponseError(response);
        if (providerError) {
            const status = isQuotaError(providerError.code, providerError.message) ? 429 : 502;
            throw new AliceAiRequestError(
                `Ошибка AI-провайдера ${status}`,
                status,
                `${providerError.code}: ${providerError.message}`.slice(0, 2000),
            );
        }

        return response;
    } catch (error) {
        if (error instanceof AliceAiRequestError) {
            throw error;
        }

        throw new AliceAiRequestError(`Ошибка AI-провайдера ${getErrorStatus(error)}`, getErrorStatus(error), getErrorDetails(error));
    }
}

export function getAliceAiConfig(): AliceAiConfig {
    const apiKey = process.env.AI_API_KEY?.trim() || '';
    const projectId = (
        process.env.AI_PROJECT_ID
        || process.env.YANDEX_PROJECT_ID
        || DEFAULT_AI_PROJECT_ID
    ).trim();
    const promptId = (
        process.env.AI_PROMPT_ID
        || process.env.YANDEX_PROMPT_ID
        || DEFAULT_AI_PROMPT_ID
    ).trim();
    const vectorStoreId = (
        process.env.AI_VECTOR_STORE_ID
        || process.env.YANDEX_VECTOR_STORE_ID
        || DEFAULT_AI_VECTOR_STORE_ID
    ).trim();

    if (!apiKey) {
        throw new AliceAiRequestError('AI API ключ не настроен на сервере', 500, 'AI API key is missing');
    }

    if (!projectId) {
        throw new AliceAiRequestError(
            'AI не настроен: не указан идентификатор проекта Yandex Cloud',
            500,
            'AI_PROJECT_ID is missing. Set AI_PROJECT_ID to the project used by the AI Studio prompt.',
        );
    }

    if (!promptId) {
        throw new AliceAiRequestError(
            'AI не настроен: не указан идентификатор prompt Yandex Cloud',
            500,
            'AI_PROMPT_ID is missing. Set AI_PROMPT_ID to the prompt used by the LMS.',
        );
    }

    if (!vectorStoreId) {
        throw new AliceAiRequestError(
            'AI не настроен: не указан идентификатор базы знаний Yandex Cloud',
            500,
            'AI_VECTOR_STORE_ID is missing. Set AI_VECTOR_STORE_ID to the LMS vector store.',
        );
    }

    return { apiKey, projectId, promptId, vectorStoreId };
}

export function createAliceAiClient(config: AliceAiConfig = getAliceAiConfig()): OpenAI {
    return new OpenAI({
        apiKey: config.apiKey,
        baseURL: AI_API_BASE_URL,
        defaultHeaders: {
            'OpenAI-Project': config.projectId,
        },
        timeout: 45_000,
    });
}

export function isAliceAiConfigured(): boolean {
    return Boolean(process.env.AI_API_KEY?.trim());
}

const getResponseError = (response: unknown) => {
    if (!response || typeof response !== 'object') {
        return null;
    }

    const providerError = (response as { error?: unknown }).error;
    if (!providerError || typeof providerError !== 'object') {
        return null;
    }

    const code = String((providerError as { code?: unknown }).code || '').trim();
    const message = String((providerError as { message?: unknown }).message || '').trim();
    return code || message ? { code, message } : null;
};

const isQuotaError = (code: string, message: string): boolean => {
    const normalized = `${code} ${message}`.toLowerCase();
    return [
        'rate_limit',
        'quota',
        'resource_exhausted',
        'billing',
        'balance',
        'token limit',
        'too many requests',
    ].some((marker) => normalized.includes(marker));
};

export function extractAliceText(data: unknown): string {
    if (!data || typeof data !== 'object') {
        return '';
    }

    const response = data as {
        output?: unknown;
        output_text?: unknown;
        text?: unknown;
        message?: { text?: unknown };
        result?: { alternatives?: Array<{ message?: { text?: unknown } }> };
    };

    if (Array.isArray(response.output)) {
        for (const outputItem of response.output) {
            if (!outputItem || typeof outputItem !== 'object') {
                continue;
            }

            const content = (outputItem as { content?: unknown }).content;
            if (!Array.isArray(content)) {
                continue;
            }

            for (const contentItem of content) {
                if (contentItem && typeof contentItem === 'object') {
                    const text = (contentItem as { text?: unknown }).text;
                    if (typeof text === 'string' && text.trim()) {
                        return text.trim();
                    }
                }
            }
        }
    }

    const fallbackValues = [
        response.output_text,
        response.text,
        response.message?.text,
        response.result?.alternatives?.[0]?.message?.text,
    ];

    const fallbackText = fallbackValues.find((value) => typeof value === 'string' && value.trim());
    return typeof fallbackText === 'string' ? fallbackText.trim() : '';
}
