type NotificationDraft = {
    title: string;
    text: string;
    target: string;
};

// Сообщение сохраняется только в хранилище личного кабинета; внешней доставки здесь нет.
export const createInAppNotification = async (draft: NotificationDraft) => {
    try {
        const response = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || 'Не удалось сохранить уведомление');
        return result.notification;
    } catch (error) {
        console.error('Ошибка сохранения уведомления в личном кабинете:', error);
        throw error;
    }
};
