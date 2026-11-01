// Совместимый ответ для старых расширений: регистрация внешней подписки не выполняется.
export type WebPushRegistrationResult = { success: boolean; message: string };
export const getPushBindingStorageKey = (userId: string) => `th_push_bound_${userId}`;
export const registerWebPushForUser = (): Promise<WebPushRegistrationResult> => Promise.resolve({
    success: false,
    message: 'Уведомления доступны в личном кабинете.',
});
