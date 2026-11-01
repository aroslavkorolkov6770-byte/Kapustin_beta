export type AiTopicRestriction = {
    code: 'VPN';
    response: string;
};

type RestrictedAiTopic = AiTopicRestriction & {
    patterns: RegExp[];
};

const VPN_RESTRICTION_RESPONSE = 'Я не могу ответить на данный вопрос.';

const RESTRICTED_AI_TOPICS: RestrictedAiTopic[] = [
    {
        code: 'VPN',
        response: VPN_RESTRICTION_RESPONSE,
        patterns: [
            /(?:^|[^\p{L}\p{N}])[vв][\s._-]*[pрп][\s._-]*[nнh](?=$|[^\p{L}\p{N}])/iu,
            /\bvirtual\s+private\s+networks?\b/iu,
            /виртуальн\p{L}*\s+частн\p{L}*\s+сет\p{L}*/iu,
        ],
    },
];

export const getAiTopicRestriction = (question: string): AiTopicRestriction | null => {
    const normalizedQuestion = question.normalize('NFKC').trim();
    if (!normalizedQuestion) {
        return null;
    }

    // Проверка выполняется до вызова провайдера, поэтому запрещенная тема не расходует токены.
    const restriction = RESTRICTED_AI_TOPICS.find((topic) => (
        topic.patterns.some((pattern) => pattern.test(normalizedQuestion))
    ));

    if (!restriction) {
        return null;
    }

    return {
        code: restriction.code,
        response: restriction.response,
    };
};
