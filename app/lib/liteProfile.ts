export type LiteProfile = {
    avatar: string;
    firstLogin?: string;
    name?: string;
};

// Сокращённая бета хранит только сведения, нужные для отображения профиля.
// Одинаковый фильтр используется обычным API профиля и совместимым JSON-хранилищем.
export const toLiteProfile = (value: unknown): LiteProfile => {
    const profile = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

    return {
        avatar: typeof profile.avatar === 'string' ? profile.avatar : '',
        ...(typeof profile.firstLogin === 'string' ? { firstLogin: profile.firstLogin } : {}),
        ...(typeof profile.name === 'string' ? { name: profile.name } : {}),
    };
};
