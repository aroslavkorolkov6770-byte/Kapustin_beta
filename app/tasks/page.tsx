"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Navigation from '@/app/components/Navigation';
import CustomIcon from '@/app/components/CustomIcon';
import { fetchStorageBatch, saveDataToServer } from '@/app/lib/storageClient';

import { DEFAULT_TRAINING_TESTS } from '@/app/tasks/data/defaultTrainingTests';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    applyClientAuthState,
    clearClientAuthState,
    isClientAdminView,
    type ClientSessionUser,
} from '@/app/lib/authClient';

// --- ИМПОРТ НАШИХ МОДУЛЕЙ ---
import Education from './components/Education';
import AIAssistant from './components/AIAssistant';
import Documents from './components/Documents';
import Products from './components/Products';
import LearningPaths from './components/LearningPaths';

// --- КЛЮЧИ ПАМЯТИ ---
const STORAGE_KEYS = {
    ONBOARD_ROUTE: 'tea_hub_onboard_route_v2',
    DYNAMIC_TESTS: 'tea_hub_dynamic_tests_v1',   
    DYNAMIC_ROUTE: 'tea_hub_dynamic_route_v2',     
    TESTS_PROGRESS: 'tea_hub_tests_progress_v1',
    URGENT_FILES: 'tea_hub_urgent_files_v1'        
};

const CLIENT_CACHE_KEYS = {
    URGENT_FILES: 'th_cache_urgent_files_v1',
    DYNAMIC_ROUTE: 'th_cache_dynamic_route_v2',
    DYNAMIC_TESTS: 'th_cache_dynamic_tests_v1',
};

const LEARNING_MILESTONES = [
    { value: 0, label: 'Старт', description: 'Начало пути' },
    { value: 25, label: '25%', description: 'Первый рубеж' },
    { value: 50, label: '50%', description: 'Половина пути' },
    { value: 75, label: '75%', description: 'Финишная прямая' },
    { value: 100, label: 'Финиш', description: 'Весь путь' },
] as const;

function ShiftContent() {
  const searchParams = useSearchParams();
  const router = useRouter(); 
  const backgroundSessionCheckRef = React.useRef(0);
  const activeTabRef = React.useRef('welcome');
  const latestLoadRequestRef = React.useRef(0);
  
  const [isMounted, setIsMounted] = useState(false);
  const [isSessionValidated, setIsSessionValidated] = useState(false);
  const [activeTab, setActiveTab] = useState('welcome');
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string>('');
  
  // --- ГЛОБАЛЬНЫЕ ДАННЫЕ (ПЕРЕДАЮТСЯ В МОДУЛИ КАК PROPS) ---
  const [dynamicRoute, setDynamicRoute] = useState<any[]>([]);
  const [dynamicTests, setDynamicTests] = useState<any[]>(DEFAULT_TRAINING_TESTS);
  const [completedRoute, setCompletedRoute] = useState<string[]>([]);
  const [completedTests, setCompletedTests] = useState<string[]>([]); 
  const [urgentFiles, setUrgentFiles] = useState<any[]>([]);
  const [passedTests, setPassedTests] = useState<string[]>([]);
  const [dismissedTasks, setDismissedTasks] = useState<string[]>([]);

  // --- СОСТОЯНИЯ ДЛЯ УПРАВЛЕНИЯ МОДАЛКАМИ ИЗ ПОИСКА ---
  const [selectedRouteStep, setSelectedRouteStep] = useState<any>(null);
  const [selectedTest, setSelectedTest] = useState<any>(null); 

  // --- СОСТОЯНИЕ УВЕДОМЛЕНИЙ PUSH ---
  
  

  useEffect(() => {
      activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
      const refreshViewMode = () => {
          setIsAdmin(isClientAdminView());
      };

      window.addEventListener('teaHubViewModeChanged', refreshViewMode);
      window.addEventListener('storage', refreshViewMode);

      return () => {
          window.removeEventListener('teaHubViewModeChanged', refreshViewMode);
          window.removeEventListener('storage', refreshViewMode);
      };
  }, []);

  const hydrateCachedData = (currentUserId: string) => {
      if (typeof window === 'undefined') {
          return;
      }

      try {
          const cachedUrgentFiles = localStorage.getItem(CLIENT_CACHE_KEYS.URGENT_FILES);
          const cachedDynamicRoute = localStorage.getItem(CLIENT_CACHE_KEYS.DYNAMIC_ROUTE);
          const cachedDynamicTests = localStorage.getItem(CLIENT_CACHE_KEYS.DYNAMIC_TESTS);
          const cachedCompletedRoute = localStorage.getItem(`th_prog_route_${currentUserId}`);
          const cachedCompletedTests = localStorage.getItem(`th_prog_tests_${currentUserId}`);
          const cachedPassedTests = localStorage.getItem(`th_cache_passed_tests_${currentUserId}`);
          const cachedDismissedTasks = localStorage.getItem(`th_dismissed_tasks_${currentUserId}`);

          if (cachedUrgentFiles) {
              const parsed = JSON.parse(cachedUrgentFiles);
              if (Array.isArray(parsed)) setUrgentFiles(parsed);
          }

          if (cachedDynamicRoute) {
              const parsed = JSON.parse(cachedDynamicRoute);
              if (Array.isArray(parsed)) setDynamicRoute(parsed);
          }

          if (cachedDynamicTests) {
              const parsed = JSON.parse(cachedDynamicTests);
              if (Array.isArray(parsed) && parsed.length > 0) setDynamicTests(parsed);
          }

          if (cachedCompletedRoute) {
              const parsed = JSON.parse(cachedCompletedRoute);
              if (Array.isArray(parsed)) setCompletedRoute(parsed);
          }

          if (cachedCompletedTests) {
              const parsed = JSON.parse(cachedCompletedTests);
              if (Array.isArray(parsed)) setCompletedTests(parsed);
          }

          if (cachedPassedTests) {
              const parsed = JSON.parse(cachedPassedTests);
              if (Array.isArray(parsed)) setPassedTests(parsed);
          }

          if (cachedDismissedTasks) {
              const parsed = JSON.parse(cachedDismissedTasks);
              if (Array.isArray(parsed)) setDismissedTasks(parsed);
          }
      } catch (error) {
          console.error('Ошибка чтения локального кеша задач:', error);
      }
  };

  const loadAllData = async (currentUserId: string, checkUrl = false) => {
      const requestId = latestLoadRequestRef.current + 1;
      latestLoadRequestRef.current = requestId;

      try {
          const storageData = await fetchStorageBatch([
              STORAGE_KEYS.URGENT_FILES,
              `prog_route_${currentUserId}`,
              `prog_tests_${currentUserId}`,
              STORAGE_KEYS.DYNAMIC_TESTS,
              STORAGE_KEYS.DYNAMIC_ROUTE,
              `th_passed_tests_${currentUserId}`,
              `dismissed_tasks_${currentUserId}`,
          ]);

          const sFiles = storageData[STORAGE_KEYS.URGENT_FILES];
          const cRoute = storageData[`prog_route_${currentUserId}`];
          const cTests = storageData[`prog_tests_${currentUserId}`];
          const sTestsData = storageData[STORAGE_KEYS.DYNAMIC_TESTS];
          const sRouteData = storageData[STORAGE_KEYS.DYNAMIC_ROUTE];
          const pTestsRes = storageData[`th_passed_tests_${currentUserId}`];
          const sDismissed = storageData[`dismissed_tasks_${currentUserId}`];

          if (requestId !== latestLoadRequestRef.current) {
              return;
          }

          if (Array.isArray(sFiles)) {
              setUrgentFiles(sFiles);
              localStorage.setItem(CLIENT_CACHE_KEYS.URGENT_FILES, JSON.stringify(sFiles));
          }

          if (Array.isArray(cRoute)) {
              setCompletedRoute(cRoute);
              localStorage.setItem(`th_prog_route_${currentUserId}`, JSON.stringify(cRoute));
          }

          if (Array.isArray(cTests)) {
              setCompletedTests(cTests);
              localStorage.setItem(`th_prog_tests_${currentUserId}`, JSON.stringify(cTests));
          }

          if (Array.isArray(pTestsRes)) {
              setPassedTests(pTestsRes);
              localStorage.setItem(`th_cache_passed_tests_${currentUserId}`, JSON.stringify(pTestsRes));
          }

          if (Array.isArray(sDismissed)) {
              setDismissedTasks(sDismissed);
              localStorage.setItem(`th_dismissed_tasks_${currentUserId}`, JSON.stringify(sDismissed));
          }

          if (Array.isArray(sTestsData)) {
              const resolvedTests = sTestsData.length > 0 ? sTestsData : DEFAULT_TRAINING_TESTS;
              setDynamicTests(resolvedTests);
              localStorage.setItem(CLIENT_CACHE_KEYS.DYNAMIC_TESTS, JSON.stringify(resolvedTests));
          }

          if (Array.isArray(sRouteData)) {
              setDynamicRoute(sRouteData);
              localStorage.setItem(CLIENT_CACHE_KEYS.DYNAMIC_ROUTE, JSON.stringify(sRouteData));
          }

      } catch (e) {
          console.error("Ошибка синхронизации с сервером", e);
      }
  };

  

  useEffect(() => {
    setIsMounted(true);
    let isDisposed = false;

    const verifyProtectedSession = async (redirectOnUnauthorized: boolean) => {
        try {
            let sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });

            if (sessionResponse.status === 401) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
            }

            if (sessionResponse.status === 401) {
                if (redirectOnUnauthorized) {
                    clearClientAuthState();
                    if (!isDisposed) {
                        setIsSessionValidated(false);
                        router.replace('/');
                    }
                }
                return false;
            }

            if (!sessionResponse.ok) {
                return null;
            }

            const sessionData = await sessionResponse.json().catch(() => null);
            const sessionUser = sessionData?.user;
            if (!sessionData?.authenticated || !sessionUser) {
                return null;
            }

            const normalizedUser = {
                id: sessionUser.id,
                login: sessionUser.login,
                role: sessionUser.role,
                name: sessionUser.name || (sessionUser.role === 'admin' ? 'Главный Мастер' : 'Сотрудник'),
                systemAccount: Boolean(sessionUser.systemAccount),
                ghostAccount: Boolean(sessionUser.ghostAccount),
                profileDisabled: Boolean(sessionUser.profileDisabled),
                profileOwnerOnly: Boolean(sessionUser.profileOwnerOnly),
                hideFromStats: Boolean(sessionUser.hideFromStats),
                canSwitchMode: Boolean(sessionUser.canSwitchMode),
                accountLabel: sessionUser.accountLabel || '',
            } satisfies ClientSessionUser;
            applyClientAuthState(normalizedUser);

            const currentId = normalizedUser.id;
            if (!isDisposed) {
                setIsAdmin(isClientAdminView(normalizedUser));
                setUserId(currentId);
                setIsSessionValidated(true);
            }

            if (typeof window !== 'undefined' && !isDisposed) {
                
                
            }

            return currentId;
        } catch (error) {
            console.error('Ошибка проверки защищенной сессии:', error);
            return null;
        }
    };

    const bootPage = async () => {
        const currentId = await verifyProtectedSession(true);
        if (!currentId) {
            return;
        }

        hydrateCachedData(currentId);
        await loadAllData(currentId, true);
    };

    bootPage();

    const syncInterval = setInterval(async () => {
        if (document.visibilityState !== 'visible') {
            return;
        }

        if (activeTabRef.current === 'products') {
            return;
        }

        const currentId = localStorage.getItem('current_user_id') || 'guest';
        if (currentId && currentId !== 'guest') {
            loadAllData(currentId, false);
        }

        const now = Date.now();
        if (now - backgroundSessionCheckRef.current > 60_000) {
            backgroundSessionCheckRef.current = now;
            await verifyProtectedSession(false);
        }
    }, 20000);

    const focusHandler = async () => {
        if (activeTabRef.current === 'products') {
            return;
        }
        const currentId = await verifyProtectedSession(false);
        if (currentId) {
            loadAllData(currentId, false);
        }
    };
    window.addEventListener('focus', focusHandler);

    return () => {
        isDisposed = true;
        clearInterval(syncInterval);
        window.removeEventListener('focus', focusHandler);
    };
  }, [router]);

  useEffect(() => {
      const urlTab = searchParams.get('tab');
      const normalizedTab = urlTab === 'assortment' ? 'products' : urlTab;
      if (normalizedTab && normalizedTab !== activeTab) {
          setActiveTab(normalizedTab);
      }
      if (urlTab === 'assortment') {
          router.replace('/tasks?tab=products');
      }
  }, [activeTab, router, searchParams]);

  const lastHandledParams = React.useRef("");
  useEffect(() => {
      if (!isMounted) return;
      const currentParams = searchParams.toString();
      
      if (lastHandledParams.current === currentParams) return; 
      if (dynamicRoute.length === 0 && dynamicTests.length === 0) return;

      let handled = false;
      
      const rId = searchParams.get('routeId');
      if (rId && dynamicRoute.length > 0) {
          const step = dynamicRoute.find(r => r.id === rId);
          if (step) {
              setSelectedRouteStep(step);
              handled = true;
          }
      }

      const tId = searchParams.get('testId');
      if (tId && dynamicTests.length > 0) {
          const testIdx = dynamicTests.findIndex(t => t.id === tId);
          if (testIdx !== -1) {
              const isUnlocked = testIdx === 0 || completedTests.includes(dynamicTests[testIdx - 1].id);
              if (isUnlocked) {
                  setSelectedTest(dynamicTests[testIdx]);
              } else {
                  alert(`Для разблокировки этого этапа сначала необходимо успешно сдать Тест ${testIdx}`);
              }
              handled = true;
          }
      }

      if (handled) lastHandledParams.current = currentParams;
  }, [searchParams, dynamicRoute, dynamicTests, completedTests, isMounted]);

  const closeRouteModal = () => {
      setSelectedRouteStep(null);
      if (searchParams.has('routeId')) {
          router.replace('/tasks?tab=edu', { scroll: false });
      }
  };

  const closeTestModal = () => {
      setSelectedTest(null);
      if (searchParams.has('testId')) {
          router.replace('/tasks?tab=edu', { scroll: false });
      }
  };

  const closeLinkedDocument = () => {
      if (searchParams.has('documentId')) {
          router.replace('/tasks?tab=docs');
      }
  };

  if (!isMounted || !isSessionValidated) return null;

  const visibleRouteSteps = dynamicRoute.filter((step) => !step?.isPlaceholder);
  const visibleTests = dynamicTests.filter((test) => !test?.isPlaceholder);
  const completedRouteIds = new Set(completedRoute);
  const completedTestIds = new Set(completedTests);
  const completedRouteCount = visibleRouteSteps.filter((step) => completedRouteIds.has(step.id)).length;
  const completedTestCount = visibleTests.filter((test) => completedTestIds.has(test.id)).length;
  const routePercent = visibleRouteSteps.length > 0
      ? Math.min(100, Math.round((completedRouteCount / visibleRouteSteps.length) * 100))
      : 0;
  const nextRouteStep = visibleRouteSteps.find((step) => !completedRouteIds.has(step.id)) || null;
  const nextMilestone = [25, 50, 75, 100].find((value) => value > routePercent) || 100;
  const milestoneTargetCount = visibleRouteSteps.length > 0
      ? Math.ceil((nextMilestone / 100) * visibleRouteSteps.length)
      : 0;
  const blocksToMilestone = Math.max(0, milestoneTargetCount - completedRouteCount);
  const dashboardRouteSteps = visibleRouteSteps.slice(0, 6);
  const openEducationSection = (sectionId: 'topics' | 'tests') => {
      router.push(`/tasks?tab=edu#${sectionId}`, { scroll: false });
  };
  const openNextRouteStep = () => {
      if (nextRouteStep?.id) {
          setSelectedRouteStep(nextRouteStep);
          setActiveTab('edu');
          router.push(`/tasks?tab=edu&routeId=${encodeURIComponent(nextRouteStep.id)}`, { scroll: false });
          return;
      }

      openEducationSection('topics');
  };

  return (
    <div className="vates-app-page vates-tasks-page" style={{ backgroundColor: '#0d0f0d', minHeight: '100vh', color: '#fff', display: 'flex', transition: '0.3s', overflowX: 'hidden' }}>
      <Navigation />
      
      <div className="desktop-sidebar-spacer" aria-hidden="true" />

      <main className="tasks-main" style={{ flex: 1, padding: '120px 60px 60px 60px', transition: '0.3s', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
        
        

        {/* --- ВКЛАДКА 1: СТАТИСТИКА (ДАШБОРД) --- */}
        {activeTab === 'welcome' && (
            <div className="vates-staff-dashboard" style={{ animation: 'fadeInUp 0.6s ease' }}>
                <header className="vates-page-heading">
                    <div>
                        <span className="vates-eyebrow">Рабочее пространство</span>
                        <h1>Моё обучение</h1>
                        <p>Ваш прогресс, обязательные материалы и ближайшие учебные шаги.</p>
                    </div>
                </header>

                <section className="vates-staff-progress-overview" aria-labelledby="staff-progress-title">
                    <div className="vates-staff-progress-summary">
                        <div className="vates-staff-progress-main">
                            <span className="vates-eyebrow">Прогресс обязательного обучения</span>
                            <div className="vates-staff-progress-value-row">
                                <h2 id="staff-progress-title">{routePercent}%</h2>
                                <span className="vates-staff-progress-state">
                                    <span aria-hidden="true" />
                                    {routePercent >= 100 ? 'Завершено' : routePercent > 0 ? 'В процессе' : 'Не начато'}
                                </span>
                            </div>
                            <p className="vates-staff-progress-count">
                                <strong>{completedRouteCount} из {visibleRouteSteps.length}</strong> обязательных тем завершено
                            </p>
                            <p className="vates-staff-progress-explainer">
                                Показатель отражает только назначенный учебный путь. Результаты тестов учитываются отдельно.
                            </p>
                        </div>

                        <div className="vates-staff-milestone">
                            <span>Ближайший рубеж</span>
                            <strong>{nextMilestone}%</strong>
                            <small>
                                {blocksToMilestone > 0
                                    ? `ещё ${blocksToMilestone} ${blocksToMilestone === 1 ? 'тема' : blocksToMilestone < 5 ? 'темы' : 'тем'}`
                                    : 'рубеж достигнут'}
                            </small>
                        </div>
                    </div>

                    <div className="vates-staff-chart-heading">
                        <div>
                            <strong>Динамика обучения</strong>
                            <span>Фактический прогресс по завершённым темам</span>
                        </div>
                        <span>С начала пути</span>
                    </div>

                     <div className="vates-staff-learning-chart" role="img" aria-label={`Завершено ${completedRouteCount} из ${visibleRouteSteps.length} обязательных тем`}>
                         <div className="vates-staff-chart-summary">
                             <div>
                                 <span>Маршрут обучения</span>
                                 <strong>{completedRouteCount} из {visibleRouteSteps.length} тем</strong>
                             </div>
                             <span>{routePercent}% пройдено</span>
                         </div>

                         <div className="vates-staff-progress-scale" aria-hidden="true">
                             <div className="vates-staff-progress-track">
                                 <div className="vates-staff-progress-track-fill" style={{ width: `${routePercent}%` }} />
                                 {LEARNING_MILESTONES.map((milestone) => {
                                     const isComplete = routePercent >= milestone.value;
                                     const isNext = routePercent < milestone.value && milestone.value === nextMilestone;
                                     return (
                                         <span
                                             key={milestone.value}
                                             className={`vates-staff-progress-stop ${isComplete ? 'is-complete' : ''} ${isNext ? 'is-next' : ''}`}
                                             style={{ left: `${milestone.value}%` }}
                                         />
                                     );
                                 })}
                                 <span
                                     className={`vates-staff-progress-current ${routePercent === 0 ? 'is-start' : ''} ${routePercent >= 100 ? 'is-end' : ''}`}
                                     style={{ left: `${routePercent}%` }}
                                 >
                                     <span>Сейчас</span>
                                 </span>
                             </div>

                             <div className="vates-staff-progress-scale-labels">
                                 {LEARNING_MILESTONES.map((milestone, index) => (
                                     <span
                                         key={milestone.value}
                                         className={`vates-staff-progress-scale-label ${index === 0 ? 'is-start' : ''} ${index === LEARNING_MILESTONES.length - 1 ? 'is-end' : ''} ${routePercent >= milestone.value ? 'is-complete' : ''}`}
                                     >
                                         <strong>{milestone.label}</strong>
                                         <small>{milestone.description}</small>
                                     </span>
                                 ))}
                             </div>
                         </div>

                         <div className="vates-staff-progress-scale-footer">
                             <span className="vates-staff-progress-legend">
                                 <span aria-hidden="true" /> Пройдено
                             </span>
                             <span className="vates-staff-progress-next">
                                 {blocksToMilestone > 0
                                     ? `До следующего рубежа ещё ${blocksToMilestone} ${blocksToMilestone === 1 ? 'тема' : blocksToMilestone < 5 ? 'темы' : 'тем'}`
                                     : 'Все рубежи пройдены'}
                             </span>
                         </div>
                     </div>

                    <div className="vates-staff-progress-action">
                        <div>
                            <span>Следующее действие</span>
                            <strong>{nextRouteStep?.title || 'Обязательный путь завершён'}</strong>
                        </div>
                        <button type="button" className="vates-button primary" onClick={openNextRouteStep}>
                            {nextRouteStep ? 'Продолжить обучение' : 'Открыть материалы'}
                            <span aria-hidden="true">→</span>
                        </button>
                    </div>
                </section>

                <div className="vates-staff-kpis">
                    <button type="button" className="vates-staff-kpi" onClick={() => openEducationSection('topics')} aria-label="Перейти к темам">
                        <CustomIcon name="book" size={22} color="var(--vates-accent)" />
                        <span>Темы</span>
                        <strong>{completedRouteCount}/{visibleRouteSteps.length}</strong>
                    </button>
                    <button type="button" className="vates-staff-kpi" onClick={() => openEducationSection('tests')} aria-label="Перейти к тестам">
                        <CustomIcon name="cap" size={22} color="var(--vates-accent)" />
                        <span>Тесты</span>
                        <strong>{completedTestCount}/{visibleTests.length}</strong>
                    </button>
                    <button type="button" className="vates-staff-kpi" onClick={() => router.push('/tasks?tab=docs')} aria-label="Перейти к документам">
                        <CustomIcon name="file" size={22} color="var(--vates-accent)" />
                        <span>Документы</span>
                        <strong>{urgentFiles.length}</strong>
                    </button>
                </div>

                <div className="vates-staff-action-grid">
                    <section className="vates-staff-next-panel">
                        <div className="vates-staff-panel-heading">
                            <div>
                                <span className="vates-eyebrow">Сейчас</span>
                                <h2>Следующий шаг</h2>
                            </div>
                            <span className="vates-staff-time-chip">{nextRouteStep?.time || '5 мин'}</span>
                        </div>
                        <div className="vates-staff-next-body">
                            <span className="vates-staff-step-number">
                                {String(Math.min(completedRouteCount + 1, Math.max(visibleRouteSteps.length, 1))).padStart(2, '0')}
                            </span>
                            <div>
                                <span className="vates-staff-step-type">
                                    Тема · шаг {Math.min(completedRouteCount + 1, Math.max(visibleRouteSteps.length, 1))} из {visibleRouteSteps.length}
                                </span>
                                <h3>{nextRouteStep?.title || 'Все обязательные темы завершены'}</h3>
                                <p>
                                    {nextRouteStep
                                        ? 'Продолжите назначенный путь с ближайшего незавершённого материала.'
                                        : 'Можно вернуться к материалам или перейти к проверке знаний.'}
                                </p>
                                <button type="button" className="vates-button primary" onClick={openNextRouteStep}>
                                    {nextRouteStep ? 'Открыть материал' : 'Открыть материалы'}
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="vates-staff-tests-panel">
                        <div className="vates-staff-panel-heading">
                            <div>
                                <span className="vates-eyebrow">Проверка знаний</span>
                                <h2>Тесты</h2>
                            </div>
                            <strong className="vates-staff-tests-score">{completedTestCount}<span>/{visibleTests.length}</span></strong>
                        </div>
                        <div className="vates-staff-tests-body">
                            <span className="vates-staff-tests-icon"><CustomIcon name="cap" size={22} color="currentColor" accent="none" /></span>
                            <h3>{completedTestCount > 0 ? 'Результаты сохраняются отдельно' : 'Проверок пока не было'}</h3>
                            <p>Откройте список тестов, чтобы увидеть доступные проверки и результаты.</p>
                            <button type="button" className="vates-button secondary" onClick={() => openEducationSection('tests')}>
                                Перейти к тестам
                            </button>
                        </div>
                    </section>
                </div>

                <section className="vates-staff-path-panel">
                    <div className="vates-staff-panel-heading">
                        <div>
                            <span className="vates-eyebrow">Назначенная программа</span>
                            <h2>Ход обучения</h2>
                            <p>Обязательные темы открываются последовательно.</p>
                        </div>
                        <button type="button" className="vates-staff-text-button" onClick={() => openEducationSection('topics')}>
                            Открыть программу <span aria-hidden="true">→</span>
                        </button>
                    </div>

                    {dashboardRouteSteps.length > 0 ? (
                        <ol className="vates-staff-path-list">
                            {dashboardRouteSteps.map((step, index) => {
                                const isComplete = completedRouteIds.has(step.id);
                                const isCurrent = nextRouteStep?.id === step.id;

                                return (
                                    <li key={step.id} className={`${isComplete ? 'is-complete' : ''} ${isCurrent ? 'is-current' : ''}`}>
                                        <span className="vates-staff-path-marker">
                                            {isComplete ? <CustomIcon name="check" size={15} color="currentColor" accent="none" /> : index + 1}
                                        </span>
                                        <div>
                                            <strong>{step.title || `Тема ${index + 1}`}</strong>
                                            <span>{isComplete ? 'Тема изучена' : isCurrent ? 'Текущий шаг' : 'Следующий этап программы'}</span>
                                        </div>
                                        <span className="vates-staff-path-state">{isComplete ? 'Готово' : isCurrent ? 'Сейчас' : 'Далее'}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    ) : (
                        <div className="vates-staff-path-empty">Учебный путь пока не назначен.</div>
                    )}
                </section>
            </div>
        )}

        {/* --- ВКЛАДКА 2: ОБУЧЕНИЕ --- */}
        {activeTab === 'edu' && (
            <Education 
                isAdmin={isAdmin}
                userId={userId}
                dynamicRoute={dynamicRoute} setDynamicRoute={setDynamicRoute}
                completedRoute={completedRoute} setCompletedRoute={setCompletedRoute}
                dynamicTests={dynamicTests} setDynamicTests={setDynamicTests}
                completedTests={completedTests} setCompletedTests={setCompletedTests}
                urgentFiles={urgentFiles}
                passedTests={passedTests} setPassedTests={setPassedTests}
                dismissedTasks={dismissedTasks} setDismissedTasks={setDismissedTasks}
                selectedRouteStep={selectedRouteStep} setSelectedRouteStep={setSelectedRouteStep}
                closeRouteModal={closeRouteModal}
                selectedTest={selectedTest} setSelectedTest={setSelectedTest}
                closeTestModal={closeTestModal}
            />
        )}

        {/* --- ВКЛАДКА 2.1: УЧЕБНЫЕ ПУТИ --- */}
        {activeTab === 'paths' && (
            <LearningPaths
                isAdmin={isAdmin}
                dynamicRoute={dynamicRoute}
                dynamicTests={dynamicTests}
            />
        )}

        {/* --- ВКЛАДКА 2.2: ДОКУМЕНТЫ --- */}
        {activeTab === 'docs' && (
            <Documents 
                isAdmin={isAdmin}
                userId={userId}
                urgentFiles={urgentFiles}
                setUrgentFiles={setUrgentFiles}
                linkedDocumentId={searchParams.get('documentId')}
                onCloseLinkedDocument={closeLinkedDocument}
            />
        )}

        {/* --- ВКЛАДКА 3: ТОВАРЫ --- */}
        {activeTab === 'products' && (
            <Products 
                isAdmin={isAdmin} 
                userId={userId}
            />
        )}

        {/* --- ВКЛАДКА 4: ИИ ПОМОЩНИК --- */}
        {activeTab === 'standards' && (
            <AIAssistant userId={userId} isAdmin={isAdmin} />
        )}

      </main>

      <style jsx global>{` 
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } 
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        
        * { box-sizing: border-box; }
        body { overflow-x: hidden; width: 100vw; margin: 0; padding: 0; }

        @media (max-width: 767px) {
            .desktop-sidebar-spacer { display: none !important; width: 0 !important; }
            
            .tasks-main { padding: 90px 15px 50px 15px !important; }
            .tasks-title { font-size: 26px !important; margin-bottom: 25px !important; line-height: 1.2 !important; }
            .tasks-chart-card { padding: 25px 20px !important; border-radius: 25px !important; }
            .tasks-stat-card { padding: 25px 20px !important; border-radius: 25px !important; }
            
            .tasks-dashboard-grid { grid-template-columns: 1fr !important; gap: 15px !important; }
            
            .tasks-big-val { font-size: 38px !important; flex-wrap: wrap; }
            .tasks-chart-container { height: 160px !important; margin-top: 25px !important; }

            .tasks-flex-space { flex-direction: column; align-items: flex-start !important; gap: 15px !important; margin-bottom: 25px !important; }
        }
      `}</style>
    </div>
  );
}

export default function ShiftPage() {
    return <Suspense><ShiftContent /></Suspense>;
}
