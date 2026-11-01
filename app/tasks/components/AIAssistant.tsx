"use client";
import React, { useState, useEffect, useEffectEvent, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CustomIcon from '@/app/components/CustomIcon';
import { isClientAdminView } from '@/app/lib/authClient';

interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    timestamp: string;
}

interface ChatSession {
    id: string;
    title: string;
    messages: Message[];
    updatedAt: number;
    isPinned?: boolean; 
    documentId?: string;
}

const MAX_AI_HISTORY_MESSAGES = 10;
const MAX_AI_HISTORY_MESSAGE_CHARACTERS = 3_500;
const MAX_AI_CURRENT_MESSAGE_CHARACTERS = 12_000;
const MARKDOWN_STAR_CHARACTERS = /[*＊﹡∗⁎⁕✱✲✳]/gu;
const INTERNAL_LMS_LINK = /(?:https?:\/\/(?:www\.)?tea-hub\.ru)?\/tasks\?[^\s<>"'`]+/gu;

const limitAiText = (value: string, maxCharacters: number): string => {
    if (value.length <= maxCharacters) {
        return value;
    }

    // Оставляем конец текста, потому что там находится текущий вопрос
    // пользователя и самые свежие найденные совпадения.
    const headLength = Math.floor(maxCharacters * 0.65);
    const tailLength = maxCharacters - headLength;

    return `${value.slice(0, headLength)}\n\n[Контекст сокращен]\n\n${value.slice(-tailLength)}`;
};

const normalizeSearchValue = (value: unknown) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const normalizeAiHref = (value: string): string | null => {
    const trimmedValue = value.trim().replace(/[.,!?;:)\]]+$/u, '');

    try {
        const parsedUrl = new URL(trimmedValue, 'https://tea-hub.ru');
        const isInternalHost = parsedUrl.hostname === 'tea-hub.ru' || parsedUrl.hostname === 'www.tea-hub.ru';
        if (!isInternalHost || parsedUrl.pathname !== '/tasks') {
            return null;
        }

        return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } catch {
        return null;
    }
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

const cleanAiMessageText = (value: string): string => hideInternalIdentifiers(
    value
        .replace(/\r\n?/gu, '\n')
        .replace(/\\([*_`~#>])/gu, '$1')
        .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
        .replace(/^\s{0,3}>\s?/gmu, '')
        .replace(MARKDOWN_STAR_CHARACTERS, '')
        .replace(/[`~]/gu, '')
        .replace(/(^|\n)\s*[-+]\s+/gmu, '$1')
        .replace(/\n{3,}/gu, '\n\n')
        .trim(),
);

const prepareAiMessageText = (value: string): string => cleanAiMessageText(
    value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/gu, (...matches: string[]) => {
        const label = matches[1] || '';
        const href = matches[2] || '';
        const safeHref = normalizeAiHref(href);
        return safeHref ? `${label} ${safeHref}` : label;
    }),
);

const getAiLinkLabel = (href: string): string => {
    try {
        const parsedUrl = new URL(href, 'https://tea-hub.ru');
        if (parsedUrl.searchParams.has('routeId')) {
            return 'Открыть урок';
        }

        if (parsedUrl.searchParams.has('testId')) {
            return 'Открыть тест';
        }

        if (parsedUrl.searchParams.has('documentId')) {
            return 'Открыть документ';
        }

        if (parsedUrl.searchParams.has('productId')) {
            return 'Открыть карточку товара';
        }
    } catch {
        return 'Открыть';
    }

    return 'Открыть раздел';
};

const renderAiMessage = (value: string): React.ReactNode => {
    const messageText = prepareAiMessageText(value);
    const linkPattern = /(?:https?:\/\/[^\s<>"'`]+|\/tasks\?[^\s<>"'`]+)/gu;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    let linkIndex = 0;

    while ((match = linkPattern.exec(messageText)) !== null) {
        const rawLink = match[0];
        const safeHref = normalizeAiHref(rawLink);
        if (!safeHref) {
            continue;
        }

        if (match.index > cursor) {
            parts.push(messageText.slice(cursor, match.index));
        }

        parts.push(
            <a
                key={`ai-link-${linkIndex}`}
                href={safeHref}
                className="ai-message-link"
            >
                {getAiLinkLabel(safeHref)}
            </a>,
        );
        linkIndex += 1;
        cursor = match.index + rawLink.length;
    }

    if (parts.length === 0) {
        return messageText;
    }

    if (cursor < messageText.length) {
        parts.push(messageText.slice(cursor));
    }

    return parts;
};

const extractAiResponseText = (data: Record<string, unknown>): string => {
    const output = Array.isArray(data.output) ? data.output : [];
    const outputParts = output.flatMap((item) => {
        if (!item || typeof item !== 'object') {
            return [];
        }

        const content = (item as { content?: unknown }).content;
        if (!Array.isArray(content)) {
            return [];
        }

        return content.flatMap((contentItem) => {
            if (!contentItem || typeof contentItem !== 'object') {
                return [];
            }

            const text = (contentItem as { text?: unknown }).text;
            return typeof text === 'string' && text.trim() ? [text.trim()] : [];
        });
    });

    if (outputParts.length > 0) {
        return outputParts.join('\n\n');
    }

    const message = data.message;
    const messageText = message && typeof message === 'object'
        ? (message as { text?: unknown; content?: unknown })
        : {};
    const fallbackValues: unknown[] = [
        data.output_text,
        data.text,
        messageText.text,
        typeof messageText.content === 'string' ? messageText.content : '',
    ];
    const fallbackText = fallbackValues.find((item) => typeof item === 'string' && item.trim());
    return typeof fallbackText === 'string' ? fallbackText.trim() : '';
};

export default function AIAssistant({ userId, isAdmin }: { userId?: string, isAdmin?: boolean }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
    const [historyQuery, setHistoryQuery] = useState("");
    const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
    
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const handledDocumentRequestRef = useRef('');

    // =========================================================================
    // ОПРЕДЕЛЕНИЕ ПОЛЬЗОВАТЕЛЯ (АДМИН - 100% ПРИОРИТЕТ)
    // =========================================================================
    useEffect(() => {
        const determineUser = () => {
            const storedUserId = localStorage.getItem('current_user_id') || localStorage.getItem('login') || localStorage.getItem('userId');
            const isSystemAccount = localStorage.getItem('is_system_account') === 'true';
            const isAdminView = isAdmin === true || isClientAdminView();

            if (isSystemAccount && isAdminView) {
                const normalizedSystemId = String(userId || storedUserId || 'system').replace(/[^a-zA-Z0-9_-]/g, '_');
                return `system_admin_${normalizedSystemId}`;
            }

            if (isAdminView || userId === 'admin') {
                return 'admin_master'; 
            }

            if (userId && userId !== 'guest' && userId.trim() !== '') {
                return 'emp_' + String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
            }

            const foundId = storedUserId;
            if (foundId && foundId !== 'guest' && foundId !== 'null') {
                return 'emp_' + String(foundId).replace(/[^a-zA-Z0-9_-]/g, '_');
            }

            let guestId = localStorage.getItem('th_stable_guest_id');
            if (!guestId) {
                guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('th_stable_guest_id', guestId);
            }
            return guestId;
        };

        const activeUser = determineUser();
        const userIdTimer = window.setTimeout(() => setCurrentUserId(activeUser), 0);

        const loadHistory = async () => {
            let serverDataFound = false;
            try {
                const res = await fetch(`/api/storage?key=th_ai_history_${activeUser}&t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setSessions(data);
                        setActiveSessionId(data[0].id);
                        serverDataFound = true;
                    }
                }
            } catch {
                console.warn("Сервер недоступен, читаем из памяти");
            }

            if (!serverDataFound) {
                const savedSessions = localStorage.getItem(`th_ai_history_${activeUser}`);
                if (savedSessions) {
                    try {
                        const parsed = JSON.parse(savedSessions);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setSessions(parsed);
                            setActiveSessionId(parsed[0].id);
                        }
                    } catch {}
                }
            }

            setIsHistoryLoaded(true);
        };

        loadHistory();
        return () => window.clearTimeout(userIdTimer);
    }, [userId, isAdmin]); 

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [sessions, activeSessionId, isTyping]);

    useEffect(() => {
        if (!showClearConfirm) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowClearConfirm(false);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [showClearConfirm]);

    const saveSessions = (newSessions: ChatSession[]) => {
        setSessions(newSessions);
        if (!currentUserId) return;

        localStorage.setItem(`th_ai_history_${currentUserId}`, JSON.stringify(newSessions));
        
        fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: `th_ai_history_${currentUserId}`,
                data: newSessions 
            })
        }).catch(err => console.error("Ошибка сохранения на сервер", err));
    };

    const focusComposer = () => {
        window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    const createNewSession = () => {
        const existingEmptySession = sessions.find((session) => session.messages.length === 0);

        if (existingEmptySession) {
            setActiveSessionId(existingEmptySession.id);
            setHistoryQuery("");
            setIsMobileHistoryOpen(false);
            focusComposer();
            return;
        }

        const newSession: ChatSession = {
            id: `chat_${Date.now()}`,
            title: "Новый диалог",
            messages: [],
            updatedAt: Date.now()
        };
        saveSessions([newSession, ...sessions]);
        setActiveSessionId(newSession.id);
        setHistoryQuery("");
        setIsMobileHistoryOpen(false);
        focusComposer();
    };

    const clearHistory = () => {
        saveSessions([]);
        setActiveSessionId(null);
        setShowClearConfirm(false);
        setIsMobileHistoryOpen(false);
    };

    const deleteSession = (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation(); 
        const filtered = sessions.filter((s: ChatSession) => s.id !== sessionId);
        saveSessions(filtered);
        
        if (activeSessionId === sessionId) {
            setActiveSessionId(filtered.length > 0 ? sortedSessions.filter(s => s.id !== sessionId)[0]?.id || null : null);
        }
    };

    const togglePin = (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = sessions.map(s => s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s);
        saveSessions(updated);
    };

    const sortedSessions = [...sessions].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.updatedAt - a.updatedAt;
    });

    const normalizedHistoryQuery = normalizeSearchValue(historyQuery);
    const visibleSessions = sortedSessions.filter((session) => {
        if (!normalizedHistoryQuery) {
            return true;
        }

        return normalizeSearchValue(`${session.title} ${session.messages.map((message) => message.content).join(' ')}`).includes(normalizedHistoryQuery);
    });

    const formatMessageCount = (count: number) => {
        const lastTwoDigits = count % 100;
        const lastDigit = count % 10;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
            return `${count} сообщений`;
        }

        if (lastDigit === 1) {
            return `${count} сообщение`;
        }

        if (lastDigit >= 2 && lastDigit <= 4) {
            return `${count} сообщения`;
        }

        return `${count} сообщений`;
    };

    const handleSendMessage = async (
        text: string,
        options: { documentId?: string; newSession?: boolean } = {},
    ) => {
        if (!text.trim() || !currentUserId || isTyping) return;

        let currentActiveId = options.newSession ? null : activeSessionId;
        let currentSessions = [...sessions];

        if (!currentActiveId || currentSessions.length === 0) {
            const newSession: ChatSession = {
                id: `chat_${Date.now()}`,
                title: text.slice(0, 25) + "...",
                messages: [],
                updatedAt: Date.now(),
                ...(options.documentId ? { documentId: options.documentId } : {}),
            };
            currentSessions = [newSession, ...currentSessions];
            currentActiveId = newSession.id;
            setActiveSessionId(currentActiveId);
        }

        const userMsg: Message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const updatedSessions = currentSessions.map((s: ChatSession) => {
            if (s.id === currentActiveId) {
                const newTitle = s.messages.length === 0 ? text.slice(0, 25) + "..." : s.title;
                return {
                    ...s,
                    title: newTitle,
                    messages: [...s.messages, userMsg],
                    updatedAt: Date.now(),
                    ...(options.documentId ? { documentId: options.documentId } : {}),
                };
            }
            return s;
        }); 

        saveSessions(updatedSessions);
        setInputValue("");
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
        setIsTyping(true);

        try {
            const currentSession = updatedSessions.find((s: ChatSession) => s.id === currentActiveId);
            const activeDocumentId = options.documentId || currentSession?.documentId;

            const recentMessages = currentSession?.messages.slice(-MAX_AI_HISTORY_MESSAGES) || [];
            const apiMessages = recentMessages.map((message, index) => {
                const maxCharacters = index === recentMessages.length - 1
                    ? MAX_AI_CURRENT_MESSAGE_CHARACTERS
                    : MAX_AI_HISTORY_MESSAGE_CHARACTERS;

                return {
                    role: message.role === 'ai' ? 'assistant' : 'user',
                    content: limitAiText(message.content, maxCharacters),
                };
            });

            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    ...(activeDocumentId ? { documentId: activeDocumentId } : {}),
                })
            });

            const data = await response.json() as Record<string, unknown>;

            if (data.error) {
                const errStr = JSON.stringify(data.error).toLowerCase();
                if (errStr.includes('quota') || errStr.includes('token') || errStr.includes('токен') || errStr.includes('limit') || errStr.includes('баланс') || errStr.includes('429')) {
                    throw new Error("TOKEN_LIMIT_EXCEEDED");
                }
                throw new Error(JSON.stringify(data.error));
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);

            let aiText = extractAiResponseText(data);

            if (!aiText) {
                aiText = `СЫРОЙ ОТВЕТ ЯНДЕКСА:\n${JSON.stringify(data, null, 2)}`;
            }

            aiText = prepareAiMessageText(aiText);

            const aiMsg: Message = {
                id: `msg_${Date.now() + 1}`,
                role: 'ai',
                content: aiText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            const finalSessions = updatedSessions.map((s: ChatSession) => 
                s.id === currentActiveId ? { ...s, messages: [...s.messages, aiMsg] } : s
            );
            saveSessions(finalSessions);

        } catch (error: unknown) {
            console.error("ОШИБКА:", error);

            const errorText = error instanceof Error ? error.message : String(error || 'Неизвестная ошибка');
            let displayError = `СИСТЕМНАЯ ОШИБКА:\n\n${errorText}`;
            const errStr = errorText.toLowerCase();
            
            if (errStr.includes('token') || errStr.includes('токен') || errStr.includes('quota') || errStr.includes('429') || errStr.includes('402') || errStr.includes('limit') || errStr.includes('баланс') || errStr.includes('too many requests')) {
                displayError = "Закончились токены, просьба обратиться к администратору.";
            }

            const errorMsg: Message = {
                id: `msg_${Date.now() + 1}`, role: 'ai',
                content: displayError,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            const finalSessions = updatedSessions.map((s: ChatSession) => 
                s.id === currentActiveId ? { ...s, messages: [...s.messages, errorMsg] } : s
            );
            saveSessions(finalSessions);
        } finally {
            setIsTyping(false); 
        }
    };

    const sendDocumentQuestion = useEffectEvent((question: string, documentId: string) => {
        void handleSendMessage(question, { documentId, newSession: true });
    });

    useEffect(() => {
        const documentId = searchParams.get('askDocumentId')?.trim() || '';
        if (!documentId || !currentUserId || !isHistoryLoaded || isTyping) {
            return;
        }

        const documentTitle = searchParams.get('askDocumentTitle')?.trim() || 'выбранный документ';
        const documentSection = searchParams.get('askDocumentSection')?.trim() || 'Основной раздел';
        const documentRequest = searchParams.get('askDocumentRequest')?.trim() || documentId;
        const requestKey = `${currentUserId}:${documentId}:${documentRequest}`;
        if (handledDocumentRequestRef.current === requestKey) {
            return;
        }

        handledDocumentRequestRef.current = requestKey;
        router.replace('/tasks?tab=standards', { scroll: false });
        sendDocumentQuestion(
            `Кратко расскажи, о чем документ «${documentTitle}», и выдели главное. Используй только этот документ. Раздел: «${documentSection}».`,
            documentId,
        );
    }, [currentUserId, isHistoryLoaded, isTyping, router, searchParams]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(inputValue);
        }
    };

    const activeSession = sessions.find((s: ChatSession) => s.id === activeSessionId);

    if (!currentUserId) {
        return null;
    }

    return (
        <section className="ai-monolithic-section">
            <header className="vates-page-heading vates-ai-heading">
                <div>
                    <span className="vates-eyebrow">Ватэс AI</span>
                    <h1>AI-ассистент</h1>
                    <p>Быстрые ответы по регламентам, обучению, документам и товарной базе компании.</p>
                </div>
            </header>

            <div className="ai-monolithic-container">
                {isMobileHistoryOpen && (
                    <button
                        type="button"
                        className="ai-mobile-overlay"
                        aria-label="Закрыть историю диалогов"
                        onClick={() => setIsMobileHistoryOpen(false)}
                    />
                )}

                <aside className={`ai-sidebar custom-scroll ${isMobileHistoryOpen ? 'open' : ''}`}>
                    <div className="ai-sidebar-create">
                        <div className="ai-sidebar-heading">
                            <strong>История</strong>
                        </div>

                        <button
                            type="button"
                            className="hover-unified-app ai-new-session-button"
                            onClick={createNewSession}
                        >
                            <CustomIcon name="chat" size={17} color="currentColor" accent="none" />
                            Новый чат
                        </button>

                        {sessions.length > 0 && (
                            <label className="ai-history-search">
                                <span className="ai-history-search-icon" aria-hidden="true" />
                                <input
                                    type="search"
                                    value={historyQuery}
                                    onChange={(event) => setHistoryQuery(event.target.value)}
                                    placeholder="Поиск"
                                    aria-label="Поиск по истории диалогов"
                                />
                            </label>
                        )}
                    </div>

                    <div className="ai-sidebar-history custom-scroll">
                        {visibleSessions.length === 0 ? (
                            <div className="ai-history-empty">
                                <strong>{sessions.length === 0 ? 'Диалогов пока нет' : 'Ничего не найдено'}</strong>
                                <p>{sessions.length === 0 ? 'Задайте первый вопрос — чат появится здесь.' : 'Измените поисковый запрос.'}</p>
                            </div>
                        ) : (
                            visibleSessions.map((session: ChatSession) => (
                                <div key={session.id} className={`ai-session-item ${activeSessionId === session.id ? 'active' : ''}`}>
                                    <button
                                        type="button"
                                        className="ai-session-select"
                                        onClick={() => {
                                            setActiveSessionId(session.id);
                                            setIsMobileHistoryOpen(false);
                                            focusComposer();
                                        }}
                                    >
                                        <span className="ai-session-icon">
                                            <CustomIcon name={session.isPinned ? 'star' : 'chat'} size={16} color="currentColor" accent="none" />
                                        </span>
                                        <span className="ai-session-copy">
                                            <strong className="ai-session-title">{hideInternalIdentifiers(session.title)}</strong>
                                            <small>{formatMessageCount(session.messages.length)} · {new Date(session.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</small>
                                        </span>
                                    </button>

                                    <div className={`ai-session-actions ${session.isPinned ? 'pinned' : ''}`}>
                                        <button
                                            type="button"
                                            className={`ai-pin-btn ${session.isPinned ? 'active' : ''}`}
                                            onClick={(event) => togglePin(session.id, event)}
                                            title={session.isPinned ? 'Открепить' : 'Закрепить'}
                                            aria-label={session.isPinned ? 'Открепить диалог' : 'Закрепить диалог'}
                                        >
                                            <CustomIcon name="star" size={15} color="currentColor" accent="none" />
                                        </button>
                                        <button
                                            type="button"
                                            className="ai-session-del-btn"
                                            onClick={(event) => deleteSession(session.id, event)}
                                            title="Удалить диалог"
                                            aria-label="Удалить диалог"
                                        >
                                            <CustomIcon name="close" size={15} color="currentColor" accent="none" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {sessions.length > 0 && (
                        <div className="ai-sidebar-clear">
                            <button
                                type="button"
                                className="hover-unified-app ai-clear-history-button"
                                onClick={() => setShowClearConfirm(true)}
                            >
                                Очистить историю
                            </button>
                        </div>
                    )}
                </aside>

                <div className="ai-chat-area">
                    <header className="ai-chat-toolbar">
                        <button
                            type="button"
                            className="ai-mobile-back-button"
                            onClick={() => router.push('/tasks?tab=welcome')}
                            aria-label="Вернуться к разделам"
                        >
                            <CustomIcon name="arrow-left" size={18} color="currentColor" accent="none" />
                        </button>

                        <button type="button" onClick={() => setIsMobileHistoryOpen(true)} className="ai-history-btn">
                            <CustomIcon name="chat" size={16} color="currentColor" accent="none" />
                            История
                        </button>

                        <div className="ai-active-dialog">
                            <strong>{activeSession?.title || 'Новый чат'}</strong>
                        </div>
                    </header>

                    <div className="ai-messages custom-scroll" ref={chatContainerRef}>
                        {activeSession && activeSession.messages.length > 0 && (
                            activeSession.messages.map((message: Message) => (
                                <div key={message.id} className={`ai-message-row ${message.role}`}>
                                    <div className={`ai-avatar ${message.role}`}>
                                        <CustomIcon
                                            name={message.role === 'user' ? 'user' : 'brain'}
                                            size={18}
                                            color="currentColor"
                                            accent="none"
                                        />
                                    </div>
                                    <div className="ai-message-body">
                                        <div className={`ai-bubble ${message.role} ${message.content.includes('СИСТЕМНАЯ ОШИБКА') || message.content.includes('СЫРОЙ ОТВЕТ') ? 'is-error' : ''}`}>
                                            {message.role === 'ai' ? renderAiMessage(message.content) : hideInternalIdentifiers(message.content)}
                                        </div>
                                        <time>{message.timestamp}</time>
                                    </div>
                                </div>
                            ))
                        )}

                        {isTyping && (
                            <div className="ai-message-row ai">
                                <div className="ai-avatar ai">
                                    <CustomIcon name="brain" size={18} color="currentColor" accent="none" />
                                </div>
                                <div className="ai-message-body">
                                    <div className="ai-bubble ai ai-typing-bubble">
                                        <div className="typing-indicator"><span /><span /><span /></div>
                                    </div>
                                    <time>Формирует ответ</time>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="ai-input-wrapper">
                        <div className="ai-input-box">
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(event) => {
                                    setInputValue(event.target.value);
                                    event.currentTarget.style.height = 'auto';
                                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Напишите сообщение..."
                                aria-label="Вопрос для AI-ассистента"
                                className="custom-scroll ai-textarea"
                                rows={1}
                            />
                            <button
                                type="button"
                                onClick={() => handleSendMessage(inputValue)}
                                disabled={!inputValue.trim() || isTyping}
                                className="ai-send-btn"
                                aria-label="Отправить вопрос"
                            >
                                <CustomIcon name="send" size={19} color="currentColor" accent="none" />
                                <span>Отправить</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showClearConfirm && (
                <div className="ai-confirm-overlay" role="presentation" onClick={() => setShowClearConfirm(false)}>
                    <section className="ai-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-clear-history-title" onClick={(event) => event.stopPropagation()}>
                        <span className="ai-confirm-icon"><CustomIcon name="alert" size={30} color="currentColor" /></span>
                        <span className="vates-eyebrow">Необратимое действие</span>
                        <h2 id="ai-clear-history-title">Удалить всю историю?</h2>
                        <p>Все диалоги AI-ассистента будут удалены. Восстановить их после подтверждения не получится.</p>
                        <div className="ai-confirm-actions">
                            <button type="button" className="vates-button secondary" onClick={() => setShowClearConfirm(false)}>Отмена</button>
                            <button type="button" className="vates-button danger" onClick={clearHistory}>Удалить историю</button>
                        </div>
                    </section>
                </div>
            )}

            <style jsx global>{`
                .ai-monolithic-section { margin: -20px -60px -60px -60px; height: calc(100vh - 100px); display: flex; flex-direction: column; }
                .ai-monolithic-container { display: flex; flex: 1; background: transparent; height: 100%; }
                .ai-sidebar { width: 300px; border-right: 1px solid #1a1a1a; display: flex; flex-direction: column; background: transparent; transition: 0.3s ease; }
                .ai-session-item { position: relative; padding: 14px 15px; margin-bottom: 8px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center; border-radius: 12px; }
                .ai-session-item.active { background: #1a1a1a; border-color: #333; }
                .ai-session-item:hover { border-color: #ff4d4d !important; box-shadow: 0 0 10px rgba(255, 77, 77, 0.15); background: rgba(255, 77, 77, 0.02); }
                .ai-session-title { color: #aaa; font-size: 14px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; padding-right: 10px; }
                .ai-session-item.active .ai-session-title { color: #0abab5; }
                
                .ai-session-actions { display: flex; align-items: center; gap: 8px; opacity: 0; transition: opacity 0.2s ease; }
                .ai-session-item:hover .ai-session-actions { opacity: 1; }
                .ai-session-actions.pinned { opacity: 1; }

                .ai-pin-btn { background: transparent; border: none; cursor: pointer; color: #555; transition: all 0.2s ease; padding: 2px; display: flex; align-items: center; justify-content: center; }
                .ai-pin-btn:hover { color: #ffd700; transform: scale(1.15); }
                .ai-pin-btn.active { color: #ffd700; }

                .ai-session-del-btn { background: transparent; border: none; color: #ff4d4d; cursor: pointer; transition: transform 0.1s ease, color 0.2s ease; padding: 2px; display: flex; align-items: center; justify-content: center; }
                .ai-session-del-btn:hover { color: #ff1a1a; }
                .ai-session-del-btn:active { transform: scale(0.85); } 

                .ai-chat-area { flex: 1; display: flex; flex-direction: column; background: transparent; position: relative; }
                .ai-mobile-header { display: none; }
                .ai-messages { flex: 1; overflow-y: auto; padding: 40px; display: flex; flex-direction: column; }
                .ai-empty-state { margin: auto; text-align: center; max-width: 550px; }
                .quick-prompts-container { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
                .quick-prompt { background: #111; border: 1px solid #222; padding: 12px 18px; border-radius: 20px; color: #0abab5; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.2s; }
                .quick-prompt:hover { background: rgba(10,186,181,0.05); border-color: #0abab5; transform: translateY(-2px); }
                .ai-avatar { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px; }
                .ai-avatar.user { background: #0abab5; color: #000; }
                .ai-avatar.ai { background: #161816; border: 1px solid #333; }
                 .ai-bubble { padding: 16px 22px; border-radius: 20px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
                 .ai-message-link { color: #45c7c2; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; }
                 .ai-message-link:hover { color: #8ce5e0; }
                 .ai-bubble.user { background: rgba(10,186,181,0.1); border: 1px solid rgba(10,186,181,0.3); color: #fff; border-bottom-right-radius: 6px; }
                .ai-bubble.ai { background: #111; border: 1px solid #222; color: #ddd; border-bottom-left-radius: 6px; }
                .ai-input-wrapper { padding: 20px 40px 30px 40px; background: transparent; }
                .ai-input-box { position: relative; display: flex; align-items: flex-end; background: #111; border: 1px solid #222; border-radius: 24px; padding: 6px; transition: 0.2s; }
                .ai-input-box:focus-within { border-color: #0abab5; box-shadow: 0 0 15px rgba(10,186,181,0.1); }
                .ai-textarea { flex: 1; background: transparent; border: none; color: #fff; padding: 16px 20px; font-size: 16px; outline: none; resize: none; max-height: 150px; min-height: 56px; font-family: inherit; }
                .ai-send-btn { margin: 8px; width: 44px; height: 44px; border-radius: 16px; border: none; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
                .ai-send-btn:not(:disabled) { background: #0abab5; color: #000; cursor: pointer; }
                .ai-send-btn:not(:disabled):hover { transform: scale(1.05); }
                .ai-send-btn:disabled { background: #1a1a1a; color: #555; cursor: not-allowed; }
                .ai-footer-text { text-align: center; font-size: 12px; color: #555; margin-top: 12px; }
                .typing-indicator { display: flex; gap: 4px; padding: 2px 0; }
                .typing-indicator span { width: 8px; height: 8px; background: #0abab5; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
                .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
                .ai-mobile-overlay { display: none; }
                @media (max-width: 768px) {
                    .ai-monolithic-section { margin: -10px -15px -50px -15px; height: calc(100vh - 70px); }
                    .ai-mobile-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #1a1a1a; background: #0a0a0a; }
                    .ai-history-btn { display: inline-flex; align-items: center; gap: 8px; background: rgba(10,186,181,0.1); color: #0abab5; border: 1px solid rgba(10,186,181,0.3); padding: 8px 16px; border-radius: 10px; font-weight: 800; font-size: 13px; transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease; }
                    .ai-history-btn:hover { transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10, 186, 181, 0.24); background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; }
                    .ai-history-btn:active { transform: translateY(2px) scale(0.97); box-shadow: inset 0 3px 8px rgba(0,0,0,0.24); }
                    .ai-sidebar { position: fixed; top: 0; left: -300px; width: 280px !important; height: 100vh; background: #000; z-index: 10006; box-shadow: 10px 0 30px rgba(0,0,0,0.8); }
                    .ai-sidebar.open { left: 0; }
                    .ai-mobile-overlay { display: block; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10005; backdrop-filter: blur(4px); }
                    .ai-messages { padding: 20px 15px; }
                    .ai-input-wrapper { padding: 15px; }
                    .quick-prompt { font-size: 13px; padding: 10px 14px; }
                    .ai-bubble { font-size: 14px; padding: 12px 16px; }
                }
            `}</style>
        </section>
    );
}
