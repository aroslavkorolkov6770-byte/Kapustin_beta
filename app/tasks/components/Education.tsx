"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CustomIcon from '@/app/components/CustomIcon';
import SectionCollapseButton from '@/app/components/SectionCollapseButton';
import useCollapsedSections from '@/app/hooks/useCollapsedSections';
import { saveDataToServer } from '@/app/lib/storageClient';
import {
    LinkedMaterialsEditor,
    LinkedMaterialsList,
    type LinkedMaterialReference,
} from './LinkedMaterials';
import AiContentGenerator, {
    type AiDraftKind,
    type AiGeneratedDraftResult,
} from './AiContentGenerator';

const STORAGE_KEYS = {
    ONBOARD_ROUTE: 'tea_hub_onboard_route_v2',
    DYNAMIC_TESTS: 'tea_hub_dynamic_tests_v1',   
    DYNAMIC_ROUTE: 'tea_hub_dynamic_route_v2',     
    TESTS_PROGRESS: 'tea_hub_tests_progress_v1',
    URGENT_FILES: 'tea_hub_urgent_files_v1'        
};
const AI_SITE_CONTEXT_CACHE_KEY = 'th_ai_site_context_v2';
const LEGACY_MATERIAL_EDITOR_ENABLED = false;

type DeadlineMaterialReference = {
    type: 'document' | 'route' | 'test';
    id: string;
};

const getDeadlineMaterialReference = (deadline: any): DeadlineMaterialReference | null => {
    const linkedMaterial = deadline?.linkedMaterial;
    if (
        linkedMaterial
        && (linkedMaterial.type === 'document' || linkedMaterial.type === 'route' || linkedMaterial.type === 'test')
        && typeof linkedMaterial.id === 'string'
        && linkedMaterial.id.trim()
    ) {
        return { type: linkedMaterial.type, id: linkedMaterial.id.trim() };
    }

    if (typeof deadline?.linkedTestId === 'string' && deadline.linkedTestId.trim()) {
        return { type: 'test', id: deadline.linkedTestId.trim() };
    }

    return null;
};

const getDeadlineActionLabel = (reference: DeadlineMaterialReference | null) => {
    if (reference?.type === 'document') return 'ОТКРЫТЬ ДОКУМЕНТ ↗';
    if (reference?.type === 'route') return 'ОТКРЫТЬ ТЕМУ ↗';
    if (reference?.type === 'test') return 'ПРОЙТИ ТЕСТ ↗';
    return '';
};

const stripEmoji = (str: string) => {
    if (!str) return '';
    return str.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
};

const normalizeText = (text: string) => {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const getRussianCountLabel = (value: number, one: string, few: string, many: string) => {
    const lastTwoDigits = Math.abs(value) % 100;
    const lastDigit = Math.abs(value) % 10;

    if (lastTwoDigits > 10 && lastTwoDigits < 20) {
        return many;
    }

    if (lastDigit === 1) {
        return one;
    }

    if (lastDigit > 1 && lastDigit < 5) {
        return few;
    }

    return many;
};

const getSafeEmbeddedPlayerUrl = (markup: string) => {
    const source = String(markup || '').trim();
    if (!source) {
        return '';
    }

    const sourceMatch = source.match(/<(?:iframe|embed)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
    const candidate = (sourceMatch?.[2] || source).trim();

    try {
        const parsedUrl = new URL(candidate);
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:' ? parsedUrl.toString() : '';
    } catch {
        return '';
    }
};

const MemoizedVideoPlayer = React.memo(({ iframeStr, descText }: { iframeStr: string, descText: string }) => {
    const safePlayerUrl = getSafeEmbeddedPlayerUrl(iframeStr);

    return (
        <div className="video-player-card" style={{ background: '#0d0d0d', padding: '20px', borderRadius: '25px', border: '1px solid #222', marginBottom: '35px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {safePlayerUrl ? (
                <div className="video-wrapper">
                    <div className="video-embed-shell">
                        <iframe
                            className="embedded-player-frame"
                            src={safePlayerUrl}
                            title="Учебное видео"
                            loading="lazy"
                            allow="fullscreen; picture-in-picture"
                            referrerPolicy="strict-origin-when-cross-origin"
                            sandbox="allow-scripts allow-same-origin allow-presentation"
                        />
                    </div>
                </div>
            ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#555', fontStyle: 'italic', background: '#111', borderRadius: '15px' }}>Видео не прикреплено</div>
            )}
            {descText && <p className="video-player-description" style={{ fontSize: '15px', color: '#ccc', lineHeight: '1.6', margin: 0, marginTop: '20px', padding: '0 10px', whiteSpace: 'pre-wrap' }}>{descText}</p>}
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.iframeStr === nextProps.iframeStr && prevProps.descText === nextProps.descText;
});

const shuffleArray = (array: any[]) => {
    return [...array].sort(() => Math.random() - 0.5);
};

const normalizeSectionName = (section: string) => section?.trim() || 'Основной раздел';

const sortSectionEntries = (items: any[]) => {
    return [...items].sort((left: any, right: any) => {
        const leftOrder = typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        return String(left.title || left.name || '').localeCompare(String(right.title || right.name || ''), 'ru');
    });
};

const reindexSectionItems = (items: any[]) => {
    return sortSectionEntries(items).map((item: any, index: number) => ({ ...item, order: index + 1 }));
};

const upsertOrderedSectionItem = (collection: any[], nextItem: any) => {
    const targetSection = normalizeSectionName(nextItem.section);
    const otherItems = collection.filter((item: any) => item.id !== nextItem.id);
    const sectionItems = otherItems.filter((item: any) => !item.isPlaceholder && normalizeSectionName(item.section) === targetSection);
    const desiredOrderRaw = Number(nextItem.order);
    const maxOrder = sectionItems.length + 1;
    const desiredOrder = Number.isFinite(desiredOrderRaw) && desiredOrderRaw > 0 ? Math.min(Math.max(1, Math.trunc(desiredOrderRaw)), maxOrder) : maxOrder;

    const orderedSectionItems = reindexSectionItems(sectionItems);
    orderedSectionItems.splice(desiredOrder - 1, 0, { ...nextItem, section: targetSection, order: desiredOrder });
    const normalizedSectionItems = orderedSectionItems.map((item: any, index: number) => ({ ...item, order: index + 1 }));

    return [
        ...otherItems.filter((item: any) => normalizeSectionName(item.section) !== targetSection || item.isPlaceholder),
        ...normalizedSectionItems,
    ];
};

const normalizeOrderedCollection = (collection: any[]) => {
    const placeholders = collection.filter((item: any) => item.isPlaceholder);
    const realItems = collection.filter((item: any) => !item.isPlaceholder);
    const sections = Array.from(new Set(realItems.map((item: any) => normalizeSectionName(item.section))));

    const normalizedItems = sections.flatMap((sectionName) => {
        const sectionItems = realItems.filter((item: any) => normalizeSectionName(item.section) === sectionName);
        return reindexSectionItems(sectionItems.map((item: any) => ({ ...item, section: sectionName })));
    });

    return [...normalizedItems, ...placeholders];
};

export default function Education({
    isAdmin, userId, dynamicRoute, setDynamicRoute, completedRoute, setCompletedRoute,
    dynamicTests, setDynamicTests, completedTests, setCompletedTests, urgentFiles,
    passedTests, setPassedTests, dismissedTasks, setDismissedTasks,
    selectedRouteStep, setSelectedRouteStep, closeRouteModal,
    selectedTest, setSelectedTest, closeTestModal
}: any) {
    const router = useRouter();
    const { isSectionCollapsed, toggleSection } = useCollapsedSections('tea_hub_education_collapsed_sections_v1');
    
    const [showRouteForm, setShowRouteForm] = useState(false);
    const [routeFormData, setRouteFormData] = useState({ 
        id: '', title: '', time: '5 мин', section: '', order: '',
        mediaType: 'text', videoIframe: '', videoDesc: '',
        h1: '', t1: '', img1: '', h2: '', t2: '', img2: '', h3: '', t3: '', img3: '',
        linkedMaterials: [] as LinkedMaterialReference[],
    });

    const [showTestForm, setShowTestForm] = useState(false);
    const [testFormData, setTestFormData] = useState({
        id: '', title: '', subtitle: '', theory: '', section: '', order: '', timeLimit: 0,
        quiz: [{ q: '', o: ['', '', '', ''], c: 0 }],
        linkedMaterials: [] as LinkedMaterialReference[],
    });
    const [createMenu, setCreateMenu] = useState<AiDraftKind | null>(null);
    const [aiGeneratorKind, setAiGeneratorKind] = useState<AiDraftKind | null>(null);
    const [materialSearchQuery, setMaterialSearchQuery] = useState('');
    const [materialTypeFilter, setMaterialTypeFilter] = useState<'all' | 'topic' | 'test'>('all');
    const [aiReview, setAiReview] = useState<{
        kind: AiDraftKind;
        sourceFiles: string[];
        warnings: string[];
    } | null>(null);

    const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, type: 'route'|'test'|'section_route'|'section_test', targetId: string, name: string}>({ isOpen: false, type: 'route', targetId: '', name: '' });
    const [confirmSectionDelete, setConfirmSectionDelete] = useState({ isOpen: false, type: 'route' as 'route'|'test', name: '' });
    const [renameSectionPrompt, setRenameSectionPrompt] = useState<{isOpen: boolean, type: 'route'|'test', oldName: string, newName: string}>({ isOpen: false, type: 'route', oldName: '', newName: '' });
    const [promptSection, setPromptSection] = useState<{isOpen: boolean, type: 'route'|'test', name: string}>({ isOpen: false, type: 'route', name: '' });
    const [movingItem, setMovingItem] = useState<{id: string, type: 'route' | 'test'} | null>(null);
    const [moveNewSectionName, setMoveNewSectionName] = useState('');

    const [activeTestSession, setActiveTestSession] = useState<any>(null); 
    const [currentQuizStep, setCurrentQuizStep] = useState(0);
    const [testAnswers, setTestAnswers] = useState<number[]>([]);
    const [activeAnswer, setActiveAnswer] = useState<number | null>(null);

    const [lockedTestAlert, setLockedTestAlert] = useState({show: false, message: ''});
    const [cancelTestConfirm, setCancelTestConfirm] = useState<{show: boolean, type: 'normal'|'urgent'}>({show: false, type: 'normal'});
    const [reviewTest, setReviewTest] = useState<any>(null);

    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [testResultModal, setTestResultModal] = useState<{
        show: boolean, score: number, isPassed: boolean, title: string, 
        mistakes: Array<{q: string, userAns: string, correctAns: string}>, isTimeout?: boolean
    }>({show: false, score: 0, isPassed: false, title: '', mistakes: []});

    const [activeUrgentTest, setActiveUrgentTest] = useState<any>(null);
    const [urgentTestStep, setUrgentTestStep] = useState(0);
    const [urgentTestAnswers, setUrgentTestAnswers] = useState<number[]>([]);
    const [zoomedImg, setZoomedImg] = useState<string | null>(null);

    const isMaterialSubpageOpen = Boolean(
        selectedRouteStep
        || selectedTest
        || showRouteForm
        || showTestForm
        || aiGeneratorKind
        || activeTestSession
    );
    const isBlockingModalOpen = Boolean(activeUrgentTest || reviewTest || testResultModal.show || cancelTestConfirm.show || zoomedImg);
    const materialCatalogScrollPositionRef = React.useRef<number | null>(null);
    const wasMaterialSubpageOpenRef = React.useRef(false);

    const rememberMaterialCatalogScrollPosition = () => {
        if (materialCatalogScrollPositionRef.current === null) {
            materialCatalogScrollPositionRef.current = window.scrollY;
        }
    };

    useEffect(() => {
        if (!isBlockingModalOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isBlockingModalOpen]);

    useEffect(() => {
        const wasOpen = wasMaterialSubpageOpenRef.current;
        wasMaterialSubpageOpenRef.current = isMaterialSubpageOpen;

        if (!wasOpen && isMaterialSubpageOpen) {
            rememberMaterialCatalogScrollPosition();
            window.scrollTo({ top: 0, behavior: 'auto' });
            return;
        }

        if (wasOpen && !isMaterialSubpageOpen && materialCatalogScrollPositionRef.current !== null) {
            const savedScrollPosition = materialCatalogScrollPositionRef.current;
            materialCatalogScrollPositionRef.current = null;
            let frameId = 0;
            let frameCount = 0;

            const restoreScrollPosition = () => {
                const maximumScrollPosition = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
                const catalogCanReachSavedPosition = maximumScrollPosition >= savedScrollPosition - 1;

                if (catalogCanReachSavedPosition || frameCount >= 60) {
                    window.scrollTo(0, Math.min(savedScrollPosition, maximumScrollPosition));
                    return;
                }

                frameCount += 1;
                frameId = window.requestAnimationFrame(restoreScrollPosition);
            };

            frameId = window.requestAnimationFrame(restoreScrollPosition);

            return () => {
                window.cancelAnimationFrame(frameId);
            };
        }
    }, [isMaterialSubpageOpen]);

    useEffect(() => {
        if (!isMaterialSubpageOpen) return;
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, [selectedRouteStep?.id, selectedTest?.id, aiGeneratorKind, showRouteForm, showTestForm, activeTestSession?.id, isMaterialSubpageOpen]);

    useEffect(() => {
        const sectionId = window.location.hash.slice(1);
        if (sectionId !== 'topics' && sectionId !== 'tests') {
            return;
        }

        let frameId = 0;
        frameId = window.requestAnimationFrame(() => {
            document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: 'auto' });
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, []);

    const updateRouteState = (newData: any[]) => {
        const normalizedData = normalizeOrderedCollection(newData);
        setDynamicRoute(normalizedData);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(AI_SITE_CONTEXT_CACHE_KEY);
        }
        saveDataToServer(STORAGE_KEYS.DYNAMIC_ROUTE, normalizedData);
    };
    const updateTestsState = (newData: any[]) => {
        const normalizedData = normalizeOrderedCollection(newData);
        setDynamicTests(normalizedData);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(AI_SITE_CONTEXT_CACHE_KEY);
        }
        saveDataToServer(STORAGE_KEYS.DYNAMIC_TESTS, normalizedData);
    };

    const handleOpenLinkedMaterial = (reference: LinkedMaterialReference) => {
        if (reference.type === 'route') {
            const targetRoute = dynamicRoute.find((route: any) => route.id === reference.id);
            if (!targetRoute) {
                setLockedTestAlert({ show: true, message: 'Связанная тема больше недоступна.' });
                return;
            }

            setSelectedTest(null);
            rememberMaterialCatalogScrollPosition();
            setSelectedRouteStep(targetRoute);
            router.push(`/tasks?tab=edu&routeId=${encodeURIComponent(reference.id)}`, { scroll: false });
            return;
        }

        const targetDocument = (urgentFiles || []).find((file: any) => file.id === reference.id && !file.isDocPlaceholder);
        if (!targetDocument) {
            setLockedTestAlert({ show: true, message: 'Связанный документ больше недоступен.' });
            return;
        }

        setSelectedRouteStep(null);
        setSelectedTest(null);
        router.push(`/tasks?tab=docs&documentId=${encodeURIComponent(reference.id)}`);
    };

    const handleOpenDeadlineMaterial = (deadline: any) => {
        const reference = getDeadlineMaterialReference(deadline);
        if (!reference) return;

        if (reference.type !== 'test') {
            handleOpenLinkedMaterial({ type: reference.type, id: reference.id });
            return;
        }

        const targetTest = dynamicTests.find((test: any) => test.id === reference.id);
        if (!targetTest) {
            setLockedTestAlert({ show: true, message: 'Прикрепленный тест больше недоступен.' });
            return;
        }

        const unpassedTestsBefore = getUnpassedPreviousSectionTests(targetTest);
        if (unpassedTestsBefore.length > 0 && !isAdmin) {
            const missingList = buildMissingSectionTestsMessage(unpassedTestsBefore);
            setLockedTestAlert({
                show: true,
                message: `Для прохождения этого дедлайна необходимо по порядку сдать предыдущие тесты:\n\n${missingList}`,
            });
            return;
        }

        if (isLockedByUrgent && !isAdmin) {
            setLockedTestAlert({
                show: true,
                message: `Доступ к тестам закрыт.\nНе пройдены обязательные аттестации:\n${pendingAttestations.map((test: any) => '— ' + stripEmoji(test.name)).join('\n')}`,
            });
            return;
        }

        rememberMaterialCatalogScrollPosition();
        setSelectedTest(targetTest);
    };

    useEffect(() => {
        let timerId: any;
        if ((activeTestSession || activeUrgentTest) && timeLeft !== null) {
            if (timeLeft > 0) {
                timerId = setInterval(() => setTimeLeft(prev => prev !== null && prev > 0 ? prev - 1 : 0), 1000);
            } else if (timeLeft === 0) {
                handleTimeoutFail();
            }
        }
        return () => { if (timerId) clearInterval(timerId); };
    }, [timeLeft, activeTestSession, activeUrgentTest]);

    const handleTimeoutFail = async () => {
        const testTarget = activeTestSession || activeUrgentTest;
        if (!testTarget) return;

        const isUrgent = !!activeUrgentTest;
        const currentUserName = localStorage.getItem('current_user_name') || 'Сотрудник';
        const formattedTime = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

        try {
            if (isUrgent) {
                const notifRes = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_notifications_v1`);
                const notifs = await notifRes.json().catch(() => []);
                const newNotif = {
                    id: Date.now(), title: 'Провал по таймеру',
                    text: `Сотрудник ${currentUserName} не успел пройти аттестацию "${testTarget.title || testTarget.name}". Время вышло!`,
                    time: formattedTime, target: 'u_admin' 
                };
                await saveDataToServer('tea_hub_notifications_v1', [newNotif, ...(Array.isArray(notifs) ? notifs : [])]);
            }

            const res = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_test_results_v1`);
            let results = await res.json().catch(() => []);
            if (!Array.isArray(results)) results = [];

            const previousAttempts = results.filter((r: any) => r.testId === testTarget.id && r.userName === currentUserName).length;
            const newResult = {
                id: Date.now(), testId: testTarget.id, userId, userName: currentUserName,
                testName: testTarget.title || testTarget.name, score: 0, attempts: previousAttempts + 1, date: formattedTime, isTimeout: true
            };
            saveDataToServer('tea_hub_test_results_v1', [newResult, ...results]);
        } catch (e) { console.error("Ошибка при тайм-ауте", e) }

        setTestResultModal({ show: true, score: 0, isPassed: false, title: testTarget.title || testTarget.name, mistakes: [], isTimeout: true });
        setActiveTestSession(null); setActiveUrgentTest(null); setCurrentQuizStep(0); setUrgentTestStep(0);
        setTestAnswers([]); setUrgentTestAnswers([]); setActiveAnswer(null); setTimeLeft(null);
    };

    const executeCancelTest = () => {
        if (cancelTestConfirm.type === 'normal') {
            setActiveTestSession(null); setCurrentQuizStep(0); setActiveAnswer(null); setTestAnswers([]); closeTestModal(); setTimeLeft(null);
        } else {
            setActiveUrgentTest(null); setUrgentTestStep(0); setActiveAnswer(null); setUrgentTestAnswers([]); setTimeLeft(null);
        }
        setCancelTestConfirm({show: false, type: 'normal'});
    };

    const handleDismissTask = (id: string) => {
        const newDismissed = [...dismissedTasks, id];
        setDismissedTasks(newDismissed);
        localStorage.setItem(`th_dismissed_tasks_${userId}`, JSON.stringify(newDismissed));
        saveDataToServer(`dismissed_tasks_${userId}`, newDismissed);
    };

    const visibleUrgentFiles = urgentFiles.filter((f: any) => {
        let taskCreatedAt = 0;
        if (f.id && typeof f.id === 'string') {
            const parts = f.id.split('_');
            const timePart = parseInt(parts[parts.length - 1]);
            if (!isNaN(timePart)) taskCreatedAt = timePart;
        }
        let userCreatedAt = 0;
        if (userId && userId !== 'u_admin' && userId !== 'u_staff') {
            const uParts = userId.split('_');
            const uTimePart = parseInt(uParts[uParts.length - 1]);
            if (!isNaN(uTimePart)) userCreatedAt = uTimePart;
        }
        let isForMe = false;
        if (f.target === userId) {
            isForMe = true;
        } else if (!f.target || f.target === 'Все') {
            if (!f.isTest && !(f.id && f.id.startsWith('deadline_'))) isForMe = true;
            else isForMe = taskCreatedAt >= userCreatedAt;
        }
        const isPassed = f.isTest && passedTests.includes(f.id);
        const isDismissed = dismissedTasks.includes(f.id);
        return isForMe && !isPassed && !isDismissed;
    });

    const urgentTasks = visibleUrgentFiles.filter((f: any) => f.id?.startsWith('deadline_') || f.isTest);
    const pendingAttestations = urgentTasks.filter((t: any) => t.isTest);
    const isLockedByUrgent = pendingAttestations.length > 0;

    const handleSaveRoute = () => {
        if (!routeFormData.title.trim()) { alert("Введите название темы!"); return; }
        const routeDraft = {
            ...routeFormData,
            id: routeFormData.id || ('route_' + Date.now()),
            section: normalizeSectionName(routeFormData.section),
        };
        const newList = upsertOrderedSectionItem([...dynamicRoute], routeDraft);
        updateRouteState(newList);
        setShowRouteForm(false);
        setAiReview(null);
    };

    const handleRouteComplete = (id: string) => {
        if (!completedRoute.includes(id)) {
            const newProg = [...completedRoute, id];
            setCompletedRoute(newProg);
            localStorage.setItem(`th_prog_route_${userId}`, JSON.stringify(newProg));
            saveDataToServer(`prog_route_${userId}`, newProg);
        }
        closeRouteModal();
    };

    const updateTestQuestion = (index: number, field: string, value: any) => {
        const newQuiz = [...testFormData.quiz];
        if (field === 'q') newQuiz[index].q = value;
        if (field === 'c') newQuiz[index].c = value;
        if (field.startsWith('o')) newQuiz[index].o[parseInt(field.replace('o', ''))] = value;
        setTestFormData({...testFormData, quiz: newQuiz});
    };

    const addTestQuestion = () => setTestFormData({ ...testFormData, quiz: [...testFormData.quiz, { q: '', o: ['', '', '', ''], c: 0 }] });
    const removeTestQuestion = (index: number) => setTestFormData({...testFormData, quiz: testFormData.quiz.filter((_: any, i: number) => i !== index)});

    const handleSaveTestForm = () => {
        if (!testFormData.title.trim()) { alert("Введите название теста!"); return; }
        const newTest = {
            id: testFormData.id || ('t_' + Date.now()),
            title: testFormData.title, subtitle: testFormData.subtitle, theory: testFormData.theory,
            section: normalizeSectionName(testFormData.section), order: testFormData.order,
            timeLimit: testFormData.timeLimit || 0,
            linkedMaterials: testFormData.linkedMaterials,
            quiz: testFormData.quiz.map((q: any) => ({ q: q.q || 'Без вопроса?', o: [q.o[0] || '1', q.o[1] || '2', q.o[2] || '3', q.o[3] || '4'], c: q.c }))
        };
        const newList = upsertOrderedSectionItem([...dynamicTests], newTest);
        updateTestsState(newList);
        setShowTestForm(false);
        setAiReview(null);
    };

    const openManualRouteForm = () => {
        rememberMaterialCatalogScrollPosition();
        setRouteFormData({
            id: '', title: '', time: '5 мин', section: '', order: '',
            mediaType: 'text', videoIframe: '', videoDesc: '',
            h1: '', t1: '', img1: '', h2: '', t2: '', img2: '', h3: '', t3: '', img3: '',
            linkedMaterials: [],
        });
        setAiReview(null);
        setCreateMenu(null);
        setShowRouteForm(true);
    };

    const openManualTestForm = () => {
        rememberMaterialCatalogScrollPosition();
        setTestFormData({
            id: '', title: '', subtitle: '', theory: '', section: '', order: '', timeLimit: 0,
            quiz: [{ q: '', o: ['', '', '', ''], c: 0 }],
            linkedMaterials: [],
        });
        setAiReview(null);
        setCreateMenu(null);
        setShowTestForm(true);
    };

    const openRouteEditor = (step: any, fallbackOrder?: number) => {
        rememberMaterialCatalogScrollPosition();
        setAiReview(null);
        setSelectedRouteStep(null);
        setRouteFormData({
            id: step.id,
            title: step.title,
            time: step.time || '5 мин',
            section: step.section || '',
            order: String(step.order || fallbackOrder || ''),
            mediaType: step.mediaType || 'text',
            videoIframe: step.videoIframe || '',
            videoDesc: step.videoDesc || '',
            h1: step.h1 || '',
            t1: step.t1 || '',
            img1: step.img1 || '',
            h2: step.h2 || '',
            t2: step.t2 || '',
            img2: step.img2 || '',
            h3: step.h3 || '',
            t3: step.t3 || '',
            img3: step.img3 || '',
            linkedMaterials: Array.isArray(step.linkedMaterials) ? step.linkedMaterials : [],
        });
        setShowRouteForm(true);
    };

    const openTestEditor = (test: any, fallbackOrder?: number) => {
        rememberMaterialCatalogScrollPosition();
        setAiReview(null);
        setSelectedTest(null);
        setTestFormData({
            id: test.id,
            title: test.title,
            subtitle: test.subtitle || '',
            theory: test.theory || '',
            section: test.section || '',
            order: String(test.order || fallbackOrder || ''),
            timeLimit: test.timeLimit || 0,
            quiz: test.quiz && test.quiz.length > 0
                ? JSON.parse(JSON.stringify(test.quiz))
                : [{ q: '', o: ['', '', '', ''], c: 0 }],
            linkedMaterials: Array.isArray(test.linkedMaterials) ? test.linkedMaterials : [],
        });
        setShowTestForm(true);
    };

    const openAiGenerator = (kind: AiDraftKind) => {
        rememberMaterialCatalogScrollPosition();
        setCreateMenu(null);
        setAiGeneratorKind(kind);
    };

    const handleAiDraftGenerated = (result: AiGeneratedDraftResult) => {
        setAiGeneratorKind(null);
        setAiReview({
            kind: result.draft.kind,
            sourceFiles: result.sourceFiles,
            warnings: result.warnings,
        });

        if (result.draft.kind === 'topic') {
            const [firstBlock, secondBlock, thirdBlock] = result.draft.blocks;
            setRouteFormData({
                id: '',
                title: result.draft.title,
                time: result.draft.time || '5 мин',
                section: result.draft.section || '',
                order: '',
                mediaType: 'text',
                videoIframe: '',
                videoDesc: '',
                h1: firstBlock?.heading || '',
                t1: firstBlock?.text || '',
                img1: '',
                h2: secondBlock?.heading || '',
                t2: secondBlock?.text || '',
                img2: '',
                h3: thirdBlock?.heading || '',
                t3: thirdBlock?.text || '',
                img3: '',
                linkedMaterials: [],
            });
            setShowRouteForm(true);
            return;
        }

        setTestFormData({
            id: '',
            title: result.draft.title,
            subtitle: result.draft.subtitle,
            theory: result.draft.theory,
            section: result.draft.section || '',
            order: '',
            timeLimit: 0,
            quiz: result.draft.questions.map((question) => ({
                q: question.question,
                o: [
                    question.options[0] || '',
                    question.options[1] || '',
                    question.options[2] || '',
                    question.options[3] || '',
                ],
                c: question.correctIndex,
            })),
            linkedMaterials: [],
        });
        setShowTestForm(true);
    };

    const closeRouteEditor = () => {
        setShowRouteForm(false);
        setAiReview(null);
    };

    const closeTestEditor = () => {
        setShowTestForm(false);
        setAiReview(null);
    };

    const handleMoveItem = (targetSection: string) => {
        if (!movingItem) return;
        if (movingItem.type === 'route') {
            const itemToMove = dynamicRoute.find((r: any) => r.id === movingItem.id);
            const sourceSection = itemToMove?.section?.trim() || 'Основной раздел';
            const updated = dynamicRoute.map((r: any) => r.id === movingItem.id ? { ...r, section: targetSection } : r);
            const sourceHasItems = updated.some((r: any) => (r.section?.trim() || 'Основной раздел') === sourceSection);
            if (!sourceHasItems && sourceSection !== 'Основной раздел') updated.push({ id: 'placeholder_' + Date.now(), section: sourceSection, isPlaceholder: true });
            updateRouteState(updated);
        } else {
            const itemToMove = dynamicTests.find((t: any) => t.id === movingItem.id);
            const sourceSection = itemToMove?.section?.trim() || 'Основной раздел';
            const updated = dynamicTests.map((t: any) => t.id === movingItem.id ? { ...t, section: targetSection } : t);
            const sourceHasItems = updated.some((t: any) => (t.section?.trim() || 'Основной раздел') === sourceSection);
            if (!sourceHasItems && sourceSection !== 'Основной раздел') updated.push({ id: 'placeholder_' + Date.now(), section: sourceSection, isPlaceholder: true });
            updateTestsState(updated);
        }
        setMovingItem(null); setMoveNewSectionName('');
    };

    const executeDelete = () => {
        if (confirmDelete.type === 'route') {
            const itemToDelete = dynamicRoute.find((r: any) => r.id === confirmDelete.targetId);
            const sourceSection = itemToDelete?.section?.trim() || 'Основной раздел';
            const updated = dynamicRoute.filter((r: any) => r.id !== confirmDelete.targetId);
            const sourceHasItems = updated.some((r: any) => (r.section?.trim() || 'Основной раздел') === sourceSection);
            if (!sourceHasItems && sourceSection !== 'Основной раздел') updated.push({ id: 'placeholder_' + Date.now(), section: sourceSection, isPlaceholder: true });
            updateRouteState(updated);
        } else if (confirmDelete.type === 'test') {
            const itemToDelete = dynamicTests.find((t: any) => t.id === confirmDelete.targetId);
            const sourceSection = itemToDelete?.section?.trim() || 'Основной раздел';
            const updated = dynamicTests.filter((t: any) => t.id !== confirmDelete.targetId);
            const sourceHasItems = updated.some((t: any) => (t.section?.trim() || 'Основной раздел') === sourceSection);
            if (!sourceHasItems && sourceSection !== 'Основной раздел') updated.push({ id: 'placeholder_' + Date.now(), section: sourceSection, isPlaceholder: true });
            updateTestsState(updated);
        }
        setConfirmDelete({ isOpen: false, type: 'route', targetId: '', name: '' });
    };

    const confirmRenameSection = () => {
        if (!renameSectionPrompt.newName.trim()) return;
        const newName = renameSectionPrompt.newName.trim();
        const oldName = renameSectionPrompt.oldName;
        if (renameSectionPrompt.type === 'route') {
            const updated = dynamicRoute.map((r: any) => (r.section?.trim() || 'Основной раздел') === oldName ? { ...r, section: newName } : r);
            updateRouteState(updated);
        } else {
            const updated = dynamicTests.map((t: any) => (t.section?.trim() || 'Основной раздел') === oldName ? { ...t, section: newName } : t);
            updateTestsState(updated);
        }
        setRenameSectionPrompt({ isOpen: false, type: 'route', oldName: '', newName: '' });
    };

    const confirmPromptSection = () => {
        if (!promptSection.name.trim()) return;
        const newSecName = promptSection.name.trim();
        if (promptSection.type === 'route') {
            const updated = [...dynamicRoute, { id: 'placeholder_' + Date.now(), section: newSecName, isPlaceholder: true }];
            updateRouteState(updated);
        } else {
            const updated = [...dynamicTests, { id: 'placeholder_' + Date.now(), section: newSecName, isPlaceholder: true }];
            updateTestsState(updated);
        }
        setPromptSection({ isOpen: false, type: 'route', name: '' });
    };

    const theoryGroups = (dynamicRoute || []).reduce((groups: any, step: any) => {
        const sec = normalizeSectionName(step.section);
        if (!groups[sec]) groups[sec] = [];
        groups[sec].push(step);
        return groups;
    }, {});

    Object.keys(theoryGroups).forEach((sectionName) => {
        theoryGroups[sectionName] = sortSectionEntries(theoryGroups[sectionName]);
    });

    const testGroups = (dynamicTests || []).reduce((groups: any, test: any) => {
        const sec = normalizeSectionName(test.section);
        if (!groups[sec]) groups[sec] = [];
        groups[sec].push(test);
        return groups;
    }, {});

    Object.keys(testGroups).forEach((sectionName) => {
        testGroups[sectionName] = sortSectionEntries(testGroups[sectionName]);
    });

    const normalizedMaterialSearch = isAdmin ? materialSearchQuery.trim().toLocaleLowerCase('ru') : '';
    const matchesMaterialSearch = (item: any) => {
        if (!normalizedMaterialSearch) {
            return true;
        }

        return [item?.title, item?.name, normalizeSectionName(item?.section)]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('ru')
            .includes(normalizedMaterialSearch);
    };
    const filterMaterialGroups = (groups: Record<string, any[]>) => Object.fromEntries(
        Object.entries(groups)
            .map(([sectionName, items]) => {
                const matchingItems = items.filter(matchesMaterialSearch);

                // Техническая запись сохраняет пустой раздел, но не является учебным материалом.
                return [sectionName, isAdmin ? matchingItems : matchingItems.filter((item: any) => !item.isPlaceholder)];
            })
            .filter(([, items]) => items.length > 0),
    );
    const filteredTheoryGroups = filterMaterialGroups(theoryGroups);
    const filteredTestGroups = filterMaterialGroups(testGroups);
    const filteredTopicCount = Object.values(filteredTheoryGroups)
        .flat()
        .filter((item: any) => !item.isPlaceholder && item.h1 !== 'DELETE_ME').length;
    const filteredTestCount = Object.values(filteredTestGroups)
        .flat()
        .filter((item: any) => !item.isPlaceholder && Array.isArray(item.quiz) && item.quiz.length > 0).length;
    const filteredMaterialCount = (
        (materialTypeFilter === 'test' ? 0 : filteredTopicCount)
        + (materialTypeFilter === 'topic' ? 0 : filteredTestCount)
    );

    const educationSections = Array.from(new Set(
        [...(dynamicRoute || []), ...(dynamicTests || [])]
            .filter((item: any) => !item.isPlaceholder || item.section)
            .map((item: any) => normalizeSectionName(item.section)),
    )).sort((left, right) => left.localeCompare(right, 'ru'));
    
    const getSectionTestSequence = (targetTest: any) => {
        const targetSection = normalizeSectionName(targetTest?.section);

        return sortSectionEntries(
            (dynamicTests || []).filter((test: any) => {
                if (!test || test.isPlaceholder) {
                    return false;
                }

                const isSameSection = normalizeSectionName(test.section) === targetSection;
                const hasQuiz = Array.isArray(test.quiz) && test.quiz.length > 0;

                return isSameSection && hasQuiz;
            }),
        );
    };
    const getUnpassedPreviousSectionTests = (targetTest: any) => {
        const sectionTests = getSectionTestSequence(targetTest);
        const sectionIndex = sectionTests.findIndex((test: any) => test.id === targetTest?.id);

        if (sectionIndex <= 0) {
            return [];
        }

        return sectionTests.slice(0, sectionIndex).filter((test: any) => !completedTests.includes(test.id));
    };
    const buildMissingSectionTestsMessage = (tests: any[]) => {
        return tests.map((test: any) => {
            const sectionTests = getSectionTestSequence(test);
            const sectionIndex = sectionTests.findIndex((sectionTest: any) => sectionTest.id === test.id);
            const displayIndex = typeof test.order === 'number' ? test.order : sectionIndex + 1;

            return `— Тест ${displayIndex}: ${stripEmoji(test.title)}`;
        }).join('\n');
    };

    const handleTestAnswer = (idx: number) => {
        if (activeAnswer !== null) return; 
        setActiveAnswer(idx);
        const newAnswers = [...testAnswers, idx];
        setTestAnswers(newAnswers);
        setTimeout(() => { 
            if (currentQuizStep < activeTestSession.quiz.length - 1) { setCurrentQuizStep((v: number) => v + 1); setActiveAnswer(null); } 
            else finishMainTest(newAnswers);
        }, 400); 
    };

    const finishMainTest = async (answers: number[]) => {
        let correctCount = 0;
        let mistakesArray: Array<{q: string, userAns: string, correctAns: string}> = [];
        activeTestSession.quiz.forEach((q: any, i: number) => {
            if (q.c === answers[i]) correctCount++;
            else mistakesArray.push({ q: q.q, userAns: q.o[answers[i]], correctAns: q.o[q.c] });
        });

        const score = Math.round((correctCount / activeTestSession.quiz.length) * 100);
        const isPassed = score >= 80;
        const currentUserName = localStorage.getItem('current_user_name') || 'Сотрудник';
        const formattedTime = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

        try {
            const res = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_test_results_v1`);
            let results = await res.json().catch(() => []);
            if (!Array.isArray(results)) results = [];

            const previousAttempts = results.filter((r: any) => r.testId === activeTestSession.id && r.userName === currentUserName).length;
            const newResult = { id: Date.now(), testId: activeTestSession.id, userId, userName: currentUserName, testName: activeTestSession.title, score: score, attempts: previousAttempts + 1, date: formattedTime, answers };
            saveDataToServer('tea_hub_test_results_v1', [newResult, ...results]);

            if (isPassed && !completedTests.includes(activeTestSession.id)) {
                const newComp = [...completedTests, activeTestSession.id];
                setCompletedTests(newComp);
                localStorage.setItem(`th_prog_tests_${userId}`, JSON.stringify(newComp));
                saveDataToServer(`prog_tests_${userId}`, newComp);
            }
            
            setTestResultModal({ show: true, score, isPassed, title: activeTestSession.title, mistakes: mistakesArray });
            setActiveTestSession(null); setCurrentQuizStep(0); setTestAnswers([]); setActiveAnswer(null); setTimeLeft(null);
        } catch (e) { console.error("Ошибка сохранения результатов", e); }
    };

    const handleUrgentTestAnswer = (idx: number) => {
        if (activeAnswer !== null) return; 
        setActiveAnswer(idx);
        const newAnswers = [...urgentTestAnswers, idx];
        setUrgentTestAnswers(newAnswers);
        setTimeout(() => { 
            if (urgentTestStep < activeUrgentTest.quiz.length - 1) { setUrgentTestStep((v: number) => v + 1); setActiveAnswer(null); } 
            else finishUrgentTest(newAnswers);
        }, 500); 
    };

    const finishUrgentTest = async (answers: number[]) => {
        let correct = 0;
        activeUrgentTest.quiz.forEach((q: any, i: number) => { if (q.c === answers[i]) correct++; });
        const score = Math.round((correct / activeUrgentTest.quiz.length) * 100);
        const isPassed = score >= 80;
        const currentUserName = localStorage.getItem('current_user_name') || 'Сотрудник';
        const formattedTime = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

        try {
            const res = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_test_results_v1`);
            let results = await res.json().catch(() => []);
            if (!Array.isArray(results)) results = [];

            const previousAttempts = results.filter((r: any) => r.testId === activeUrgentTest.id && r.userName === currentUserName).length;
            const newResult = { id: Date.now(), testId: activeUrgentTest.id, userId, userName: currentUserName, testName: activeUrgentTest.name, score: score, attempts: previousAttempts + 1, date: formattedTime, answers };
            saveDataToServer('tea_hub_test_results_v1', [newResult, ...results]);

            if (isPassed) {
                const newPassed = [...passedTests, activeUrgentTest.id];
                setPassedTests(newPassed);
                localStorage.setItem(`th_cache_passed_tests_${userId}`, JSON.stringify(newPassed));
                saveDataToServer(`th_passed_tests_${userId}`, newPassed);
            }
            
            setTestResultModal({ show: true, score, isPassed, title: activeUrgentTest.name, mistakes: [] });
            setActiveUrgentTest(null); setUrgentTestStep(0); setUrgentTestAnswers([]); setActiveAnswer(null); setTimeLeft(null);
        } catch (e) { console.error("Ошибка", e); }
    };

    const visibleRouteSteps = dynamicRoute.filter((item: any) => !item.isPlaceholder && item.id !== 'DELETE_ME');
    const visibleTests = dynamicTests.filter((item: any) => !item.isPlaceholder && item.id !== 'DELETE_ME');
    const completedRouteIds = new Set(completedRoute);
    const completedLearningItems = visibleRouteSteps.filter((item: any) => completedRouteIds.has(item.id)).length;
    const totalLearningItems = visibleRouteSteps.length;
    const learningProgress = totalLearningItems > 0
        ? Math.min(100, Math.round((completedLearningItems / totalLearningItems) * 100))
        : 0;

    return (
        <section className={`vates-education-screen${isMaterialSubpageOpen ? ' is-material-subpage-open' : ''}`} style={{ animation: 'fadeInUp 0.6s ease', maxWidth: '100%' }}>
            <header className="vates-page-heading">
                <div>
                    <span className="vates-eyebrow">Учебные материалы</span>
                    <h1>Материалы</h1>
                    <p>{isAdmin ? 'Создавайте темы и тесты вручную или с помощью AI.' : 'Продолжайте назначенный путь и следите за своим прогрессом.'}</p>
                </div>
            </header>

            {isAdmin ? (
                <>
                    <section className="vates-material-studio">
                        <header className="vates-material-studio-heading">
                            <span className="vates-material-studio-icon">
                                <CustomIcon name="material" size={27} color="currentColor" accent="none" />
                            </span>
                            <div>
                                <span className="vates-eyebrow">Студия материалов</span>
                                <h2>Создайте материал удобным способом</h2>
                                <p>Начните с чистого редактора или подготовьте проверяемый черновик через Ватэс AI.</p>
                            </div>
                        </header>

                        <div className="vates-material-studio-grid">
                            <article className="vates-material-studio-card is-topic">
                                <div className="vates-material-studio-card-head">
                                    <span className="vates-material-studio-card-icon">
                                        <CustomIcon name="material" size={25} color="currentColor" accent="none" />
                                    </span>
                                </div>
                                <div className="vates-material-studio-copy">
                                    <span>Учебный материал</span>
                                    <h3>Создать тему</h3>
                                    <p>Соберите текст, иллюстрации или видео в последовательный учебный материал.</p>
                                </div>
                                <div className="vates-material-studio-actions">
                                    <button type="button" className="vates-button secondary" onClick={openManualRouteForm}>
                                        <CustomIcon name="edit" size={17} color="currentColor" accent="none" />
                                        Создать самому
                                    </button>
                                    <button type="button" className="vates-button primary" onClick={() => openAiGenerator('topic')}>
                                        <CustomIcon name="brain" size={17} color="currentColor" accent="none" />
                                        Создать через AI
                                    </button>
                                </div>
                            </article>

                            <article className="vates-material-studio-card is-test">
                                <div className="vates-material-studio-card-head">
                                    <span className="vates-material-studio-card-icon">
                                        <CustomIcon name="cap" size={25} color="currentColor" accent="none" />
                                    </span>
                                </div>
                                <div className="vates-material-studio-copy">
                                    <span>Проверка знаний</span>
                                    <h3>Создать тест</h3>
                                    <p>Добавьте вопросы вручную или получите основу теста из загруженных документов.</p>
                                </div>
                                <div className="vates-material-studio-actions">
                                    <button type="button" className="vates-button secondary" onClick={openManualTestForm}>
                                        <CustomIcon name="edit" size={17} color="currentColor" accent="none" />
                                        Создать самому
                                    </button>
                                    <button type="button" className="vates-button primary" onClick={() => openAiGenerator('test')}>
                                        <CustomIcon name="brain" size={17} color="currentColor" accent="none" />
                                        Создать через AI
                                    </button>
                                </div>
                            </article>
                        </div>

                        <footer className="vates-material-studio-footer">
                            <div>
                                <span className="vates-material-studio-footer-icon"><CustomIcon name="folder" size={19} color="currentColor" accent="none" /></span>
                                <div>
                                    <strong>Организуйте библиотеку</strong>
                                    <span>Разделы сохраняют понятную структуру тем и тестов.</span>
                                </div>
                            </div>
                            <div className="vates-material-studio-footer-actions">
                                <button type="button" className="vates-button secondary compact" onClick={() => setPromptSection({isOpen: true, type: 'route', name: ''})}>Добавить раздел тем</button>
                                <button type="button" className="vates-button secondary compact" onClick={() => setPromptSection({isOpen: true, type: 'test', name: ''})}>Добавить раздел тестов</button>
                            </div>
                        </footer>
                    </section>

                    <section className="vates-material-catalog-toolbar" aria-label="Поиск и фильтрация материалов">
                        <label className="vates-material-search-field">
                            <span className="vates-material-search-icon"><CustomIcon name="eye" size={18} color="currentColor" accent="none" /></span>
                            <input
                                type="search"
                                value={materialSearchQuery}
                                onChange={(event) => setMaterialSearchQuery(event.target.value)}
                                placeholder="Найти тему, тест или раздел"
                                aria-label="Поиск материалов"
                            />
                        </label>
                        <select value={materialTypeFilter} onChange={(event) => setMaterialTypeFilter(event.target.value as 'all' | 'topic' | 'test')} aria-label="Тип материала">
                            <option value="all">Все материалы</option>
                            <option value="topic">Только темы</option>
                            <option value="test">Только тесты</option>
                        </select>
                        <span className="vates-material-result-count">Найдено: <strong>{filteredMaterialCount}</strong></span>
                    </section>
                </>
            ) : (
                <section className="vates-learning-hero">
                    <div>
                        <span className="vates-eyebrow">Текущий путь</span>
                        <h2>Базовая подготовка сотрудника</h2>
                        <p>{completedLearningItems} из {totalLearningItems} учебных шагов завершено</p>
                    </div>
                    <div className="vates-learning-ring" style={{ '--learning-progress': `${learningProgress * 3.6}deg` } as React.CSSProperties}>
                        <span>{learningProgress}%</span>
                    </div>
                </section>
            )}
            
            {/* --- СРОЧНО К ПРОХОЖДЕНИЮ --- */}
            {!isAdmin && <div className="vates-urgent-learning" style={{ marginBottom: '50px', width: '100%', boxSizing: 'border-box' }}>
                <div className="tasks-flex-space" style={flexSpace as any}>
                    <h2 className="tasks-title" style={{ ...sectionTitle, color: '#ff4d4d', margin: 0 } as any}>Срочно к прохождению</h2>
                </div>
                {urgentTasks.length > 0 ? (
                    <div className="premium-cards-container"> 
                        {urgentTasks.map((file: any) => (
                            file.id && file.id.startsWith('deadline_') ? (
                                <div key={file.id} className="premium-card deadline-card" style={{ borderColor: '#ff4d4d', borderWidth: '1px', cursor: getDeadlineMaterialReference(file) ? 'pointer' : 'default' }}
                                     onClick={() => handleOpenDeadlineMaterial(file)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px', marginBottom: '15px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{fontSize:'12px', color:'#ff4d4d', fontWeight:'900', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 9V13M12 17H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                                ДЕДЛАЙН
                                            </span>
                                            <h4 style={{fontSize:'15px', margin:'0', fontWeight:'bold', wordBreak: 'break-word', color: '#fff', lineHeight: '1.4'}}>{file.name.replace(' Дедлайн: ', '').replace('Дедлайн: ', '')}</h4>
                                        </div>
                                        <div onClick={(e) => { e.stopPropagation(); handleDismissTask(file.id); }} className="card-icon-btn del-btn" title="Закрыть" style={{ border: 'none', background: 'transparent', flexShrink: 0 }}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M18 6L6 18M6 6L18 18" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    </div>
                                    
                                    <div style={boxesFlexWrapStyle as any}>
                                        {file.outlinedItems && file.outlinedItems.map((item: string, idx: number) => (
                                            <div key={idx} style={{
                                                border: '1px solid #ff4d4d',
                                                borderRadius: '8px',
                                                padding: '6px 10px',
                                                fontSize: '11px',
                                                color: '#ff4d4d',
                                                fontWeight: 'bold',
                                                background: 'rgba(255, 77, 77, 0.05)',
                                                whiteSpace: 'normal',
                                                wordBreak: 'break-word',
                                                lineHeight: '1.4'
                                            }}>{normalizeText(item)}</div>
                                        ))}
                                    </div>

                                    <div style={{ marginTop: 'auto' }}>
                                        <div style={{ color: '#ff4d4d', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>{file.size}</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ color: '#555', fontSize: '11px', fontWeight: 'bold' }}>Назначено: {file.date}</div>
                                            {getDeadlineMaterialReference(file) && <div style={{ fontSize: '11px', color: '#0abab5', fontWeight: 'bold' }}>{getDeadlineActionLabel(getDeadlineMaterialReference(file))}</div>}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div key={file.id} className="premium-card" onClick={() => {
                                    setActiveUrgentTest({ ...file, quiz: shuffleArray(file.quiz || []) });
                                    if (file.timeLimit > 0) setTimeLeft(file.timeLimit * 60);
                                    else setTimeLeft(null);
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px', marginBottom: '15px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{fontSize:'12px', color:'#0abab5', fontWeight:'800', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 4L2 9L12 14L22 9L12 4Z" fill="rgba(10,186,181,0.2)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M6 11V16C6 16 9 19 12 19C15 19 18 16 18 16V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                                АТТЕСТАЦИЯ
                                            </span>
                                            <h4 style={{fontSize:'16px', margin:'0', fontWeight:'bold', wordBreak: 'break-word', color: '#fff', lineHeight: '1.3'}}>{stripEmoji(file.name)}</h4>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 'auto' }}>
                                        <div style={cardFooter as any}><span>Пройти тестирование</span><span style={{color: '#0abab5'}}>{file.quiz?.length || 0} вопр.</span></div>
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                ) : (
                    <div style={{ color: '#666', fontSize: '14px', background: '#111', padding: '30px', borderRadius: '30px', border: '1px dashed #222', textAlign: 'center' }}>
                        У вас нет срочных заданий.
                    </div>
                )}
            </div>}

            {/* --- БЛОК 1: ТЕОРИЯ --- */}
            {(!isAdmin || materialTypeFilter !== 'test') && <section id="topics" className="vates-material-catalog-section">
            <div className="vates-material-section-heading">
               <div>
                   <span className="vates-eyebrow">{isAdmin ? 'База тем' : 'Ваше обучение'}</span>
                   <h2 className="tasks-title">{isAdmin ? 'Темы учебного пути' : 'Назначенный путь'}</h2>
                   {!isAdmin && <p>Проходите материалы по порядку и возвращайтесь к ним в любое время.</p>}
               </div>
            </div>
            
            <div className="vates-material-groups">
               {Object.entries(filteredTheoryGroups).map(([secName, items]: any) => (
                   <section className="vates-material-group" key={secName}>
                       <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '10px', marginBottom: isSectionCollapsed('theory:' + secName) ? 0 : '20px' }}>
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', color: '#0abab5', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>
                               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '8px', marginBottom: '-4px'}}>
                                   <path d="M22 19A2 2 0 0 1 20 21H4A2 2 0 0 1 2 19V5A2 2 0 0 1 4 3H9L11 5H20A2 2 0 0 1 22 7V19Z" fill="rgba(10,186,181,0.1)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                               </svg>
                               {secName}
                               <SectionCollapseButton
                                   isCollapsed={isSectionCollapsed('theory:' + secName)}
                                   onToggle={() => toggleSection('theory:' + secName)}
                                   sectionName={secName}
                               />
                           </h3>
                           {isAdmin && (
                               <div style={{display: 'flex', gap: '15px'}}>
                                   <span onClick={() => setRenameSectionPrompt({isOpen: true, type: 'route', oldName: secName, newName: secName})} style={{ color: '#0abab5', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '3px', marginBottom: '-2px'}}>
                                           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                       </svg>
                                       РЕДАКТИРОВАТЬ
                                   </span>
                                   <span onClick={() => setConfirmSectionDelete({isOpen: true, type: 'route', name: secName})} style={{ color: '#ff4d4d', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '3px', marginBottom: '-2px'}}>
                                           <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                       </svg>
                                       УДАЛИТЬ
                                   </span>
                               </div>
                           )}
                       </div>
                       
                       {!isSectionCollapsed('theory:' + secName) && <div className="premium-cards-container section-collapsible-content vates-material-card-grid">
                           {items.filter((step: any) => !step.isPlaceholder && step.h1 !== 'DELETE_ME').length === 0 && (
                               <div className="vates-material-section-empty">
                                   <span className="vates-material-section-empty-icon"><CustomIcon name="folder" size={19} color="currentColor" accent="none" /></span>
                                   <div>
                                       <strong>Раздел пока пуст</strong>
                                       <span>Добавьте тему, когда учебный материал будет готов.</span>
                                   </div>
                               </div>
                           )}
                           {items.filter((step: any) => !step.isPlaceholder && step.h1 !== 'DELETE_ME').map((step: any, idx: number) => {
                                   const isDone = completedRoute.includes(step.id);
                                   return (
                                        <article key={step.id} onClick={() => {
                                            rememberMaterialCatalogScrollPosition();
                                            setSelectedRouteStep(step);
                                        }} className={`premium-card vates-material-card is-topic ${isDone ? 'is-complete' : ''}`}>
                                             <header className="vates-material-card-header">
                                                <div className="vates-material-card-type">
                                                    <span className="vates-material-card-type-icon"><CustomIcon name="material" size={19} color="currentColor" accent="none" /></span>
                                                    <div>
                                                        <span>Тема</span>
                                                        <strong>Урок {step.order || idx + 1}</strong>
                                                    </div>
                                                </div>

                                                {isAdmin && (
                                                    <div className="vates-material-card-actions" onClick={e => e.stopPropagation()}>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setMovingItem({id: step.id, type: 'route'}); }} className="card-icon-btn move-btn" title="Переместить" aria-label={`Переместить тему «${stripEmoji(step.title)}»`}>
                                                            <CustomIcon name="folder" size={17} color="currentColor" accent="none" />
                                                        </button>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); openRouteEditor(step, idx + 1); }} className="card-icon-btn edit-btn" title="Редактировать" aria-label={`Редактировать тему «${stripEmoji(step.title)}»`}>
                                                            <CustomIcon name="edit" size={17} color="currentColor" accent="none" />
                                                        </button>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete({isOpen: true, type: 'route', targetId: step.id, name: step.title}); }} className="card-icon-btn del-btn" title="Удалить" aria-label={`Удалить тему «${stripEmoji(step.title)}»`}>
                                                            <CustomIcon name="x" size={17} color="currentColor" accent="none" />
                                                        </button>
                                                    </div>
                                                 )}
                                             </header>

                                             {isDone && (
                                                 <div className="vates-material-complete-banner">
                                                     <span className="vates-material-complete-banner-icon"><CustomIcon name="check" size={16} color="currentColor" accent="none" /></span>
                                                     <span className="vates-material-complete-banner-copy"><strong>Тема изучена</strong><small>Результат сохранен</small></span>
                                                     <span className="vates-material-complete-banner-label">Готово</span>
                                                 </div>
                                             )}

                                            <div className="vates-material-card-copy">
                                                <h4>{stripEmoji(step.title)}</h4>
                                                <p>{normalizeText(step.t1 || step.videoDesc || 'Откройте материал, чтобы изучить содержание темы.')}</p>
                                            </div>

                                            <div className="vates-material-card-meta">
                                                <span>{step.mediaType === 'video' ? 'Видео' : 'Чтение'}</span>
                                                <span>{step.time || '5 мин'}</span>
                                                <span>{normalizeSectionName(step.section)}</span>
                                            </div>

                                            <footer className="vates-material-card-footer">
                                                 {isDone ? (
                                                     <span className="vates-material-status is-complete"><span />Изучено</span>
                                                ) : (
                                                    <span className="vates-material-status is-ready"><span />К изучению</span>
                                                )}
                                                <strong>Открыть материал</strong>
                                            </footer>
                                        </article>
                                   );
                               })
                           }
                       </div>}
                   </section>
               ))}
               {Object.keys(filteredTheoryGroups).length === 0 && (
                   <div className="vates-material-empty-state">По этому запросу тем не найдено.</div>
               )}
            </div>
            </section>}

            {/* --- БЛОК 2: ТЕСТЫ --- */}
            {(!isAdmin || materialTypeFilter !== 'topic') && <section id="tests" className="vates-material-catalog-section is-tests">
            <div className="vates-material-section-heading">
                <div>
                    <span className="vates-eyebrow">Проверка знаний</span>
                    <h2 className="tasks-title">Тесты</h2>
                    {!isAdmin && <p>Закрепляйте знания и открывайте следующие этапы обучения.</p>}
                </div>
            </div>
            
            <div className="vates-material-groups">
               {Object.entries(filteredTestGroups).map(([secName, items]: any) => (
                   <section className="vates-material-group" key={secName}>
                       <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '10px', marginBottom: isSectionCollapsed('test:' + secName) ? 0 : '20px' }}>
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', color: '#0abab5', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>
                               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '8px', marginBottom: '-4px'}}>
                                   <path d="M9 2H15A1 1 0 0 1 16 3V5A1 1 0 0 1 15 6H9A1 1 0 0 1 8 5V3A1 1 0 0 1 9 2Z" fill="rgba(10,186,181,0.1)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                   <path d="M8 4H5A2 2 0 0 0 3 6V20A2 2 0 0 0 5 22H19A2 2 0 0 0 21 20V6A2 2 0 0 0 19 4H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                   <path d="M9 12H15M9 16H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                               </svg>
                               {secName}
                               <SectionCollapseButton
                                   isCollapsed={isSectionCollapsed('test:' + secName)}
                                   onToggle={() => toggleSection('test:' + secName)}
                                   sectionName={secName}
                               />
                           </h3>
                           {isAdmin && (
                               <div style={{display: 'flex', gap: '15px'}}>
                                   <span onClick={() => setRenameSectionPrompt({isOpen: true, type: 'test', oldName: secName, newName: secName})} style={{ color: '#0abab5', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '3px', marginBottom: '-2px'}}>
                                           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                       </svg>
                                       РЕДАКТИРОВАТЬ
                                   </span>
                                   <span onClick={() => setConfirmSectionDelete({isOpen: true, type: 'test', name: secName})} style={{ color: '#ff4d4d', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '3px', marginBottom: '-2px'}}>
                                           <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                       </svg>
                                       УДАЛИТЬ
                                   </span>
                               </div>
                           )}
                       </div>
                       
                       {!isSectionCollapsed('test:' + secName) && <div className="premium-cards-container section-collapsible-content vates-material-card-grid">
                           {items.filter((test: any) => !test.isPlaceholder && test.quiz && test.quiz.length > 0).length === 0 && (
                               <div className="vates-material-section-empty">
                                   <span className="vates-material-section-empty-icon"><CustomIcon name="folder" size={19} color="currentColor" accent="none" /></span>
                                   <div>
                                       <strong>Раздел пока пуст</strong>
                                       <span>Добавьте тест, когда вопросы будут готовы.</span>
                                   </div>
                               </div>
                           )}
                           {items.filter((test: any) => !test.isPlaceholder && test.quiz && test.quiz.length > 0).map((test: any, idx: number) => {
                                   const isDone = completedTests.includes(test.id);
                                   const unpassedTestsBefore = getUnpassedPreviousSectionTests(test);
                                   const isUnlocked = isDone || isAdmin || unpassedTestsBefore.length === 0;
                                   
                                    return (
                                        <article key={test.id} onClick={() => {
                                               if (isDone) {
                                                   setReviewTest(test);
                                               } else if (isLockedByUrgent && !isAdmin) {
                                                   setLockedTestAlert({
                                                       show: true, 
                                                       message: `Доступ к обычным тестам закрыт.\nНе пройдены обязательные аттестации:\n${pendingAttestations.map((t:any) => '— ' + stripEmoji(t.name)).join('\n')}`
                                                   });
                                               } else if (!isUnlocked && !isAdmin) {
                                                   const missingList = buildMissingSectionTestsMessage(unpassedTestsBefore);
                                                   
                                                   setLockedTestAlert({show: true, message: `Сначала необходимо по порядку сдать предыдущие тесты:\n\n${missingList}`});
                                               } else {
                                                   rememberMaterialCatalogScrollPosition();
                                                   setSelectedTest(test); 
                                               }
                                           }}
                                           className={`premium-card vates-material-card is-test ${isDone ? 'is-complete' : ''} ${!isUnlocked && !isAdmin ? 'is-locked' : ''}`}
                                           aria-disabled={!isUnlocked && !isAdmin}
                                        >
                                            {(!isUnlocked && !isAdmin) && (
                                                <div className="vates-material-card-lock">
                                                    <CustomIcon name="blocked" size={25} color="currentColor" accent="none" />
                                                    <strong>Сначала завершите предыдущий тест</strong>
                                                </div>
                                            )}

                                             <header className="vates-material-card-header">
                                                <div className="vates-material-card-type">
                                                    <span className="vates-material-card-type-icon"><CustomIcon name="cap" size={19} color="currentColor" accent="none" /></span>
                                                    <div>
                                                        <span>Тест</span>
                                                        <strong>Этап {test.order || idx + 1}</strong>
                                                    </div>
                                                </div>

                                                {isAdmin && (
                                                    <div className="vates-material-card-actions" onClick={e => e.stopPropagation()}>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setMovingItem({id: test.id, type: 'test'}); }} className="card-icon-btn move-btn" title="Переместить" aria-label={`Переместить тест «${stripEmoji(test.title)}»`}>
                                                            <CustomIcon name="folder" size={17} color="currentColor" accent="none" />
                                                        </button>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); openTestEditor(test, idx + 1); }} className="card-icon-btn edit-btn" title="Редактировать" aria-label={`Редактировать тест «${stripEmoji(test.title)}»`}>
                                                            <CustomIcon name="edit" size={17} color="currentColor" accent="none" />
                                                        </button>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete({isOpen: true, type: 'test', targetId: test.id, name: test.title}); }} className="card-icon-btn del-btn" title="Удалить" aria-label={`Удалить тест «${stripEmoji(test.title)}»`}>
                                                            <CustomIcon name="x" size={17} color="currentColor" accent="none" />
                                                        </button>
                                                    </div>
                                                 )}
                                             </header>

                                             {isDone && (
                                                 <div className="vates-material-complete-banner">
                                                     <span className="vates-material-complete-banner-icon"><CustomIcon name="check" size={16} color="currentColor" accent="none" /></span>
                                                     <span className="vates-material-complete-banner-copy"><strong>Тест сдан</strong><small>Результат сохранен</small></span>
                                                     <span className="vates-material-complete-banner-label">Готово</span>
                                                 </div>
                                             )}

                                            <div className="vates-material-card-copy">
                                                <h4>{stripEmoji(test.title)}</h4>
                                                <p>{normalizeText(test.subtitle || test.theory || 'Откройте тест, чтобы посмотреть описание и начать проверку знаний.')}</p>
                                            </div>

                                            <div className="vates-material-card-meta">
                                                <span>{test.quiz?.length || 0} вопросов</span>
                                                <span>{test.timeLimit > 0 ? `${test.timeLimit} мин` : 'Без таймера'}</span>
                                                <span>{normalizeSectionName(test.section)}</span>
                                            </div>

                                            <footer className="vates-material-card-footer">
                                                 {isDone ? (
                                                     <span className="vates-material-status is-complete"><span />Сдан</span>
                                                ) : (
                                                    <span className="vates-material-status is-pending"><span />Не сдан</span>
                                                )}
                                                <strong>{isDone ? 'Посмотреть ответы' : 'Открыть тест'}</strong>
                                            </footer>
                                        </article>
                                   );
                               })
                           }
                       </div>}
                   </section>
               ))}
               {Object.keys(filteredTestGroups).length === 0 && (
                   <div className="vates-material-empty-state">По этому запросу тестов не найдено.</div>
               )}
            </div>
            </section>}

            {/* --- МИНИ-ОКНА АДМИНА --- */}
            {promptSection.isOpen && (
                <div style={modalOverlay as any} onClick={() => setPromptSection({isOpen: false, type: 'route', name: ''})}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900'}}>НОВЫЙ РАЗДЕЛ</h2>
                        <input style={adminIn as any} autoFocus placeholder="Название раздела" value={promptSection.name} onChange={e => setPromptSection({...promptSection, name: e.target.value})} />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="hover-unified-app" onClick={() => setPromptSection({isOpen: false, type: 'route', name: ''})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button onClick={confirmPromptSection} style={{ ...saveBtn, flex: 1, marginTop: 0 } as any}>СОЗДАТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {renameSectionPrompt.isOpen && (
                <div style={modalOverlay as any} onClick={() => setRenameSectionPrompt({...renameSectionPrompt, isOpen: false})}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900', textTransform: 'uppercase'}}>ПЕРЕИМЕНОВАТЬ РАЗДЕЛ</h2>
                        <input style={adminIn as any} autoFocus placeholder="Новое название" value={renameSectionPrompt.newName} onChange={e => setRenameSectionPrompt({...renameSectionPrompt, newName: e.target.value})} />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="hover-unified-app" onClick={() => setRenameSectionPrompt({...renameSectionPrompt, isOpen: false})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button onClick={() => {
                                if (!renameSectionPrompt.newName.trim()) return;
                                const newName = renameSectionPrompt.newName.trim();
                                const oldName = renameSectionPrompt.oldName;
                                if (renameSectionPrompt.type === 'route') {
                                    const updated = dynamicRoute.map((r: any) => (r.section || 'Основной раздел') === oldName ? { ...r, section: newName } : r);
                                    updateRouteState(updated);
                                } else {
                                    const updated = dynamicTests.map((t: any) => (t.section || 'Основной раздел') === oldName ? { ...t, section: newName } : t);
                                    updateTestsState(updated);
                                }
                                setRenameSectionPrompt({ isOpen: false, type: 'route', oldName: '', newName: '' });
                            }} style={{ ...saveBtn, flex: 1, marginTop: 0 } as any}>СОХРАНИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmSectionDelete.isOpen && (
                <div style={modalOverlay as any} onClick={() => setConfirmSectionDelete({isOpen: false, type: 'route', name: ''})}>
                    <div style={{...modalContentSmall, textAlign: 'center'} as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ff4d4d" strokeWidth="2"/>
                                <path d="M12 8V13" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="12" cy="16" r="1" fill="#ff4d4d"/>
                            </svg>
                        </div>
                        <h2 style={{color: '#ff4d4d', fontWeight: '900', marginBottom: '15px'}}>УДАЛИТЬ РАЗДЕЛ?</h2>
                        <p style={{color: '#ccc', fontSize: '14px', marginBottom: '25px'}}>Вы уверены, что хотите удалить раздел "{confirmSectionDelete.name}" и ВСЕ карточки внутри него?</p>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button className="hover-unified-app" onClick={() => setConfirmSectionDelete({isOpen: false, type: 'route', name: ''})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button onClick={() => {
                                if (confirmSectionDelete.type === 'route') {
                                    const updated = dynamicRoute.filter((r: any) => (r.section || 'Основной раздел') !== confirmSectionDelete.name);
                                    updateRouteState(updated);
                                } else {
                                    const updated = dynamicTests.filter((t: any) => (t.section || 'Основной раздел') !== confirmSectionDelete.name);
                                    updateTestsState(updated);
                                }
                                setConfirmSectionDelete({ isOpen: false, type: 'route', name: '' });
                            }} className="hover-unified-app" style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1, marginTop: 0 } as any}>УДАЛИТЬ ВСЕ</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDelete.isOpen && (
                <div style={modalOverlay as any} onClick={() => setConfirmDelete({isOpen: false, type: 'route', targetId: '', name: ''})}>
                    <div style={{...modalContentSmall, textAlign: 'center'} as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ff4d4d" strokeWidth="2"/>
                                <path d="M12 8V13" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="12" cy="16" r="1" fill="#ff4d4d"/>
                            </svg>
                        </div>
                        <h2 style={{color: '#ff4d4d', fontWeight: '900', marginBottom: '15px'}}>УДАЛИТЬ КАРТОЧКУ?</h2>
                        <p style={{color: '#ccc', fontSize: '14px', marginBottom: '25px'}}>Вы уверены, что хотите удалить карточку?</p>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button className="hover-unified-app" onClick={() => setConfirmDelete({isOpen: false, type: 'route', targetId: '', name: ''})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button onClick={() => {
                                if (confirmDelete.type === 'route') updateRouteState(dynamicRoute.filter((r: any) => r.id !== confirmDelete.targetId));
                                else updateTestsState(dynamicTests.filter((t: any) => t.id !== confirmDelete.targetId));
                                setConfirmDelete({ isOpen: false, type: 'route', targetId: '', name: '' });
                            }} className="hover-unified-app" style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1, marginTop: 0 } as any}>УДАЛИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {movingItem && (
                <div style={modalOverlay as any} onClick={() => { setMovingItem(null); setMoveNewSectionName(''); }}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900', textTransform: 'uppercase'}}>Переместить в раздел</h2>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', marginBottom: '20px'}} className="custom-scroll">
                            {Array.from(new Set((movingItem.type === 'route' ? dynamicRoute : dynamicTests).map((i: any) => i.section?.trim() || 'Основной раздел'))).map((sec: any) => (
                                <button key={sec} onClick={() => handleMoveItem(sec)} style={{...adminIn, textAlign: 'left', cursor: 'pointer', background: '#1a1a1a', border: '1px solid #333'} as any}>{sec}</button>
                            ))}
                        </div>
                        <div style={{ borderTop: '1px solid #222', paddingTop: '20px' }}>
                            <input style={adminIn as any} placeholder="Название нового раздела..." value={moveNewSectionName} onChange={e => setMoveNewSectionName(e.target.value)} />
                            <button className="hover-unified-app" onClick={() => { if (moveNewSectionName.trim()) handleMoveItem(moveNewSectionName.trim()); }} style={{...adminActionBtn, marginTop: '10px', width: '100%', padding: '16px'} as any}>СОЗДАТЬ И ПЕРЕМЕСТИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {lockedTestAlert.show && (
                <div style={{...errorOverlayStyle, zIndex: 50000} as any} onClick={() => setLockedTestAlert({show: false, message: ''})}>
                    <div className="tasks-modal" style={errorModalContent as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="5" y="11" width="14" height="10" rx="2" fill="rgba(255,77,77,0.1)" stroke="#ff4d4d" strokeWidth="2"/>
                                <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <h2 style={{ fontSize: '20px', color: '#ff4d4d', marginBottom: '15px', fontWeight: '900' }}>ДОСТУП ЗАКРЫТ</h2>
                        <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.6', marginBottom: '25px', whiteSpace: 'pre-wrap' }}>{lockedTestAlert.message}</p>
                        <button onClick={() => setLockedTestAlert({show: false, message: ''})} style={{...errorBtnStyle, background: '#333', color: '#fff', marginTop: 0} as any}>ПОНЯТНО</button>
                    </div>
                </div>
            )}

            {aiGeneratorKind && (
                <AiContentGenerator
                    initialKind={aiGeneratorKind}
                    sections={educationSections}
                    onClose={() => setAiGeneratorKind(null)}
                    onGenerated={handleAiDraftGenerated}
                />
            )}

            {/* --- ПРЕДПРОСМОТР КАРТОЧКИ "ТЕОРИЯ" --- */}
            {selectedRouteStep && !showRouteForm && (
                <div className="vates-material-workspace-overlay">
                    <section className="vates-material-workspace is-topic" role="region" aria-labelledby="vates-topic-title">
                        <header className="vates-material-workspace-header">
                            <button type="button" className="vates-material-back-button" onClick={closeRouteModal}>
                                <CustomIcon name="arrow-left" size={17} color="currentColor" accent="none" />
                                К материалам
                            </button>
                            <div className="vates-material-workspace-title">
                                <span>Учебная тема · {selectedRouteStep.time || '5 мин'}</span>
                                <h2 id="vates-topic-title">{stripEmoji(selectedRouteStep.title)}</h2>
                            </div>
                            <span className={`vates-material-workspace-status ${completedRoute.includes(selectedRouteStep.id) ? 'is-complete' : 'is-ready'}`}>
                                <span />{completedRoute.includes(selectedRouteStep.id) ? 'Изучено' : 'Готово к изучению'}
                            </span>
                            <button type="button" className="vates-icon-button vates-material-close-button" onClick={closeRouteModal} aria-label="Закрыть тему" title="Закрыть">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <div className="vates-material-workspace-body custom-scroll">
                            <main className="vates-material-document">
                                <div className="vates-material-document-intro">
                                    <span className="vates-eyebrow">{normalizeSectionName(selectedRouteStep.section)}</span>
                                    <h3>{stripEmoji(selectedRouteStep.title)}</h3>
                                    <p>{selectedRouteStep.mediaType === 'video' ? 'Видео и пояснения собраны в одном учебном шаге.' : 'Изучите материал последовательно. Основные мысли разделены на удобные смысловые блоки.'}</p>
                                </div>

                                {selectedRouteStep.mediaType === 'video' ? (
                                    <div className="vates-material-video-card">
                                        <MemoizedVideoPlayer iframeStr={selectedRouteStep.videoIframe || ''} descText={selectedRouteStep.videoDesc || ''} />
                                    </div>
                                ) : (
                                    <div className="vates-material-document-blocks">
                                        {[1, 2, 3].map(num => {
                                            const h = selectedRouteStep[`h${num}`];
                                            const t = selectedRouteStep[`t${num}`];
                                            const img = selectedRouteStep[`img${num}`];
                                            if (!h && !t && !img) return null;

                                            return (
                                                <article key={num} className="vates-material-document-block">
                                                    {img && (
                                                        <button type="button" className="vates-material-document-image" onClick={() => setZoomedImg(img)} aria-label={`Увеличить изображение к блоку ${num}`}>
                                                            <img src={img} alt="" />
                                                            <span><CustomIcon name="eye" size={18} color="currentColor" accent="none" />Открыть изображение</span>
                                                        </button>
                                                    )}
                                                    <div className="vates-material-document-block-copy">
                                                        <span className="vates-material-document-index">{String(num).padStart(2, '0')}</span>
                                                        <div>
                                                            {h && <h4>{h}</h4>}
                                                            {t && <p>{t}</p>}
                                                        </div>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="vates-material-linked-section">
                                    <LinkedMaterialsList
                                        value={selectedRouteStep.linkedMaterials}
                                        routes={dynamicRoute}
                                        documents={urgentFiles}
                                        onOpen={handleOpenLinkedMaterial}
                                    />
                                </div>
                            </main>

                            <aside className="vates-material-inspector">
                                <section className="vates-material-inspector-card is-summary">
                                    <div className="vates-material-inspector-heading">
                                        <span className="vates-material-inspector-icon"><CustomIcon name="material" size={22} color="currentColor" accent="none" /></span>
                                        <span className="vates-eyebrow">О материале</span>
                                    </div>
                                    <h3>{stripEmoji(selectedRouteStep.title)}</h3>
                                    <dl className="vates-material-facts">
                                        <div><dt>Формат</dt><dd>{selectedRouteStep.mediaType === 'video' ? 'Видео' : 'Чтение'}</dd></div>
                                        <div><dt>Время</dt><dd>{selectedRouteStep.time || '5 мин'}</dd></div>
                                        <div><dt>Раздел</dt><dd>{normalizeSectionName(selectedRouteStep.section)}</dd></div>
                                        <div><dt>Статус</dt><dd>{completedRoute.includes(selectedRouteStep.id) ? 'Изучено' : 'Не завершено'}</dd></div>
                                    </dl>
                                </section>

                                <section className="vates-material-inspector-card is-note">
                                    <span className="vates-material-inspector-icon"><CustomIcon name="idea" size={22} color="currentColor" accent="none" /></span>
                                    <h3>Как проходить тему</h3>
                                    <p>Изучите все блоки и связанные источники. После этого отметьте материал завершённым.</p>
                                </section>

                                {isAdmin && (
                                    <button type="button" className="vates-button secondary vates-material-edit-button" onClick={() => openRouteEditor(selectedRouteStep)}>
                                        <CustomIcon name="edit" size={18} color="currentColor" accent="none" />
                                        Редактировать тему
                                    </button>
                                )}
                            </aside>
                        </div>

                        <footer className="vates-material-workspace-footer">
                            <button type="button" className="vates-button secondary" onClick={closeRouteModal}>Закрыть</button>
                            {completedRoute.includes(selectedRouteStep.id) ? (
                                <button type="button" className="vates-button primary" onClick={closeRouteModal}>
                                    <CustomIcon name="check" size={18} color="currentColor" accent="none" />
                                    Материал изучен
                                </button>
                            ) : (
                                <button type="button" className="vates-button primary" onClick={() => handleRouteComplete(selectedRouteStep.id)}>
                                    <CustomIcon name="check" size={18} color="currentColor" accent="none" />
                                    Отметить изученным
                                </button>
                            )}
                        </footer>
                    </section>
                </div>
            )}

            {showRouteForm && (
                <div className="vates-material-workspace-overlay">
                    <section className="vates-material-workspace is-editor" role="region" aria-labelledby="vates-topic-editor-title">
                        <header className="vates-material-workspace-header">
                            <button type="button" className="vates-material-back-button" onClick={closeRouteEditor}>
                                <CustomIcon name="arrow-left" size={17} color="currentColor" accent="none" />
                                Отменить
                            </button>
                            <div className="vates-material-workspace-title">
                                <span>{aiReview?.kind === 'topic' ? 'Черновик Ватэс AI' : 'Редактор темы'}</span>
                                <h2 id="vates-topic-editor-title">{routeFormData.id ? 'Редактировать тему' : 'Новая тема'}</h2>
                            </div>
                            <span className="vates-material-workspace-status is-draft"><span />Не опубликовано</span>
                            <button type="button" className="vates-icon-button vates-material-close-button" onClick={closeRouteEditor} aria-label="Закрыть редактор темы" title="Закрыть">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <div className="vates-material-workspace-body custom-scroll">
                            <main className="vates-material-editor-main">
                                {aiReview?.kind === 'topic' && (
                                    <div className="ai-review-banner vates-material-ai-review">
                                        <div className="ai-review-banner-head"><span>ВАТЭС AI</span><strong>Проверьте черновик перед сохранением</strong></div>
                                        <p>Источники: {aiReview.sourceFiles.join(', ')}.</p>
                                        {aiReview.warnings.length > 0 && <small>Не прочитано: {aiReview.warnings.join(' ')}</small>}
                                    </div>
                                )}

                                <section className="vates-editor-card">
                                    <div className="vates-editor-card-heading">
                                        <span className="vates-editor-card-icon"><CustomIcon name="material" size={21} color="currentColor" accent="none" /></span>
                                        <div><span>Основные сведения</span><h3>Название и место в программе</h3></div>
                                    </div>
                                    <div className="vates-editor-fields">
                                        <label className="is-wide"><span>Название темы</span><input autoComplete="off" placeholder="Например: Открытие смены" value={routeFormData.title} onChange={e => setRouteFormData({...routeFormData, title: e.target.value})} /></label>
                                        <label><span>Раздел</span><input list="route-sections-modern" autoComplete="off" placeholder="Основной раздел" value={routeFormData.section} onChange={e => setRouteFormData({...routeFormData, section: e.target.value})} /></label>
                                        <datalist id="route-sections-modern">{Array.from(new Set(dynamicRoute.map((r: any) => r.section).filter(Boolean))).map((sec: any) => <option key={sec} value={sec} />)}</datalist>
                                        <label><span>Время изучения</span><input autoComplete="off" placeholder="5 мин" value={routeFormData.time} onChange={e => setRouteFormData({...routeFormData, time: e.target.value})} /></label>
                                        <label><span>Порядковый номер</span><input inputMode="numeric" autoComplete="off" placeholder="Автоматически" value={routeFormData.order} onChange={e => setRouteFormData({...routeFormData, order: e.target.value.replace(/[^\d]/g, '')})} /></label>
                                    </div>
                                    <p className="vates-editor-hint">При изменении номера остальные темы в этом разделе автоматически сдвинутся.</p>
                                </section>

                                <section className="vates-editor-card">
                                    <div className="vates-editor-card-heading is-with-control">
                                        <span className="vates-editor-card-icon"><CustomIcon name="material" size={21} color="currentColor" accent="none" /></span>
                                        <div><span>Содержание</span><h3>Формат учебного материала</h3></div>
                                        <div className="vates-editor-segmented" role="group" aria-label="Формат темы">
                                            <button type="button" className={routeFormData.mediaType === 'text' ? 'is-active' : ''} onClick={() => setRouteFormData({...routeFormData, mediaType: 'text'})}>Текст и фото</button>
                                            <button type="button" className={routeFormData.mediaType === 'video' ? 'is-active' : ''} onClick={() => setRouteFormData({...routeFormData, mediaType: 'video'})}>Видео</button>
                                        </div>
                                    </div>

                                    {routeFormData.mediaType === 'video' ? (
                                        <div className="vates-editor-video-fields">
                                            <label><span>Код видеоплеера</span><textarea className="is-code" autoComplete="off" placeholder='<iframe src="..."></iframe>' value={routeFormData.videoIframe} onChange={e => setRouteFormData({...routeFormData, videoIframe: e.target.value})} /></label>
                                            <label><span>Описание под видео</span><textarea autoComplete="off" placeholder="Коротко объясните, что сотрудник узнает из видео" value={routeFormData.videoDesc} onChange={e => setRouteFormData({...routeFormData, videoDesc: e.target.value})} /></label>
                                        </div>
                                    ) : (
                                        <div className="vates-editor-block-list">
                                            {[1, 2, 3].map((num) => {
                                                const hKey = `h${num}` as 'h1' | 'h2' | 'h3';
                                                const tKey = `t${num}` as 't1' | 't2' | 't3';
                                                const imgKey = `img${num}` as 'img1' | 'img2' | 'img3';

                                                return (
                                                    <article key={num} className="vates-editor-content-block">
                                                        <header><span>{String(num).padStart(2, '0')}</span><div><strong>Смысловой блок {num}</strong><small>{num === 1 ? 'Основной блок' : 'Необязательный блок'}</small></div></header>
                                                        <label><span>Заголовок</span><input autoComplete="off" placeholder={`Заголовок блока ${num}`} value={routeFormData[hKey]} onChange={e => setRouteFormData({...routeFormData, [hKey]: e.target.value})} /></label>
                                                        <label><span>Текст</span><textarea autoComplete="off" placeholder="Раскройте одну понятную мысль, правило или порядок действий" value={routeFormData[tKey]} onChange={e => setRouteFormData({...routeFormData, [tKey]: e.target.value})} /></label>
                                                        <div className="vates-editor-image-row">
                                                            <label><span>Иллюстрация</span><input autoComplete="off" placeholder="Ссылка на изображение или загруженный файл" value={routeFormData[imgKey]} onChange={e => setRouteFormData({...routeFormData, [imgKey]: e.target.value})} /></label>
                                                            <input type="file" accept="image/*" id={`modern-upload-img-${num}`} hidden onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    const reader = new FileReader();
                                                                    reader.onload = (ev) => setRouteFormData(prev => ({...prev, [imgKey]: ev.target?.result as string}));
                                                                    reader.readAsDataURL(file);
                                                                }
                                                            }}/>
                                                            <button type="button" className="vates-button secondary compact" onClick={() => document.getElementById(`modern-upload-img-${num}`)?.click()}>
                                                                <CustomIcon name="upload" size={16} color="currentColor" accent="none" />
                                                                Загрузить
                                                            </button>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <section className="vates-editor-card vates-editor-linked-card">
                                    <LinkedMaterialsEditor
                                        value={routeFormData.linkedMaterials}
                                        onChange={(linkedMaterials) => setRouteFormData({ ...routeFormData, linkedMaterials })}
                                        routes={dynamicRoute}
                                        documents={urgentFiles}
                                        currentRouteId={routeFormData.id || undefined}
                                    />
                                </section>
                            </main>

                            <aside className="vates-material-inspector vates-editor-inspector">
                                <section className="vates-material-inspector-card is-summary">
                                    <div className="vates-material-inspector-heading">
                                        <span className="vates-material-inspector-icon"><CustomIcon name="material" size={22} color="currentColor" accent="none" /></span>
                                        <span className="vates-eyebrow">Предпросмотр структуры</span>
                                    </div>
                                    <h3>{routeFormData.title.trim() || 'Новая тема'}</h3>
                                    <dl className="vates-material-facts">
                                        <div><dt>Формат</dt><dd>{routeFormData.mediaType === 'video' ? 'Видео' : 'Текст'}</dd></div>
                                        <div><dt>Раздел</dt><dd>{normalizeSectionName(routeFormData.section)}</dd></div>
                                        <div><dt>Время</dt><dd>{routeFormData.time || 'Не указано'}</dd></div>
                                        <div><dt>Блоки</dt><dd>{[routeFormData.h1, routeFormData.h2, routeFormData.h3].filter(Boolean).length} из 3</dd></div>
                                    </dl>
                                </section>
                                <section className="vates-material-inspector-card is-note">
                                    <span className="vates-material-inspector-icon"><CustomIcon name="idea" size={22} color="currentColor" accent="none" /></span>
                                    <h3>Перед сохранением</h3>
                                    <p>Проверьте последовательность блоков, читаемость текста и доступность всех связанных источников.</p>
                                </section>
                            </aside>
                        </div>

                        <footer className="vates-material-workspace-footer">
                            <button type="button" className="vates-button secondary" onClick={closeRouteEditor}>Отменить</button>
                            <button type="button" className="vates-button primary" onClick={handleSaveRoute}>
                                <CustomIcon name="check" size={18} color="currentColor" accent="none" />
                                {aiReview?.kind === 'topic' ? 'Проверить и создать тему' : 'Сохранить тему'}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {/* Сохранённый прежний редактор оставлен как отключённый fallback. */}
            {LEGACY_MATERIAL_EDITOR_ENABLED && showRouteForm && (
                <div style={modalOverlay as any} onClick={closeRouteEditor}>
                    <div className="tasks-modal custom-scroll" style={{...modalContentMedium, margin: '0 auto', maxHeight: '90vh', overflowY: 'auto', padding: '40px 30px'} as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{ textAlign: 'center', marginBottom: '25px', color: '#fff', fontWeight: '900' }}>
                            {aiReview?.kind === 'topic' ? 'Проверка AI-черновика' : (routeFormData.id ? 'Редактировать тему' : 'Новая тема')}
                        </h2>

                        {aiReview?.kind === 'topic' && (
                            <div className="ai-review-banner">
                                <div className="ai-review-banner-head"><span>ALICE AI</span><strong>Черновик еще не создан на сайте</strong></div>
                                <p>Проверьте текст и при необходимости исправьте его. Источники: {aiReview.sourceFiles.join(', ')}.</p>
                                {aiReview.warnings.length > 0 && <small>Не прочитано: {aiReview.warnings.join(' ')}</small>}
                            </div>
                        )}
                        
                        <div style={{display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px'}}>
                            <input autoComplete="new-password" name={"title_" + Date.now()} style={adminIn as any} placeholder="Название темы (напр. История чая)" value={routeFormData.title} onChange={e => setRouteFormData({...routeFormData, title: e.target.value})} />
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: '15px'}}>
                                <input list="route-sections" autoComplete="new-password" name={"sec_" + Date.now()} style={adminIn as any} placeholder="Раздел (Основной раздел)" value={routeFormData.section} onChange={e => setRouteFormData({...routeFormData, section: e.target.value})} />
                                <datalist id="route-sections">{Array.from(new Set(dynamicRoute.map((r: any) => r.section).filter(Boolean))).map((sec: any) => <option key={sec} value={sec} />)}</datalist>
                                <input autoComplete="new-password" style={adminIn as any} placeholder="Время (напр. 10 мин)" value={routeFormData.time} onChange={e => setRouteFormData({...routeFormData, time: e.target.value})} />
                                <input autoComplete="new-password" style={adminIn as any} placeholder="Урок №" value={routeFormData.order} onChange={e => setRouteFormData({...routeFormData, order: e.target.value.replace(/[^\d]/g, '')})} />
                            </div>
                            <div style={{fontSize: '12px', color: '#666', lineHeight: '1.5', marginTop: '-4px'}}>
                                Если указать новый порядковый номер, тема автоматически встанет на это место, а остальные темы в разделе сдвинутся.
                            </div>
                        </div>

                        <div style={{borderTop: '1px solid #222', paddingTop: '20px'}}>
                            <div style={{ display: 'flex', background: '#000', borderRadius: '12px', padding: '5px', marginBottom: '20px' }}>
                                <div onClick={() => setRouteFormData({...routeFormData, mediaType: 'text'})} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: '10px', background: routeFormData.mediaType === 'text' ? '#0abab5' : 'transparent', color: routeFormData.mediaType === 'text' ? '#000' : '#888', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    Текст и фото
                                </div>
                                <div onClick={() => setRouteFormData({...routeFormData, mediaType: 'video'})} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: '10px', background: routeFormData.mediaType === 'video' ? '#0abab5' : 'transparent', color: routeFormData.mediaType === 'video' ? '#000' : '#888', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M23 7L16 12L23 17V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <rect x="1" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    Видеоплеер
                                </div>
                            </div>
                            
                            {routeFormData.mediaType === 'video' ? (
                                <div>
                                    <textarea autoComplete="new-password" style={{...adminIn, height: '100px', resize: 'none', marginBottom: '15px', fontFamily: 'monospace', fontSize: '12px'} as any} placeholder='Код iframe для плеера (напр. <iframe src="..."></iframe>)' value={routeFormData.videoIframe} onChange={e => setRouteFormData({...routeFormData, videoIframe: e.target.value})} />
                                    <textarea autoComplete="new-password" style={{...adminIn, height: '100px', resize: 'none', marginBottom: 0} as any} placeholder="Текстовое описание под плеером..." value={routeFormData.videoDesc} onChange={e => setRouteFormData({...routeFormData, videoDesc: e.target.value})} />
                                </div>
                            ) : (
                                <div>
                                    <h3 style={{fontSize: '16px', color: '#0abab5', marginBottom: '15px', fontWeight: '900'}}>Блоки теории (макс. 3)</h3>
                                    {[1, 2, 3].map((num) => {
                                        const hKey = `h${num}` as 'h1' | 'h2' | 'h3';
                                        const tKey = `t${num}` as 't1' | 't2' | 't3';
                                        const imgKey = `img${num}` as 'img1' | 'img2' | 'img3';

                                        return (
                                            <div key={num} style={{background: '#0d0f0d', padding: '15px', borderRadius: '20px', border: '1px solid #222', marginBottom: '15px'}}>
                                                <input autoComplete="new-password" style={{...adminIn, fontWeight: 'bold', marginBottom: '10px'} as any} placeholder={`Заголовок блока ${num}`} value={routeFormData[hKey]} onChange={e => setRouteFormData({...routeFormData, [hKey]: e.target.value})} />
                                                <textarea autoComplete="new-password" style={{...adminIn, height: '80px', resize: 'none', marginBottom: '10px'} as any} placeholder={`Текст блока ${num}...`} value={routeFormData[tKey]} onChange={e => setRouteFormData({...routeFormData, [tKey]: e.target.value})} />
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                    <input autoComplete="new-password" style={{...adminIn, marginBottom: '0', fontSize: '13px', flex: 1} as any} placeholder="Ссылка на фото (URL)" value={routeFormData[imgKey]} onChange={e => setRouteFormData({...routeFormData, [imgKey]: e.target.value})} />
                                                    <input type="file" accept="image/*" id={`upload-img-${num}`} style={{ display: 'none' }} onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => setRouteFormData(prev => ({...prev, [imgKey]: ev.target?.result as string}));
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}/>
                                                    <button className="hover-unified-app" onClick={(e) => { e.preventDefault(); document.getElementById(`upload-img-${num}`)?.click(); }} style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '12px 15px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Загрузить фото</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <LinkedMaterialsEditor
                            value={routeFormData.linkedMaterials}
                            onChange={(linkedMaterials) => setRouteFormData({ ...routeFormData, linkedMaterials })}
                            routes={dynamicRoute}
                            documents={urgentFiles}
                            currentRouteId={routeFormData.id || undefined}
                        />
                        <button className="hover-unified-app" onClick={handleSaveRoute} style={saveBtn as any}>
                            {aiReview?.kind === 'topic' ? 'ПРОВЕРЕНО: СОЗДАТЬ ТЕМУ' : 'СОХРАНИТЬ ТЕМУ'}
                        </button>
                        <div className="hover-link-unified-app" onClick={closeRouteEditor} style={cancelLink as any}>ОТМЕНА</div>
                    </div>
                </div>
            )}

            {/* --- ПРЕДПРОСМОТР КАРТОЧКИ "ТЕСТ" --- */}
            {LEGACY_MATERIAL_EDITOR_ENABLED && selectedTest && (
               <div className="vates-test-preview-overlay" style={modalOverlay as any} onClick={closeTestModal}>
                  <div className="tasks-modal vates-test-preview" style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                     <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'25px'}}>
                        <div>
                            <span style={{fontSize:'12px', color:'#0abab5', fontWeight:'900', letterSpacing:'1px', textTransform:'uppercase'}}>ТЕСТИРОВАНИЕ</span>
                            <h2 style={{fontSize:'24px', color:'#fff', fontWeight:'900', marginTop:'5px', marginBottom:'15px'}}>{selectedTest.title}</h2>
                            <p style={{fontSize:'14px', color:'#0abab5', fontWeight:'bold', margin:0, lineHeight:'1.4'}}>{selectedTest.subtitle}</p>
                        </div>
                        <button type="button" className="vates-icon-button" onClick={closeTestModal} aria-label="Закрыть тест" title="Закрыть"><CustomIcon name="close" size={20} color="currentColor" /></button>
                     </div>
                     <div style={{background: '#0d0f0d', padding: '20px', borderRadius: '20px', border: '1px solid #222', marginBottom: '30px'}}>
                         <p style={{fontSize:'14px', color:'#ccc', lineHeight:'1.5', margin:'0 0 15px 0'}}>{selectedTest.theory}</p>
                         <div style={{display:'flex', justifyContent:'space-between', borderTop:'1px solid #1a1a1a', paddingTop:'15px'}}>
                             <span style={{fontSize:'13px', color:'#888', fontWeight:'bold'}}>Вопросов: <span style={{color:'#fff'}}>{selectedTest.quiz.length}</span></span>
                             <span style={{fontSize:'13px', color:'#888', fontWeight:'bold'}}>Порог: <span style={{color:'#0abab5'}}>80%</span></span>
                         </div>
                     </div>
                     <LinkedMaterialsList
                         value={selectedTest.linkedMaterials}
                         routes={dynamicRoute}
                         documents={urgentFiles}
                         onOpen={handleOpenLinkedMaterial}
                     />
                     <button className="hover-unified-app" style={saveBtn as any}>НАЧАТЬ ТЕСТИРОВАНИЕ</button>
                  </div>
               </div>
            )}

            {showTestForm && (
                <div className="vates-material-workspace-overlay">
                    <section className="vates-material-workspace is-editor is-test-editor" role="region" aria-labelledby="vates-test-editor-title">
                        <header className="vates-material-workspace-header">
                            <button type="button" className="vates-material-back-button" onClick={closeTestEditor}>
                                <CustomIcon name="arrow-left" size={17} color="currentColor" accent="none" />
                                Отменить
                            </button>
                            <div className="vates-material-workspace-title">
                                <span>{aiReview?.kind === 'test' ? 'Черновик Ватэс AI' : 'Редактор теста'}</span>
                                <h2 id="vates-test-editor-title">{testFormData.id ? 'Редактировать тест' : 'Новый тест'}</h2>
                            </div>
                            <span className="vates-material-workspace-status is-draft"><span />Не опубликовано</span>
                            <button type="button" className="vates-icon-button vates-material-close-button" onClick={closeTestEditor} aria-label="Закрыть редактор теста" title="Закрыть">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <div className="vates-material-workspace-body custom-scroll">
                            <main className="vates-material-editor-main">
                                {aiReview?.kind === 'test' && (
                                    <div className="ai-review-banner vates-material-ai-review">
                                        <div className="ai-review-banner-head"><span>ВАТЭС AI</span><strong>Проверьте вопросы и правильные ответы</strong></div>
                                        <p>Источники: {aiReview.sourceFiles.join(', ')}.</p>
                                        {aiReview.warnings.length > 0 && <small>Не прочитано: {aiReview.warnings.join(' ')}</small>}
                                    </div>
                                )}

                                <section className="vates-editor-card">
                                    <div className="vates-editor-card-heading">
                                        <span className="vates-editor-card-icon is-test"><CustomIcon name="cap" size={21} color="currentColor" accent="none" /></span>
                                        <div><span>Основные сведения</span><h3>Название и условия прохождения</h3></div>
                                    </div>
                                    <div className="vates-editor-fields">
                                        <label className="is-wide"><span>Название теста</span><input autoComplete="off" placeholder="Например: Проверка стандартов смены" value={testFormData.title} onChange={e => setTestFormData({...testFormData, title: e.target.value})} /></label>
                                        <label><span>Раздел</span><input autoComplete="off" list="test-sections-modern" placeholder="Основной раздел" value={testFormData.section} onChange={e => setTestFormData({...testFormData, section: e.target.value})} /></label>
                                        <datalist id="test-sections-modern">{Array.from(new Set(dynamicTests.map((t: any) => t.section).filter(Boolean))).map((sec: any) => <option key={sec} value={sec} />)}</datalist>
                                        <label><span>Порядковый номер</span><input inputMode="numeric" autoComplete="off" placeholder="Автоматически" value={testFormData.order} onChange={e => setTestFormData({...testFormData, order: e.target.value.replace(/[^\d]/g, '')})} /></label>
                                        <label><span>Лимит времени, минут</span><input type="number" min="0" max="180" autoComplete="off" placeholder="0 — без таймера" value={testFormData.timeLimit || ''} onChange={e => setTestFormData({...testFormData, timeLimit: Math.max(0, Number(e.target.value) || 0)})} /></label>
                                        <label className="is-wide"><span>Краткое описание</span><input autoComplete="off" placeholder="Что проверяет этот тест" value={testFormData.subtitle} onChange={e => setTestFormData({...testFormData, subtitle: e.target.value})} /></label>
                                        <label className="is-wide"><span>Вступление перед тестом</span><textarea autoComplete="off" placeholder="Объясните сотруднику цель теста и важные условия" value={testFormData.theory} onChange={e => setTestFormData({...testFormData, theory: e.target.value})} /></label>
                                    </div>
                                    <p className="vates-editor-hint">Порядок тестов внутри раздела перестраивается автоматически. Значение таймера 0 отключает ограничение времени.</p>
                                </section>

                                <section className="vates-editor-card vates-editor-linked-card">
                                    <LinkedMaterialsEditor
                                        value={testFormData.linkedMaterials}
                                        onChange={(linkedMaterials) => setTestFormData({ ...testFormData, linkedMaterials })}
                                        routes={dynamicRoute}
                                        documents={urgentFiles}
                                    />
                                </section>

                                <section className="vates-editor-card">
                                    <div className="vates-editor-card-heading is-with-control">
                                        <span className="vates-editor-card-icon is-test"><CustomIcon name="cap" size={21} color="currentColor" accent="none" /></span>
                                        <div><span>Проверка знаний</span><h3>Вопросы ({testFormData.quiz.length})</h3></div>
                                        <button type="button" className="vates-button secondary compact" onClick={addTestQuestion}>Добавить вопрос</button>
                                    </div>

                                    <div className="vates-test-question-list">
                                        {testFormData.quiz.map((q: any, qIndex: number) => (
                                            <article key={qIndex} className="vates-test-question-editor">
                                                <header>
                                                    <span className="vates-test-question-number">{String(qIndex + 1).padStart(2, '0')}</span>
                                                    <div><strong>Вопрос {qIndex + 1}</strong><small>Выберите один правильный ответ</small></div>
                                                    {testFormData.quiz.length > 1 && (
                                                        <button type="button" onClick={() => removeTestQuestion(qIndex)} aria-label={`Удалить вопрос ${qIndex + 1}`}>
                                                            <CustomIcon name="x" size={17} color="currentColor" accent="none" />
                                                            Удалить
                                                        </button>
                                                    )}
                                                </header>
                                                <label className="vates-test-question-text"><span>Текст вопроса</span><input autoComplete="off" placeholder="Сформулируйте вопрос однозначно" value={q.q} onChange={e => updateTestQuestion(qIndex, 'q', e.target.value)} /></label>
                                                <div className="vates-test-option-list">
                                                    {[0, 1, 2, 3].map(optIndex => (
                                                        <label key={optIndex} className={`vates-test-option-editor ${q.c === optIndex ? 'is-correct' : ''}`}>
                                                            <input type="radio" name={`correct-answer-${qIndex}`} checked={q.c === optIndex} onChange={() => updateTestQuestion(qIndex, 'c', optIndex)} />
                                                            <span className="vates-test-option-marker">{String.fromCharCode(65 + optIndex)}</span>
                                                            <input autoComplete="off" placeholder={`Вариант ответа ${optIndex + 1}`} value={q.o[optIndex]} onChange={e => updateTestQuestion(qIndex, `o${optIndex}`, e.target.value)} />
                                                            {q.c === optIndex && <strong>Правильный</strong>}
                                                        </label>
                                                    ))}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            </main>

                            <aside className="vates-material-inspector vates-editor-inspector">
                                <section className="vates-material-inspector-card is-summary is-test">
                                    <div className="vates-material-inspector-heading">
                                        <span className="vates-material-inspector-icon is-test"><CustomIcon name="cap" size={22} color="currentColor" accent="none" /></span>
                                        <span className="vates-eyebrow">Предпросмотр структуры</span>
                                    </div>
                                    <h3>{testFormData.title.trim() || 'Новый тест'}</h3>
                                    <dl className="vates-material-facts">
                                        <div><dt>Раздел</dt><dd>{normalizeSectionName(testFormData.section)}</dd></div>
                                        <div><dt>Вопросы</dt><dd>{testFormData.quiz.length}</dd></div>
                                        <div><dt>Таймер</dt><dd>{testFormData.timeLimit > 0 ? `${testFormData.timeLimit} мин` : 'Нет'}</dd></div>
                                        <div><dt>Порог</dt><dd>80%</dd></div>
                                    </dl>
                                </section>
                                <section className="vates-material-inspector-card is-note">
                                    <span className="vates-material-inspector-icon"><CustomIcon name="idea" size={22} color="currentColor" accent="none" /></span>
                                    <h3>Проверьте ответы</h3>
                                    <p>У каждого вопроса должен быть один однозначный правильный вариант. Избегайте подсказок в формулировках.</p>
                                </section>
                            </aside>
                        </div>

                        <footer className="vates-material-workspace-footer">
                            <button type="button" className="vates-button secondary" onClick={closeTestEditor}>Отменить</button>
                            <button type="button" className="vates-button primary" onClick={handleSaveTestForm}>
                                <CustomIcon name="check" size={18} color="currentColor" accent="none" />
                                {aiReview?.kind === 'test' ? 'Проверить и создать тест' : 'Сохранить тест'}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {/* Сохранённый прежний редактор оставлен как отключённый fallback. */}
            {LEGACY_MATERIAL_EDITOR_ENABLED && showTestForm && (
                <div style={modalOverlay as any} onClick={closeTestEditor}>
                    <div className="tasks-modal custom-scroll" style={{...modalContentMedium, margin: '0 auto', maxHeight: '90vh', overflowY: 'auto', padding: '40px 30px'} as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{ textAlign: 'center', marginBottom: '25px', color: '#fff', fontWeight: '900' }}>
                            {aiReview?.kind === 'test' ? 'Проверка AI-черновика' : (testFormData.id ? 'Редактировать тест' : 'Новый тест')}
                        </h2>

                        {aiReview?.kind === 'test' && (
                            <div className="ai-review-banner">
                                <div className="ai-review-banner-head"><span>ALICE AI</span><strong>Тест еще не создан на сайте</strong></div>
                                <p>Проверьте каждый вопрос, варианты и отмеченный правильный ответ. Источники: {aiReview.sourceFiles.join(', ')}.</p>
                                {aiReview.warnings.length > 0 && <small>Не прочитано: {aiReview.warnings.join(' ')}</small>}
                            </div>
                        )}
                        
                        <div style={{display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px'}}>
                            <input autoComplete="new-password" style={adminIn as any} placeholder="Название теста" value={testFormData.title} onChange={e => setTestFormData({...testFormData, title: e.target.value})} />
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 160px', gap: '15px'}}>
                                <input autoComplete="new-password" list="test-sections" style={adminIn as any} placeholder="Раздел" value={testFormData.section} onChange={e => setTestFormData({...testFormData, section: e.target.value})} />
                                <input autoComplete="new-password" style={adminIn as any} placeholder="Тест №" value={testFormData.order} onChange={e => setTestFormData({...testFormData, order: e.target.value.replace(/[^\d]/g, '')})} />
                            </div>
                            <datalist id="test-sections">{Array.from(new Set(dynamicTests.map((t: any) => t.section).filter(Boolean))).map((sec: any) => <option key={sec} value={sec} />)}</datalist>
                            <input autoComplete="new-password" style={adminIn as any} placeholder="Краткое описание" value={testFormData.subtitle} onChange={e => setTestFormData({...testFormData, subtitle: e.target.value})} />
                            <textarea autoComplete="new-password" style={{...adminIn, height: '80px', resize: 'none'} as any} placeholder="Теория перед тестом..." value={testFormData.theory} onChange={e => setTestFormData({...testFormData, theory: e.target.value})} />
                            <div style={{fontSize: '12px', color: '#666', lineHeight: '1.5', marginTop: '-4px'}}>
                                Можно поменять порядковый номер теста прямо здесь. Нумерация внутри раздела перестроится автоматически.
                            </div>
                        </div>

                        <LinkedMaterialsEditor
                            value={testFormData.linkedMaterials}
                            onChange={(linkedMaterials) => setTestFormData({ ...testFormData, linkedMaterials })}
                            routes={dynamicRoute}
                            documents={urgentFiles}
                        />

                        <div style={{borderTop: '1px solid #222', paddingTop: '20px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                                <h3 style={{fontSize: '16px', color: '#0abab5', fontWeight: '900', margin: 0}}>Вопросы ({testFormData.quiz.length})</h3>
                                <button className="hover-unified-app" onClick={addTestQuestion} style={adminActionBtn as any}>+ ДОБАВИТЬ ВОПРОС</button>
                            </div>
                            
                            {testFormData.quiz.map((q: any, qIndex: number) => (
                                <div key={qIndex} style={{background: '#0d0f0d', padding: '20px', borderRadius: '20px', border: '1px solid #222', marginBottom: '15px'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
                                        <div style={{color: '#0abab5', fontWeight: 'bold'}}>Вопрос {qIndex + 1}</div>
                                        <div onClick={() => removeTestQuestion(qIndex)} style={{color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                            Удалить
                                        </div>
                                    </div>
                                    <input autoComplete="new-password" style={{...adminIn, marginBottom: '15px'} as any} placeholder="Текст вопроса" value={q.q} onChange={e => updateTestQuestion(qIndex, 'q', e.target.value)} />
                                    
                                    <div style={{display: 'grid', gap: '10px'}}>
                                        {[0, 1, 2, 3].map(optIndex => (
                                            <div key={optIndex} style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                                <div 
                                                    onClick={() => updateTestQuestion(qIndex, 'c', optIndex)}
                                                    style={{width: '20px', height: '20px', borderRadius: '50%', border: q.c === optIndex ? '6px solid #0abab5' : '2px solid #555', cursor: 'pointer', flexShrink: 0}}
                                                />
                                                <input autoComplete="new-password" style={{...adminIn, padding: '10px', fontSize: '14px', marginBottom: '0', flex: 1} as any} placeholder={`Вариант ${optIndex + 1}`} value={q.o[optIndex]} onChange={e => updateTestQuestion(qIndex, `o${optIndex}`, e.target.value)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button className="hover-unified-app" onClick={handleSaveTestForm} style={saveBtn as any}>
                            {aiReview?.kind === 'test' ? 'ПРОВЕРЕНО: СОЗДАТЬ ТЕСТ' : 'СОХРАНИТЬ ТЕСТ'}
                        </button>
                        <div className="hover-link-unified-app" onClick={closeTestEditor} style={cancelLink as any}>ОТМЕНА</div>
                    </div>
                </div>
            )}

            {/* НОВОЕ ОКНО: ПРОСМОТР РЕЗУЛЬТАТОВ (ОШИБКИ И ОТВЕТЫ) */}
            {reviewTest && (
               <div style={modalOverlay as any} onClick={() => setReviewTest(null)}>
                  <div className="tasks-modal custom-scroll" style={{...modalContentLarge, maxWidth: '800px'} as any} onClick={e => e.stopPropagation()}>
                     <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
                        <h2 style={{fontSize:'24px', color:'#0abab5', fontWeight:'900', margin:0, textTransform: 'uppercase'}}>ОБЗОР ТЕСТА: {stripEmoji(reviewTest.title || reviewTest.name)}</h2>
                        <div onClick={() => setReviewTest(null)} style={{cursor:'pointer', fontSize:'24px', color:'#ff4d4d', fontWeight:'bold'}}>X</div>
                     </div>
                     <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                         {reviewTest.quiz.map((q: any, i: number) => (
                             <div key={i} style={{background: '#111', padding: '20px', borderRadius: '20px', border: '1px solid #222'}}>
                                 <p style={{fontSize: '16px', fontWeight: 'bold', color: '#fff', marginBottom: '15px'}}>{i+1}. {q.q}</p>
                                 <div style={{background: 'rgba(10,186,181,0.1)', border: '1px solid rgba(10,186,181,0.3)', padding: '15px', borderRadius: '15px', color: '#0abab5', fontWeight: 'bold', fontSize: '14px'}}>
                                     <CustomIcon name="check" size={14} color="#0abab5" /> Верный ответ: {q.o[q.c]}
                                 </div>
                             </div>
                         ))}
                     </div>
                  </div>
               </div>
            )}

            {/* --- ПРЕДПРОСМОТР ЭКРАНА ТЕСТА --- */}
            {selectedTest && !activeTestSession && !showTestForm && (
                <div className="vates-material-workspace-overlay">
                    <section className="vates-material-workspace is-test-preview" role="region" aria-labelledby="vates-test-preview-title">
                        <header className="vates-material-workspace-header">
                            <button type="button" className="vates-material-back-button" onClick={closeTestModal}>
                                <CustomIcon name="arrow-left" size={17} color="currentColor" accent="none" />
                                К материалам
                            </button>
                            <div className="vates-material-workspace-title">
                                <span>Проверка знаний · {normalizeSectionName(selectedTest.section)}</span>
                                <h2 id="vates-test-preview-title">{stripEmoji(selectedTest.title)}</h2>
                            </div>
                            <span className="vates-material-workspace-status is-ready"><span />Готов к прохождению</span>
                            <button type="button" className="vates-icon-button vates-material-close-button" onClick={closeTestModal} aria-label="Закрыть тест" title="Закрыть">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <div className="vates-material-workspace-body custom-scroll">
                            <main className="vates-test-preview-main">
                                <section className="vates-test-preview-hero">
                                    <span className="vates-test-preview-icon"><CustomIcon name="cap" size={28} color="currentColor" accent="none" /></span>
                                    <span className="vates-eyebrow">Перед началом</span>
                                    <h3>{stripEmoji(selectedTest.title)}</h3>
                                    <p>{selectedTest.subtitle || selectedTest.theory || 'Ответьте на вопросы по изученным материалам.'}</p>
                                </section>

                                {selectedTest.theory && (
                                    <section className="vates-test-preview-theory">
                                        <span className="vates-editor-card-icon is-test"><CustomIcon name="material" size={21} color="currentColor" accent="none" /></span>
                                        <div><span className="vates-eyebrow">Что нужно знать</span><p>{selectedTest.theory}</p></div>
                                    </section>
                                )}

                                <section className="vates-test-rules-grid">
                                    <article><strong>Читайте внимательно</strong><p>После ответа откроется следующий вопрос.</p></article>
                                    <article><strong>Один верный вариант</strong><p>В каждом вопросе только один правильный ответ.</p></article>
                                    <article><strong>Нужно набрать 80%</strong><p>Результат сохранится после последнего вопроса.</p></article>
                                </section>

                                <div className="vates-material-linked-section">
                                    <LinkedMaterialsList
                                        value={selectedTest.linkedMaterials}
                                        routes={dynamicRoute}
                                        documents={urgentFiles}
                                        onOpen={handleOpenLinkedMaterial}
                                    />
                                </div>
                            </main>

                            <aside className="vates-material-inspector">
                                <section className="vates-material-inspector-card is-summary is-test">
                                    <div className="vates-material-inspector-heading">
                                        <span className="vates-material-inspector-icon is-test"><CustomIcon name="cap" size={22} color="currentColor" accent="none" /></span>
                                        <span className="vates-eyebrow">Параметры теста</span>
                                    </div>
                                    <h3>{stripEmoji(selectedTest.title)}</h3>
                                    <dl className="vates-material-facts">
                                        <div><dt>Вопросы</dt><dd>{selectedTest.quiz?.length || 0}</dd></div>
                                        <div><dt>Время</dt><dd>{selectedTest.timeLimit > 0 ? `${selectedTest.timeLimit} мин` : 'Без таймера'}</dd></div>
                                        <div><dt>Порог</dt><dd>80%</dd></div>
                                        <div><dt>Раздел</dt><dd>{normalizeSectionName(selectedTest.section)}</dd></div>
                                    </dl>
                                </section>
                                {isAdmin && (
                                    <button type="button" className="vates-button secondary vates-material-edit-button" onClick={() => openTestEditor(selectedTest)}>
                                        <CustomIcon name="edit" size={18} color="currentColor" accent="none" />
                                        Редактировать тест
                                    </button>
                                )}
                            </aside>
                        </div>

                        <footer className="vates-material-workspace-footer">
                            <button type="button" className="vates-button secondary" onClick={closeTestModal}>Закрыть</button>
                            <button type="button" className="vates-button primary" onClick={() => {
                                setActiveTestSession({ ...selectedTest, quiz: shuffleArray(selectedTest.quiz || []) });
                                if (selectedTest.timeLimit > 0) setTimeLeft(selectedTest.timeLimit * 60);
                                else setTimeLeft(null);
                                setSelectedTest(null);
                            }}>
                                Начать тест
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {/* --- АКТИВНАЯ СЕССИЯ ТЕСТА (ANTI-CHEAT + ТАЙМЕР) --- */}
            {activeTestSession && (
                <div className="vates-test-session-overlay vates-material-workspace-overlay">
                    <section className="vates-quiz-workspace" role="region" aria-labelledby="vates-active-test-title">
                        <header className="vates-quiz-header">
                            <button type="button" className="vates-material-back-button" onClick={() => setCancelTestConfirm({show: true, type: 'normal'})}>
                                <CustomIcon name="arrow-left" size={17} color="currentColor" accent="none" />
                                Прервать
                            </button>
                            <div>
                                <span>Проверка знаний</span>
                                <h2 id="vates-active-test-title">{stripEmoji(activeTestSession.title)}</h2>
                            </div>
                            {timeLeft !== null ? (
                                <span className={`vates-quiz-timer ${timeLeft < 60 ? 'is-urgent' : ''}`}>
                                    {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </span>
                            ) : <span className="vates-quiz-timer is-neutral">Без таймера</span>}
                        </header>

                        <div className="vates-quiz-body anti-cheat" style={{ userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties} onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
                            <div className="vates-quiz-progress-copy">
                                <span>Вопрос {currentQuizStep + 1} из {activeTestSession.quiz?.length || 1}</span>
                                <strong>{Math.round(((currentQuizStep + 1) / (activeTestSession.quiz?.length || 1)) * 100)}%</strong>
                            </div>
                            <div className="vates-quiz-progress"><span style={{ width: `${((currentQuizStep + 1) / (activeTestSession.quiz?.length || 1)) * 100}%` }} /></div>

                            <article className="vates-quiz-question-card">
                                <span className="vates-quiz-question-kicker">Выберите один ответ</span>
                                <h3>{activeTestSession.quiz?.[currentQuizStep]?.q}</h3>
                                <div className="vates-quiz-options">
                                    {activeTestSession.quiz?.[currentQuizStep]?.o.map((opt:any, i:any) => (
                                        <button type="button" key={i} onClick={() => handleTestAnswer(i)} disabled={activeAnswer !== null} className={`vates-quiz-option ${activeAnswer === i ? 'is-selected' : ''}`}>
                                            <span>{String.fromCharCode(65 + i)}</span>
                                            <strong>{opt}</strong>
                                        </button>
                                    ))}
                                </div>
                            </article>

                            <p className="vates-quiz-hint">Ответ фиксируется сразу после выбора.</p>
                        </div>
                    </section>
                </div>
            )}

            {/* --- СРОЧНАЯ АТТЕСТАЦИЯ (ANTI-CHEAT + ТАЙМЕР) --- */}
            {activeUrgentTest && (
               <div className="vates-test-session-overlay" style={modalOverlay as any}>
                  <div className="tasks-modal vates-test-session" style={modalContentLarge as any}>
                     <div className="tasks-modal-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'40px'}}>
                        <div onClick={() => setCancelTestConfirm({show: true, type: 'urgent'})} style={backLink as any}>← ОТЛОЖИТЬ</div>
                        
                        <h2 style={{fontSize:'28px', color:'#0abab5', fontWeight:'900', textAlign:'center', flex: 2, padding: '0 20px'}}>{stripEmoji(activeUrgentTest.name)}</h2>
                        
                        <div style={{flex: 1, display: 'flex', justifyContent: 'flex-end'}}>
                            {timeLeft !== null && (
                                <div style={{ 
                                    background: timeLeft < 60 ? 'rgba(255, 77, 77, 0.1)' : 'rgba(10, 186, 181, 0.1)', 
                                    border: `1px solid ${timeLeft < 60 ? '#ff4d4d' : '#0abab5'}`,
                                    color: timeLeft < 60 ? '#ff4d4d' : '#0abab5',
                                    padding: '8px 15px', borderRadius: '12px', fontWeight: '900', fontSize: '18px',
                                    boxShadow: timeLeft < 60 ? '0 0 10px rgba(255, 77, 77, 0.4)' : 'none',
                                    display: 'inline-flex', alignItems: 'center', gap: '8px'
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginBottom: '-1px'}}>
                                        <path d="M12 2V22M6 2H18M6 22H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M12 2C12 2 7 5 7 12C7 19 12 22 12 22" fill="currentColor" opacity="0.3"/>
                                        <path d="M12 2C12 2 17 5 17 12C17 19 12 22 12 22" fill="currentColor" opacity="0.3"/>
                                    </svg>
                                    {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </div>
                            )}
                        </div>
                     </div>
                     <div className="anti-cheat" style={{ animation: 'fadeInUp 0.3s ease', userSelect: 'none', WebkitUserSelect: 'none' } as any} onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
                        <div style={quizBox as any}>
                            <h4 style={{color:'#0abab5', marginBottom:'20px', fontWeight:'900'}}>ВОПРОС {urgentTestStep + 1} / {activeUrgentTest.quiz?.length || 1}</h4>
                            <p style={{fontSize:'22px', fontWeight:'800', marginBottom:'30px'}}>{activeUrgentTest.quiz?.[urgentTestStep]?.q}</p>
                            <div style={{display:'grid', gap:'15px'}}>
                               {activeUrgentTest.quiz?.[urgentTestStep]?.o.map((opt:any, i:any) => (
                                   <div key={i} onClick={() => handleUrgentTestAnswer(i)} className={`test-answer-btn ${activeAnswer === i ? 'selected' : ''}`}>{opt}</div>
                               ))}
                            </div>
                        </div>
                     </div>
                  </div>
               </div>
            )}

            {/* КАСТОМНОЕ ОКНО ПРЕРЫВАНИЯ ТЕСТА */}
            {cancelTestConfirm.show && (
                <div className="vates-material-confirm-overlay" style={modalOverlay as any} onClick={() => setCancelTestConfirm({show: false, type: 'normal'})}>
                    <div style={{...modalContentSmall, textAlign: 'center'} as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ff4d4d" strokeWidth="2"/>
                                <path d="M12 8V13" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="12" cy="16" r="1" fill="#ff4d4d"/>
                            </svg>
                        </div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>ПРЕРВАТЬ ТЕСТ?</h2>
                        <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.5', marginBottom: '25px' }}>
                            Вы уверены, что хотите прервать прохождение? Весь текущий прогресс ответов будет потерян.
                        </p>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <button className="hover-unified-app" onClick={() => setCancelTestConfirm({show: false, type: 'normal'})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, minWidth: '100px', marginTop: 0 } as any}>ОТМЕНА</button>
                            <button onClick={executeCancelTest} style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1, minWidth: '100px', marginTop: 0 } as any}>ПРЕРВАТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- МОДАЛКА РЕЗУЛЬТАТОВ ОСНОВНОГО ТЕСТА С ОШИБКАМИ --- */}
            {testResultModal.show && (
                <div className="vates-test-result-overlay" style={{...errorOverlayStyle, zIndex: 60000} as any}>
                    {/* ЖЕСТКАЯ ШИРИНА ДЛЯ ПРАВИЛЬНЫХ ПРОПОРЦИЙ ОКНА */}
                    <div className="tasks-modal custom-scroll vates-test-result" style={{...errorModalContent, width: '100%', minWidth: '320px', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', borderColor: testResultModal.isPassed ? '#0abab5' : '#ff4d4d'} as any}>
                        <div style={{ marginBottom: '20px', animation: 'scaleIn 0.3s ease' }}>
                            {testResultModal.isPassed ? (
                                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 21H16M12 17V21M7 4H17M5 4H7V13C7 15.7614 9.23858 18 12 18C14.7614 18 17 15.7614 17 13V4H19C20.1046 4 21 4.89543 21 6C21 8.20914 19.2091 10 17 10H16.8913C16.4258 12.836 14.4363 15.197 12 15.8284C9.56371 15.197 7.57423 12.836 7.10874 10H7C4.79086 10 3 8.20914 3 6C3 4.89543 3.89543 4 5 4Z" fill="rgba(10,186,181,0.1)" stroke="#0abab5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            ) : (
                                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="rgba(255,77,77,0.1)" stroke="#ff4d4d" strokeWidth="2"/>
                                    <path d="M15 9L9 15M9 9L15 15" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            )}
                        </div>
                        <h2 style={{ fontSize: '28px', color: testResultModal.isPassed ? '#0abab5' : '#ff4d4d', marginBottom: '10px', fontWeight: '900', textTransform: 'uppercase' }}>
                            {testResultModal.isTimeout ? 'ВРЕМЯ ВЫШЛО!' : (testResultModal.isPassed ? 'ТЕСТ СДАН!' : 'ТЕСТ НЕ СДАН')}
                        </h2>
                        <p style={{ color: '#ccc', fontSize: '16px', marginBottom: '10px', fontWeight: 'bold' }}>{testResultModal.title}</p>
                        <div style={{ fontSize: '60px', fontWeight: '900', color: testResultModal.isPassed ? '#0abab5' : '#ff4d4d', marginBottom: '20px' }}>{testResultModal.score}%</div>
                        
                        {testResultModal.isTimeout ? (
                            <div style={{background: 'rgba(255,77,77,0.1)', color: '#ff4d4d', padding: '20px', borderRadius: '15px', fontWeight: 'bold', marginBottom: '30px'}}>
                                Вы не уложились в отведенное время. Тест автоматически завершен и считается проваленным.
                            </div>
                        ) : testResultModal.score === 100 ? (
                            <div style={{background: 'rgba(10,186,181,0.1)', color: '#0abab5', padding: '20px', borderRadius: '15px', fontWeight: 'bold', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px'}}><CustomIcon name="success" size={24} color="#0abab5" /> Вы ответили правильно на все вопросы! Идеальный результат.</div>
                        ) : testResultModal.mistakes && testResultModal.mistakes.length > 0 ? (
                            <div style={{textAlign: 'left', marginBottom: '30px'}}>
                                <h4 style={{color: '#fff', fontSize: '18px', fontWeight: '900', marginBottom: '15px'}}>Разбор ошибок:</h4>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                                    {testResultModal.mistakes.map((m, idx) => (
                                        <div key={idx} style={{background: '#0d0f0d', padding: '20px', borderRadius: '15px', border: '1px solid #333'}}>
                                            <p style={{color: '#fff', fontSize: '15px', fontWeight: 'bold', margin: '0 0 10px 0'}}>{m.q}</p>
                                            <p style={{color: '#ff4d4d', fontSize: '13px', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '6px'}}><CustomIcon name="x" size={14} color="#ff4d4d" /> Ваш ответ: {m.userAns}</p>
                                            <p style={{color: '#0abab5', fontSize: '13px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px'}}><CustomIcon name="check" size={14} color="#0abab5" /> Верный ответ: {m.correctAns}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <button onClick={() => { setTestResultModal({show: false, score: 0, isPassed: false, title: '', mistakes: []}); closeTestModal(); }} style={{...errorBtnStyle, background: testResultModal.isPassed ? '#0abab5' : '#ff4d4d', color: testResultModal.isPassed ? '#000' : '#fff', marginTop: 0} as any}>
                            {testResultModal.isPassed ? 'ОТЛИЧНО' : 'ПОНЯТНО'}
                        </button>
                    </div>
                </div>
            )}

            {/* ФУЛСКРИН LIGHTBOX ДЛЯ ПРОСМОТРА ФОТО */}
            {zoomedImg && (
                <div className="vates-material-lightbox-overlay" style={lightboxOverlay as any} onClick={() => setZoomedImg(null)}>
                    <div onClick={() => setZoomedImg(null)} style={{position: 'absolute', top: '20px', right: '30px', cursor: 'pointer', fontSize: '40px', color: '#ff4d4d', fontWeight: 'bold', zIndex: 90001, textShadow: '0 2px 10px rgba(0,0,0,0.5)'}}>X</div>
                    <img src={zoomedImg} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '15px'}} alt="Zoomed" />
                </div>
            )}

            <style jsx global>{`
                .anti-cheat { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
                .test-answer-btn { padding: 20px 30px; background: #111; color: #fff; border-radius: 18px; cursor: pointer; border: 1px solid #222; font-weight: 800; margin-bottom: 12px; transition: all 0.2s ease; }
                .test-answer-btn:hover { border-color: rgba(10, 186, 181, 0.45); background: rgba(10, 186, 181, 0.14); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }
                .test-answer-btn.selected { background: #0abab5 !important; color: #000 !important; border-color: #0abab5 !important; transform: scale(0.98); }
                
                .premium-cards-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; width: 100%; align-items: stretch; }
                .premium-card { background: #111; border-radius: 14px; border: 1px solid #222; transition: all 0.2s ease; position: relative; cursor: pointer; display: flex; flex-direction: column; width: 100%; min-height: 148px; padding: 16px; box-sizing: border-box; overflow: hidden; word-break: normal; overflow-wrap: break-word; }
                .premium-card:hover { border-color: rgba(10, 186, 181, 0.45); transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.18); }
                .premium-card:active { background: rgba(10, 186, 181, 0.14); border-color: rgba(10,186,181,0.45); transform: translateY(2px) scale(0.97); }
                .premium-card h4 { min-height: 44px; }
                .deadline-card:hover { border-color: #ff4d4d !important; box-shadow: 0 8px 25px rgba(255, 77, 77, 0.15) !important; }
                .deadline-card:active { background: rgba(255, 77, 77, 0.05) !important; border-color: #ff4d4d !important; }

                .education-create-wrap { position: relative; z-index: 30; }
                .education-create-trigger { display: inline-flex; align-items: center; gap: 8px; }
                .education-create-trigger > span { font-size: 15px; line-height: 1; }
                .education-create-menu {
                    position: absolute;
                    top: calc(100% + 9px);
                    right: 0;
                    width: 264px;
                    padding: 7px;
                    background: #121716;
                    border: 1px solid #2b3734;
                    border-radius: 17px;
                    box-shadow: 0 22px 50px rgba(0, 0, 0, 0.42);
                }
                .education-create-menu > button {
                    width: 100%;
                    display: grid;
                    grid-template-columns: 38px minmax(0, 1fr);
                    align-items: center;
                    gap: 11px;
                    padding: 10px;
                    color: #fff;
                    background: transparent;
                    border: 0;
                    border-radius: 12px;
                    cursor: pointer;
                    text-align: left;
                }
                .education-create-menu > button:hover { background: rgba(10, 186, 181, 0.1); }
                .education-create-menu > button > span:last-child { min-width: 0; }
                .education-create-menu strong { display: block; font-size: 12px; font-weight: 900; }
                .education-create-menu small { display: block; margin-top: 3px; color: #72827f; font-size: 10px; font-weight: 650; }
                .education-create-icon {
                    width: 36px;
                    height: 36px;
                    display: grid;
                    place-items: center;
                    color: #8da09c;
                    background: #202725;
                    border: 1px solid #303b38;
                    border-radius: 11px;
                    font-size: 18px;
                    font-weight: 950;
                }
                .education-create-icon.is-ai { color: #001817; background: #20dfd3; border-color: #20dfd3; font-size: 10px; }
                .ai-review-banner {
                    padding: 15px;
                    margin: -8px 0 22px;
                    color: #9db0ac;
                    background: linear-gradient(135deg, rgba(10, 186, 181, 0.12), rgba(10, 186, 181, 0.035));
                    border: 1px solid rgba(32, 223, 211, 0.25);
                    border-radius: 15px;
                }
                .ai-review-banner-head { display: flex; align-items: center; gap: 9px; }
                .ai-review-banner-head span { padding: 5px 7px; color: #001817; background: #20dfd3; border-radius: 6px; font-size: 9px; font-weight: 950; letter-spacing: 0.8px; }
                .ai-review-banner-head strong { color: #eafffc; font-size: 12px; }
                .ai-review-banner p { margin: 10px 0 0; font-size: 11px; line-height: 1.55; }
                .ai-review-banner > small { display: block; margin-top: 8px; color: #e0aa55; font-size: 10px; line-height: 1.45; }

                html[data-theme="light"] .education-create-menu { background: #fff; border-color: #cfdcd9; box-shadow: 0 22px 50px rgba(31, 59, 53, 0.18); }
                html[data-theme="light"] .education-create-menu > button { color: #172421; }
                html[data-theme="light"] .education-create-menu > button:hover { background: #eaf8f5; }
                html[data-theme="light"] .education-create-icon { color: #4b625d; background: #edf3f1; border-color: #d5e0dd; }
                html[data-theme="light"] .ai-review-banner { color: #506b65; background: linear-gradient(135deg, #e4f7f3, #f7fbfa); border-color: #acdcd5; }
                html[data-theme="light"] .ai-review-banner-head strong { color: #19332e; }

                /* СТИЛИ КНОПОК ДЕЙСТВИЙ (АДМИН) */
                .card-icon-btn {
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 1px solid #333;
                    background: #1a1a1a;
                }
                .move-btn { color: #fff; }
                .move-btn:hover { background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }

                .edit-btn { color: #0abab5; }
                .edit-btn:hover { background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }

                .del-btn { color: #ff4d4d; }
                .del-btn:hover { background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }

                .video-player-card {
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
                }
                .video-wrapper { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; background: #050505; border-radius: 18px; overflow: hidden; max-width: 100%; border: 1px solid rgba(255,255,255,0.04); }
                .video-embed-shell { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: hidden; }
                .video-embed-shell :global(.embedded-player-frame),
                .video-embed-shell :global(iframe),
                .video-embed-shell :global(object),
                .video-embed-shell :global(embed),
                .video-embed-shell :global(video) {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100% !important;
                    height: 100% !important;
                    max-width: 100% !important;
                    border: none;
                    display: block;
                }
                .video-embed-shell :global(*) {
                    max-width: 100%;
                }

                /* СТИЛИ ДЛЯ КАРТИНОК И ЗУМА */
                .image-zoom-container { position: relative; width: 100%; height: 220px; border-radius: 15px; overflow: hidden; cursor: pointer; margin-bottom: 15px; background: #111; }
                .image-zoom-container img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s ease; }
                .image-zoom-container:hover img { transform: scale(1.05); }
                .zoom-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease; }
                .image-zoom-container:hover .zoom-overlay { opacity: 1; }
                .zoom-icon { color: #fff; background: rgba(10,186,181,0.9); width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.5); transform: translateY(10px); transition: 0.3s ease; }
                .image-zoom-container:hover .zoom-icon { transform: translateY(0); }
                .tasks-theory-block { word-break: break-word; overflow-wrap: anywhere; }

                @media (max-width: 768px) {
                    /* Решение проблемы: 1 колонка на мобильных, чтобы карточки не ломали свою ширину */
                    .premium-cards-container { 
                        display: grid !important; 
                        grid-template-columns: 1fr !important; 
                        gap: 12px !important; 
                    }
                    .premium-card { 
                        width: 100% !important; 
                        max-width: none !important; 
                        padding: 16px !important; 
                        min-height: 136px !important; 
                    }
                    .premium-card h4 { font-size: 15px !important; min-height: 42px !important; }
                    .tasks-title { font-size: 24px !important; }
                    .tasks-theory-grid { grid-template-columns: 1fr !important; gap: 15px !important; }
                    .tasks-quiz-grid { grid-template-columns: 1fr !important; gap: 15px !important; }
                    .tasks-modal { padding: 30px 20px !important; border-radius: 25px !important; width: 95% !important; max-height: 90vh !important; }
                    .tasks-theory-block { padding: 20px !important; border-radius: 20px !important; }
                    .tasks-modal-header { flex-direction: column; align-items: flex-start !important; gap: 15px; margin-bottom: 25px !important; }
                    .tasks-modal-header h2 { font-size: 20px !important; padding: 0 !important; text-align: left !important; }
                    .desktop-spacer { display: none !important; }
                    .video-player-card {
                        padding: 12px !important;
                        border-radius: 20px !important;
                        margin-bottom: 24px !important;
                    }
                    .video-wrapper {
                        border-radius: 14px !important;
                        margin-left: -2px !important;
                        margin-right: -2px !important;
                        width: calc(100% + 4px) !important;
                        max-width: calc(100% + 4px) !important;
                    }
                    .video-player-description {
                        margin-top: 14px !important;
                        padding: 0 4px !important;
                        font-size: 14px !important;
                        line-height: 1.5 !important;
                    }
                    .education-create-menu { right: auto; left: 0; width: min(264px, calc(100vw - 40px)); }
                }
            `}</style>
        </section>
    );
}

const pBarBg: React.CSSProperties = { height: '8px', background: '#222', borderRadius: '4px', marginTop: '15px', marginBottom: '10px' };
const pBarFill = (w: number): React.CSSProperties => ({ width: `${w}%`, height: '100%', background: '#0abab5', borderRadius: '4px', transition: '1s' });
const sectionTitle: React.CSSProperties = { fontSize: '28px', fontWeight: '900', marginBottom: '35px' };
const flexSpace: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px', flexWrap: 'wrap', gap: '20px' };
const adminActionBtn: React.CSSProperties = { background: 'rgba(10,186,181,0.1)', color: '#0abab5', border: '1px solid rgba(10,186,181,0.3)', padding: '10px 20px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '13px', letterSpacing: '1px', transition: '0.2s' };
const cardFooter: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: '800', color: '#666' };
const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '20px', boxSizing: 'border-box' };
const modalContentLarge: React.CSSProperties = { background: '#000', padding: '60px', borderRadius: '50px', maxWidth: '1100px', width: '100%', border: '1px solid #222', maxHeight: '90vh', overflowY: 'auto' };
const modalContentSmall: React.CSSProperties = { background: '#111', padding: '40px 30px', borderRadius: '30px', width: '100%', maxWidth: '400px', border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' };
const modalContentMedium: React.CSSProperties = { background: '#111', padding: '40px 30px', borderRadius: '35px', width: '100%', maxWidth: '550px', border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' };
const checkKnowledgeBtn: React.CSSProperties = { width: '100%', padding: '25px', background: 'transparent', border: '2px solid #0abab5', color: '#0abab5', borderRadius: '20px', fontWeight: '900', fontSize: '18px', cursor: 'pointer', transition: '0.3s' };
const theoryBlock: React.CSSProperties = { background: '#0d0d0d', padding: '30px', borderRadius: '25px', border: '1px solid #222' };
const theoryLabel: React.CSSProperties = { fontSize: '15px', fontWeight: '800', color: '#0abab5', letterSpacing: '0.5px', marginBottom: '12px' };
const theoryText: React.CSSProperties = { fontSize: '15px', color: '#ccc', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' };
const lightboxOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.95)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' };
const boxesFlexWrapStyle = { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' };
const adminIn: React.CSSProperties = { width: '100%', padding: '16px', background: '#000', border: '1px solid #333', borderRadius: '15px', color: '#fff', marginBottom: '15px', outline: 'none', fontSize: '15px', boxSizing: 'border-box' };
const saveBtn: React.CSSProperties = { width: '100%', padding: '18px', background: '#0abab5', color: '#000', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', marginTop: '15px', fontSize: '15px', letterSpacing: '1px' };
const cancelLink: React.CSSProperties = { textAlign: 'center', marginTop: '20px', color: '#666', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' };
const errorOverlayStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 40000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(12px)' };
const errorModalContent: React.CSSProperties = { background: '#111', padding: '50px', borderRadius: '40px', border: '2px solid #222', textAlign: 'center', maxWidth: '450px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)' };
const errorBtnStyle: React.CSSProperties = { border: 'none', padding: '18px 40px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '15px', letterSpacing: '1px', marginTop: '15px', width: '100%' };
const quizBox: React.CSSProperties = { borderTop: '1px solid #222', paddingTop: '40px', marginTop: '10px' };
const backLink: React.CSSProperties = { color: '#0abab5', fontWeight: '900', marginBottom: '30px', cursor: 'pointer', display: 'inline-block', fontSize: '15px' };
