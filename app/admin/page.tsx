"use client";
import { createInAppNotification } from '@/app/lib/inAppNotifications';
import React, { useState, useEffect } from 'react';
import Navigation from '@/app/components/Navigation';
import CustomIcon from '@/app/components/CustomIcon';
import { fetchStorageBatch, saveDataToServer } from '@/app/lib/storageClient';

import { useRouter } from 'next/navigation';
import {
  applyClientAuthState,
  getClientViewMode,
  type ClientSessionUser,
} from '@/app/lib/authClient';
import { getVisibleWorkspaceUsers, isSystemWorkspaceAccount } from '@/app/lib/userVisibility';

import UserManagement from './components/UserManagement';
import InteractionCenter from './components/InteractionCenter';
import CalendarWidget from './components/CalendarWidget';
import UserProfileModal from './components/UserProfileModal';
import TestEditorModal from './components/TestEditorModal';
import TestResultsModal from './components/TestResultsModal';
import VatesAdminOverview from './components/VatesAdminOverview';

import { noteOverlayStyle, noteSidebarStyle, noteTextarea, noteDeleteBtn, adminSendBtn, flexSpace, sectionTitle, adminIn, saveBtn, modalOverlay, modalContentSmall } from './components/adminStyles';

const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const NOTE_TITLE_MAX_LENGTH = 120;
const NOTE_BODY_MAX_LENGTH = 2000;
const ADMIN_CACHE_KEYS = {
  NOTES: 'th_admin_notes_v1',
  USERS: 'th_admin_users_v1',
  TEST_RESULTS: 'th_admin_test_results_v1',
  URGENT_FILES: 'th_admin_urgent_files_v1',
  ROUTE: 'th_admin_dynamic_route_v2',
  TESTS: 'th_admin_dynamic_tests_v1',
  TEST_TYPES: 'th_admin_test_types_v1',
  USER_PROFILES: 'th_admin_user_profiles_v1',
  USER_AVATARS: 'th_admin_user_avatars_v1',
  USER_STATS: 'th_admin_user_stats_v1',
};

type DeadlineMaterialType = 'document' | 'route' | 'test';

type DeadlineMaterialReference = {
  type: DeadlineMaterialType;
  id: string;
  title: string;
};

type DeadlineMaterialOption = DeadlineMaterialReference & {
  section: string;
};



type UserPresence = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

const DEADLINE_MATERIAL_LABELS: Record<DeadlineMaterialType, string> = {
  document: 'документ',
  route: 'тема',
  test: 'тест',
};

const DEADLINE_MATERIAL_OBJECT_LABELS: Record<DeadlineMaterialType, string> = {
  document: 'документ',
  route: 'тему',
  test: 'тест',
};

const buildDeadlineTaskText = (
  noteText: string,
  selectedMaterial: DeadlineMaterialReference | null,
  materialType: DeadlineMaterialType,
  searchQuery: string,
) => {
  const enteredText = noteText.trim();
  if (enteredText) return enteredText;

  const materialTitle = selectedMaterial?.title.trim()
    || (materialType === 'test' ? searchQuery.trim() : '');
  if (!materialTitle) return '';

  if (materialType === 'document') return `Изучить документ «${materialTitle}»`;
  if (materialType === 'route') return `Изучить тему «${materialTitle}»`;
  return `Пройти тест «${materialTitle}»`;
};

const filterHiddenSystemResults = (results: any[], sourceUsers: any[]) => {
  const hiddenUsers = sourceUsers.filter((user) => isSystemWorkspaceAccount(user));
  const hiddenIds = new Set(hiddenUsers.map((user) => user.id));
  const hiddenNames = new Set(hiddenUsers.map((user) => user.name).filter(Boolean));

  return results.filter((result) => {
    const userId = String(result?.userId || '');
    const userName = String(result?.userName || '');
    return userId
      ? !hiddenIds.has(userId)
      : !(userName && hiddenNames.has(userName));
  });
};

export default function AdminDashboard() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isAccessValidated, setIsAccessValidated] = useState(false);
  const [activeAdminSection, setActiveAdminSection] = useState<'overview' | 'employees'>('overview');
  const [isProcessing, setIsProcessing] = useState(false);
  
  
  const [users, setUsers] = useState<any[]>([]);
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
  const [userPresence, setUserPresence] = useState<Record<string, UserPresence>>({});
  const [urgentFiles, setUrgentFiles] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [usersStats, setUsersStats] = useState<Record<string, {route: number, basics: number}>>({});
  const [totalBasicsModules, setTotalBasicsModules] = useState(50);
  const [totalRouteSteps, setTotalRouteSteps] = useState(5);
  const [dynamicRoute, setDynamicRoute] = useState<any[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<'personal' | 'deadline'>('personal');
  const [deadlineTarget, setDeadlineTarget] = useState<string>('Все');
  const [eventTab, setEventTab] = useState<'personal' | 'deadline'>('personal');

  const [dynamicTests, setDynamicTests] = useState<any[]>([]);
  const [deadlineMaterialType, setDeadlineMaterialType] = useState<DeadlineMaterialType>('test');
  const [selectedDeadlineMaterial, setSelectedDeadlineMaterial] = useState<DeadlineMaterialReference | null>(null);
  const [deadlineSearchQuery, setDeadlineSearchQuery] = useState("");
  const [showTestDropdown, setShowTestDropdown] = useState(false);

  const [testTypesList, setTestTypesList] = useState<any[]>([{ id: 't1', name: ' Итоговая аттестация' }, { id: 't2', name: ' Переаттестация' }]);
  const [interactionTab, setInteractionTab] = useState<'notif' | 'test'>('notif');
  const [selectedStaff, setSelectedStaff] = useState("Все");
  const [notifText, setNotifText] = useState("");
  const [testType, setTestType] = useState('');
  
  const [selectedProfileUser, setSelectedProfileUser] = useState<any>(null);
  const [editAuthMode, setEditAuthMode] = useState(false);
  const [editAuthLogin, setEditAuthLogin] = useState('');
  const [editAuthPass, setEditAuthPass] = useState('');

  const [showTestEditor, setShowTestEditor] = useState(false);
  const [testFormData, setTestFormData] = useState({ title: '', timeLimit: 0, quiz: [{ q: '', o: ['', '', '', ''], c: 0 }] });
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedTestUser, setSelectedTestUser] = useState("Все");

  const [showSuccessModal, setShowSuccessModal] = useState<{show: boolean, title: string, text: string}>({ show: false, title: '', text: '' });
  const [errorModal, setErrorModal] = useState({ show: false, text: '' });

  const hydrateAdminCache = () => {
      if (typeof window === 'undefined') {
          return;
      }

      try {
          const cachedNotes = localStorage.getItem(ADMIN_CACHE_KEYS.NOTES);
          const cachedUsers = localStorage.getItem(ADMIN_CACHE_KEYS.USERS);
          const cachedResults = localStorage.getItem(ADMIN_CACHE_KEYS.TEST_RESULTS);
          const cachedUrgentFiles = localStorage.getItem(ADMIN_CACHE_KEYS.URGENT_FILES);
          const cachedRoute = localStorage.getItem(ADMIN_CACHE_KEYS.ROUTE);
          const cachedTests = localStorage.getItem(ADMIN_CACHE_KEYS.TESTS);
          const cachedTypes = localStorage.getItem(ADMIN_CACHE_KEYS.TEST_TYPES);
          const cachedProfiles = localStorage.getItem(ADMIN_CACHE_KEYS.USER_PROFILES);
          const cachedAvatars = localStorage.getItem(ADMIN_CACHE_KEYS.USER_AVATARS);
          const cachedStats = localStorage.getItem(ADMIN_CACHE_KEYS.USER_STATS);

          if (cachedNotes) setNotes(JSON.parse(cachedNotes));
          const parsedCachedUsers = cachedUsers ? JSON.parse(cachedUsers) : [];
          const cachedUserList = Array.isArray(parsedCachedUsers) ? parsedCachedUsers : [];
          if (cachedUsers) setUsers(getVisibleWorkspaceUsers(cachedUserList));
          if (cachedResults) {
              const parsedCachedResults = JSON.parse(cachedResults);
              setTestResults(Array.isArray(parsedCachedResults)
                ? filterHiddenSystemResults(parsedCachedResults, cachedUserList)
                : []);
          }
          if (cachedUrgentFiles) setUrgentFiles(JSON.parse(cachedUrgentFiles));

          if (cachedTests) {
              const parsedTests = JSON.parse(cachedTests);
              setDynamicTests(parsedTests);
              if (Array.isArray(parsedTests)) setTotalBasicsModules(parsedTests.length);
          }

          if (cachedRoute) {
              const parsedRoute = JSON.parse(cachedRoute);
              if (Array.isArray(parsedRoute)) {
                  setDynamicRoute(parsedRoute);
                  setTotalRouteSteps(parsedRoute.length);
              }
          }

          if (cachedTypes) setTestTypesList(JSON.parse(cachedTypes));
          if (cachedProfiles) setUserProfiles(JSON.parse(cachedProfiles));
          if (cachedAvatars) setUserAvatars(JSON.parse(cachedAvatars));
          if (cachedStats) setUsersStats(JSON.parse(cachedStats));
      } catch (error) {
          console.error('Ошибка чтения кеша админки', error);
      }
  };

  useEffect(() => {
    let isDisposed = false;

    const validateAdminAccess = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const sessionData = response.ok ? await response.json().catch(() => null) : null;
        const sessionUser = sessionData?.user;

        if (!sessionData?.authenticated || !sessionUser) {
          router.replace('/login');
          return;
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

        if (normalizedUser.role !== 'admin' || getClientViewMode(normalizedUser) !== 'admin') {
          router.replace('/tasks?tab=welcome');
          return;
        }

        if (!isDisposed) {
          
          setIsAccessValidated(true);
        }
      } catch (error) {
        console.error('Не удалось проверить административный доступ:', error);
        if (!isDisposed) {
          router.replace('/login');
        }
      }
    };

    void validateAdminAccess();

    return () => {
      isDisposed = true;
    };
  }, [router]);

  useEffect(() => {
    if (!isAccessValidated) {
      return;
    }

    let isDisposed = false;

    const refreshPresence = async () => {
      try {
        const response = await fetch('/api/admin/presence', { cache: 'no-store' });
        const payload = response.ok ? await response.json().catch(() => null) : null;

        if (
          !isDisposed
          && payload?.presence
          && typeof payload.presence === 'object'
          && !Array.isArray(payload.presence)
        ) {
          setUserPresence(payload.presence as Record<string, UserPresence>);
        }
      } catch (error) {
        console.error('Не удалось обновить присутствие сотрудников:', error);
      }
    };

    void refreshPresence();
    const presenceInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshPresence();
      }
    }, 30_000);

    const handlePresenceResume = () => {
      if (document.visibilityState === 'visible') {
        void refreshPresence();
      }
    };

    window.addEventListener('focus', handlePresenceResume);
    document.addEventListener('visibilitychange', handlePresenceResume);

    return () => {
      isDisposed = true;
      window.clearInterval(presenceInterval);
      window.removeEventListener('focus', handlePresenceResume);
      document.removeEventListener('visibilitychange', handlePresenceResume);
    };
  }, [isAccessValidated]);

  useEffect(() => {
    setIsMounted(true);

    if (typeof window !== 'undefined') {
        
        hydrateAdminCache();
    }

    const loadAllData = async () => {
        try {
            const storageData = await fetchStorageBatch([
                'admin_cal_notes_v1',
                'tea_hub_users_v1',
                'tea_hub_test_results_v1',
                'tea_hub_urgent_files_v1',
                'tea_hub_dynamic_route_v2',
                'tea_hub_test_types_v1',
                'tea_hub_dynamic_tests_v1',
            ]);

            const notesData = storageData['admin_cal_notes_v1'];
            if (notesData && !Array.isArray(notesData)) {
                setNotes(notesData);
                localStorage.setItem(ADMIN_CACHE_KEYS.NOTES, JSON.stringify(notesData));
            }

            let usersData = storageData['tea_hub_users_v1'];
            if (!Array.isArray(usersData)) usersData = [];
            const visibleUsersData = getVisibleWorkspaceUsers(usersData as any[]);
            setUsers(visibleUsersData);
            localStorage.setItem(ADMIN_CACHE_KEYS.USERS, JSON.stringify(visibleUsersData));

            const testData = storageData['tea_hub_test_results_v1'];
            const visibleTestData = Array.isArray(testData)
              ? filterHiddenSystemResults(testData, usersData)
              : [];
            setTestResults(visibleTestData);
            localStorage.setItem(ADMIN_CACHE_KEYS.TEST_RESULTS, JSON.stringify(visibleTestData));

            const filesData = storageData['tea_hub_urgent_files_v1'];
            if (Array.isArray(filesData)) {
                setUrgentFiles(filesData);
                localStorage.setItem(ADMIN_CACHE_KEYS.URGENT_FILES, JSON.stringify(filesData));
            }

            const typesData = storageData['tea_hub_test_types_v1'];
            if (Array.isArray(typesData) && typesData.length > 0) {
                setTestTypesList(typesData);
                localStorage.setItem(ADMIN_CACHE_KEYS.TEST_TYPES, JSON.stringify(typesData));
            }

            const loadedTests = storageData['tea_hub_dynamic_tests_v1'];
            const dynamicRouteData = storageData['tea_hub_dynamic_route_v2'];

            if (Array.isArray(loadedTests)) {
                setDynamicTests(loadedTests);
                localStorage.setItem(ADMIN_CACHE_KEYS.TESTS, JSON.stringify(loadedTests));
            }

            setTotalBasicsModules(Array.isArray(loadedTests) ? loadedTests.length : 0);
            setTotalRouteSteps(Array.isArray(dynamicRouteData) ? dynamicRouteData.length : 5);
            if (Array.isArray(dynamicRouteData)) {
                setDynamicRoute(dynamicRouteData);
                localStorage.setItem(ADMIN_CACHE_KEYS.ROUTE, JSON.stringify(dynamicRouteData));
            }

            const stats: Record<string, {route: number, basics: number}> = {};
            const avatarsFound: Record<string, string> = {};
            const profilesFound: Record<string, any> = {};
            const profileKeys = visibleUsersData.map((u: any) => `profile_data_${u.id}`);
            const staffUsers = visibleUsersData.filter((u: any) => u.role === 'staff' && !u.hideFromStats && !u.profileDisabled);
            const progressKeys = staffUsers.flatMap((u: any) => [`prog_route_${u.id}`, `prog_tests_${u.id}`]);
            const relatedData = await fetchStorageBatch([...profileKeys, ...progressKeys]);

            for (const u of visibleUsersData) {
                if (u.avatar) avatarsFound[u.id] = u.avatar;

                const profData = relatedData[`profile_data_${u.id}`];
                if (profData && !Array.isArray(profData)) {
                    profilesFound[u.id] = profData;
                    if (profData.avatar) avatarsFound[u.id] = profData.avatar;
                }

                if (u.role === 'staff' && !u.hideFromStats && !u.profileDisabled) {
                    const uRouteData = relatedData[`prog_route_${u.id}`];
                    const uTestsData = relatedData[`prog_tests_${u.id}`];
                    stats[u.id] = {
                        route: Array.isArray(uRouteData) ? uRouteData.length : 0,
                        basics: Array.isArray(uTestsData) ? uTestsData.length : 0,
                    };
                }
            }

            setUsersStats(stats);
            setUserAvatars(avatarsFound);
            setUserProfiles(profilesFound);
            localStorage.setItem(ADMIN_CACHE_KEYS.USER_STATS, JSON.stringify(stats));
            localStorage.setItem(ADMIN_CACHE_KEYS.USER_AVATARS, JSON.stringify(avatarsFound));
            localStorage.setItem(ADMIN_CACHE_KEYS.USER_PROFILES, JSON.stringify(profilesFound));

        } catch (error) { console.error("Error", error); }
    };

    loadAllData();
  }, []);

  useEffect(() => {
      const syncAdminSection = () => {
          setActiveAdminSection(window.location.hash === '#employees' ? 'employees' : 'overview');
      };

      syncAdminSection();
      window.addEventListener('hashchange', syncAdminSection);
      return () => window.removeEventListener('hashchange', syncAdminSection);
  }, []);

  const handleUpdateTestTypes = (newTypes: any[]) => {
      setTestTypesList(newTypes);
      saveDataToServer('tea_hub_test_types_v1', newTypes);
  };

  useEffect(() => {
      if (testTypesList.length > 0 && !testTypesList.some(t => t.name === testType)) {
          setTestType(testTypesList[0].name);
      }
  }, [testTypesList, testType]);

  useEffect(() => {
      if (testType) {
          setTestFormData({ 
              title: testType, 
              timeLimit: 0, 
              quiz: [
                  { q: 'Какой водой заваривать зеленый чай?', o: ['100°C', '75-80°C', '60°C', '40°C'], c: 1 }, 
                  { q: 'Что такое Гайвань?', o: ['Чайник', 'Чашка с крышкой', 'Поднос', 'Лопатка'], c: 1 }, 
                  { q: 'Какая скрутка у Те Гуань Инь?', o: ['Продольная', 'Сферическая', 'Прессованная', 'Сломанная'], c: 1 }
              ] 
          });
      }
  }, [testType]);

  

  

  

  const handleSaveUserAuth = async () => {
      if (isSystemWorkspaceAccount(selectedProfileUser)) {
          return setErrorModal({ show: true, text: 'Профиль системного администратора изолирован от других администраторов.' });
      }
      if (!editAuthLogin.trim() || !editAuthPass.trim()) return setErrorModal({ show: true, text: "Логин и пароль не могут быть пустыми!" });
      if (users.find(u => u.login === editAuthLogin.trim() && u.id !== selectedProfileUser.id)) return setErrorModal({ show: true, text: "Логин занят другим пользователем!" });
      try {
          const response = await fetch('/api/admin/users/credentials', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  userId: selectedProfileUser.id,
                  login: editAuthLogin.trim(),
                  password: editAuthPass.trim(),
              }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result?.user) {
              throw new Error(result?.error || 'Не удалось сохранить новые доступы');
          }

          const updatedUsers = users.map((user) => user.id === selectedProfileUser.id ? { ...user, ...result.user } : user);
          setUsers(updatedUsers);
          setSelectedProfileUser({ ...selectedProfileUser, ...result.user });
          setEditAuthMode(false);
          setEditAuthPass('');
          setShowSuccessModal({ show: true, title: 'ДОСТУПЫ ОБНОВЛЕНЫ', text: `Новые данные для входа успешно сохранены.` });
      } catch (error: any) {
          setErrorModal({ show: true, text: error?.message || 'Не удалось сохранить новые доступы' });
      }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const startDayIndex = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const shiftStartDay = startDayIndex === 0 ? 6 : startDayIndex - 1;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isToday = (d: number) => today.getDate() === d && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
  const formattedSelectedDate = () => selectedDateKey ? `${selectedDateKey.split('-')[2]} ${MONTH_NAMES[parseInt(selectedDateKey.split('-')[1])]} ${selectedDateKey.split('-')[0]}` : "";
  
  const openNotePanel = (day: number) => { 
      const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${day}`; 
      const savedNote = notes[key] || "";
      const [savedTitle, ...savedDetails] = savedNote.split('\n');
      setSelectedDateKey(key); 
      setNoteTitle(savedTitle);
      setNoteText(savedDetails.join('\n'));
      setNoteType('personal'); 
      setDeadlineTarget('Все'); 
      setDeadlineMaterialType('test');
      setSelectedDeadlineMaterial(null);
      setDeadlineSearchQuery('');
  };
  
  const closeNotePanel = () => { 
      setSelectedDateKey(null); 
      setNoteTitle("");
      setNoteText(""); 
      setSelectedDeadlineMaterial(null);
      setDeadlineSearchQuery('');
      setShowTestDropdown(false);
  };

  const saveNote = async () => {
      if (!selectedDateKey) return;
      const deadlineTaskText = buildDeadlineTaskText(noteText, selectedDeadlineMaterial, deadlineMaterialType, deadlineSearchQuery);
      const personalNoteTitle = noteTitle.trim();
      const personalNoteBody = noteText.trim();
      if (noteType === 'personal' && !personalNoteTitle && !personalNoteBody) { const newNotes = { ...notes }; delete newNotes[selectedDateKey]; setNotes(newNotes); saveDataToServer('admin_cal_notes_v1', newNotes); closeNotePanel(); return; }
      if (noteType === 'personal' && !personalNoteTitle) {
          setErrorModal({ show: true, text: 'Укажите заголовок заметки.' });
          return;
      }
      if (noteType === 'deadline' && !deadlineTaskText) {
          setErrorModal({ show: true, text: 'Введите текст задачи или выберите материал для дедлайна.' });
          return;
      }
      if (noteType === 'deadline' && deadlineMaterialType !== 'test' && deadlineSearchQuery.trim() && !selectedDeadlineMaterial) {
          setErrorModal({ show: true, text: `Выберите ${DEADLINE_MATERIAL_OBJECT_LABELS[deadlineMaterialType]} из списка или очистите поле.` });
          return;
      }
      if (isProcessing) return; setIsProcessing(true);
      let shouldClosePanel = false;
      try {
          const newNotes = { ...notes };
          let adminNoteText = noteType === 'personal'
              ? [personalNoteTitle, personalNoteBody].filter(Boolean).join('\n')
              : noteText.trim();
          
          
          
          newNotes[selectedDateKey] = adminNoteText;
          setNotes(newNotes);
          await saveDataToServer('admin_cal_notes_v1', newNotes);
          shouldClosePanel = true;
      } catch (error) {
          console.error('Ошибка сохранения дедлайна', error);
          setErrorModal({ show: true, text: 'Не удалось сохранить дедлайн. Данные формы оставлены без изменений, попробуйте ещё раз.' });
      } finally {
          setIsProcessing(false);
          if (shouldClosePanel) closeNotePanel();
      }
  };

  const deleteNote = () => { 
      if (!selectedDateKey) return; 
      const newNotes = { ...notes }; 
      delete newNotes[selectedDateKey]; 
      setNotes(newNotes); 
      saveDataToServer('admin_cal_notes_v1', newNotes); 
      closeNotePanel(); 
  };

  const parsedEvents = Object.entries(notes).map(([key, text]) => {
      const [y, m, d] = key.split('-').map(Number);
      const isDeadline = text.startsWith('[Дедлайн:');
      let title = text, desc = '', target = '';
      if (isDeadline) {
          const match = text.match(/\[Дедлайн: (.*?)\]\n?([\s\S]*)/);
          if (match) { target = match[1]; const lines = match[2].split('\n'); title = lines[0] || 'Без названия'; desc = lines.slice(1).join(' '); }
      } else { const lines = text.split('\n'); title = lines[0] || 'Без названия'; desc = lines.slice(1).join(' '); }
      return { key, text, dateObj: new Date(y, m, d), d, isDeadline, target, title, desc };
  }).filter(event => event.dateObj >= (new Date(new Date().setHours(0,0,0,0)))).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  
  const filteredEvents = parsedEvents.filter(e => eventTab === 'personal' ? !e.isDeadline : e.isDeadline);

  const handleSendNotification = async () => {
      if (!notifText.trim() || isProcessing) return;
      setIsProcessing(true);
      try {
          await createInAppNotification({
              title: selectedStaff === 'Все' ? 'Общее уведомление' : 'Личное сообщение',
              text: notifText.trim(),
              target: selectedStaff,
          });
          setShowSuccessModal({ show: true, title: 'СООБЩЕНИЕ СОХРАНЕНО', text: 'Уведомление отправлено в личный кабинет.' });
          setNotifText('');
      } catch (error) {
          console.error('Ошибка отправки уведомления в личный кабинет:', error);
          setErrorModal({ show: true, text: 'Не удалось сохранить уведомление. Попробуйте ещё раз.' });
      } finally {
          setIsProcessing(false);
      }
  };

  const getBaseQuizTemplate = () => [{ q: 'Какой водой заваривать зеленый чай?', o: ['100°C', '75-80°C', '60°C', '40°C'], c: 1 }, { q: 'Что такое Гайвань?', o: ['Чайник', 'Чашка с крышкой', 'Поднос', 'Лопатка'], c: 1 }, { q: 'Какая скрутка у Те Гуань Инь?', o: ['Продольная', 'Сферическая', 'Прессованная', 'Сломанная'], c: 1 }];

  const handleOpenTestEditor = () => { setShowTestEditor(true); };

  const handleQuickSendTest = async () => {
      if (isProcessing) return; setIsProcessing(true);
      try {
          const newTestTask = { id: 'test_' + Date.now(), name: testType, timeLimit: 0, size: 'Интерактивный тест', date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), isTest: true, target: selectedStaff, quiz: getBaseQuizTemplate() };
          const res = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_urgent_files_v1`);
          const currentFiles = await res.json().catch(() => []);
          const updatedFiles = [newTestTask, ...(Array.isArray(currentFiles) ? currentFiles : [])];
          setUrgentFiles(updatedFiles);
          await saveDataToServer('tea_hub_urgent_files_v1', updatedFiles);
          setShowSuccessModal({ show: true, title: 'АТТЕСТАЦИЯ НАЗНАЧЕНА', text: `Тест успешно отправлен.` });
      } finally { setIsProcessing(false); }
  };

  const handleSendTest = async () => {
      if (testFormData.quiz.some(q => !q.q.trim() || q.o.some(opt => !opt.trim()))) return setErrorModal({ show: true, text: 'Все поля должны быть заполнены!' });
      if (isProcessing) return; setIsProcessing(true);
      try {
          const newTestTask = { id: 'test_' + Date.now(), name: testFormData.title, timeLimit: testFormData.timeLimit || 0, size: 'Интерактивный тест', date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), isTest: true, target: selectedStaff, quiz: testFormData.quiz };
          const res = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_urgent_files_v1`);
          const currentFiles = await res.json().catch(() => []);
          const updatedFiles = [newTestTask, ...(Array.isArray(currentFiles) ? currentFiles : [])];
          setUrgentFiles(updatedFiles);
          await saveDataToServer('tea_hub_urgent_files_v1', updatedFiles);
          setShowSuccessModal({ show: true, title: 'АТТЕСТАЦИЯ НАЗНАЧЕНА', text: `Тест "${testFormData.title}" отправлен.` });
          setShowTestEditor(false);
      } finally { setIsProcessing(false); }
  };

  const updateTestQuestion = (index: number, field: string, value: any) => {
      const newQuiz = [...testFormData.quiz];
      if (field === 'q') newQuiz[index].q = value;
      if (field === 'c') newQuiz[index].c = value;
      if (field.startsWith('o')) newQuiz[index].o[parseInt(field.replace('o', ''))] = value;
      setTestFormData({...testFormData, quiz: newQuiz});
  };
  const addTestQuestion = () => setTestFormData({...testFormData, quiz: [...testFormData.quiz, { q: '', o: ['', '', '', ''], c: 0 }]});
  const removeTestQuestion = (index: number) => setTestFormData({...testFormData, quiz: testFormData.quiz.filter((_, i) => i !== index)});

  const deadlineMaterialOptions: DeadlineMaterialOption[] = [
      ...urgentFiles
          .filter(file => file && !file.isDocPlaceholder && !file.isTest && !String(file.id || '').startsWith('deadline_'))
          .map(file => ({
              id: String(file.id || ''),
              title: String(file.name || 'Документ без названия'),
              type: 'document' as const,
              section: String(file.section || '').trim() || 'Основной раздел',
          })),
      ...dynamicRoute
          .filter(route => route && !route.isPlaceholder && route.h1 !== 'DELETE_ME')
          .map(route => ({
              id: String(route.id || ''),
              title: String(route.title || 'Тема без названия'),
              type: 'route' as const,
              section: String(route.section || '').trim() || 'Основной раздел',
          })),
      ...dynamicTests.map(test => ({
          id: String(test?.id || ''),
          title: String(test?.title || 'Тест без названия'),
          type: 'test' as const,
          section: String(test?.section || '').trim() || 'Тесты',
      })),
      ...testTypesList.map(testTypeItem => ({
          id: `tpl_${String(testTypeItem?.name || '')}`,
          title: `[Аттестация] ${String(testTypeItem?.name || 'Без названия')}`,
          type: 'test' as const,
          section: 'Шаблоны аттестаций',
      })),
  ].filter(option => option.id);

  const visibleDeadlineMaterialOptions = deadlineMaterialOptions.filter(option => {
      if (option.type !== deadlineMaterialType) return false;
      const normalizedQuery = deadlineSearchQuery.trim().toLocaleLowerCase('ru');
      return !normalizedQuery || `${option.title} ${option.section}`.toLocaleLowerCase('ru').includes(normalizedQuery);
  });

  if (!isMounted || !isAccessValidated) return <div className="vates-app-page vates-app-loading"><Navigation /><div className="desktop-sidebar-spacer" aria-hidden="true" /></div>;

  return (
    <div className="vates-app-page vates-admin-page" style={{ backgroundColor: '#0d0f0d', minHeight: '100vh', color: '#fff', display: 'flex', transition: '0.3s' }}>
      <Navigation />
      <div className="desktop-sidebar-spacer" aria-hidden="true" />

      <main className="admin-main" style={{ flex: 1, padding: '110px 40px 40px 40px', transition: '0.3s', boxSizing: 'border-box', maxWidth: '100%' }}>
          <div style={{ animation: 'fadeInUp 0.4s ease' }}>
            {activeAdminSection === 'overview' ? (
                <>
                    <VatesAdminOverview
                        users={users}
                        usersStats={usersStats}
                        totalRouteSteps={totalRouteSteps}
                        totalBasicsModules={totalBasicsModules}
                        testResults={testResults}
                        urgentFiles={urgentFiles}
                        onOpenEmployees={() => { window.location.hash = 'employees'; }}
                        onOpenTestResults={() => setShowTestModal(true)}
                        onOpenMaterials={() => window.location.assign('/tasks?tab=docs')}
                    />

                    <section className="vates-workspace-operations" aria-labelledby="vates-operations-title">
                        <div className="vates-operations-heading">
                            <div>
                                <span className="vates-eyebrow">Оперативная работа</span>
                                <h2 id="vates-operations-title">Команда и расписание</h2>
                            </div>
                            <button type="button" className="vates-button secondary" onClick={() => setShowTestModal(true)}>
                                Результаты тестов · {testResults.length}
                            </button>
                        </div>

                        <div className="vates-workspace-tools-grid">
                            <InteractionCenter
                                users={users} interactionTab={interactionTab} setInteractionTab={setInteractionTab}
                                selectedStaff={selectedStaff} setSelectedStaff={setSelectedStaff} notifText={notifText}
                                setNotifText={setNotifText} testType={testType} setTestType={setTestType}
                                handleSendNotification={handleSendNotification} handleOpenTestEditor={handleOpenTestEditor}
                                 handleQuickSendTest={handleQuickSendTest} isProcessing={isProcessing}
                                 testTypesList={testTypesList} handleUpdateTestTypes={handleUpdateTestTypes}
                             />

                            <CalendarWidget
                                eventTab={eventTab} setEventTab={setEventTab} filteredEvents={filteredEvents}
                                currentDate={currentDate} handlePrevMonth={handlePrevMonth} handleNextMonth={handleNextMonth}
                                daysInMonth={daysInMonth} shiftStartDay={shiftStartDay} isToday={isToday}
                                openNotePanel={openNotePanel} notes={notes}
                            />
                        </div>
                    </section>
                </>
            ) : (
                <section id="employees" className="vates-employees-workspace">
                    <UserManagement
                        users={users} setUsers={setUsers} userAvatars={userAvatars}
                        usersStats={usersStats} totalRouteSteps={totalRouteSteps} totalBasicsModules={totalBasicsModules}
                        userPresence={userPresence}
                        setShowSuccessModal={setShowSuccessModal} setErrorModal={setErrorModal} setSelectedProfileUser={setSelectedProfileUser}
                    />
                </section>
            )}
          </div>
      </main>

      <UserProfileModal 
          selectedProfileUser={selectedProfileUser} setSelectedProfileUser={setSelectedProfileUser}
          userProfiles={userProfiles} usersStats={usersStats} totalRouteSteps={totalRouteSteps}
          totalBasicsModules={totalBasicsModules} userAvatars={userAvatars} testResults={testResults}
          editAuthMode={editAuthMode} setEditAuthMode={setEditAuthMode} editAuthLogin={editAuthLogin}
          setEditAuthLogin={setEditAuthLogin} editAuthPass={editAuthPass} setEditAuthPass={setEditAuthPass}
          handleSaveUserAuth={handleSaveUserAuth}
      />

      {showTestEditor && (
          <TestEditorModal 
              testFormData={testFormData} setTestFormData={setTestFormData} updateTestQuestion={updateTestQuestion}
              removeTestQuestion={removeTestQuestion} addTestQuestion={addTestQuestion} handleSendTest={handleSendTest}
              isProcessing={isProcessing} setShowTestEditor={setShowTestEditor}
          />
      )}

      {showTestModal && (
          <TestResultsModal 
              setShowTestModal={setShowTestModal} selectedTestUser={selectedTestUser}
              setSelectedTestUser={setSelectedTestUser} users={users} testResults={testResults}
          />
      )}

      {selectedDateKey && (
        <div style={noteOverlayStyle as any} onClick={closeNotePanel}>
          <div style={noteSidebarStyle as any} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#0abab5' }}>ЗАМЕТКА</h2>
              <div onClick={closeNotePanel} style={{ cursor: 'pointer', fontSize: '20px', opacity: 0.5 }}>X</div>
            </div>
            <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '20px', color: '#ccc' }}>Дата: {formattedSelectedDate()}</p>
            
            <div style={{ position: 'relative', display: 'flex', background: '#111', borderRadius: '14px', marginBottom: '20px', padding: '4px', border: '1px solid #222' }}>
                <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: noteType === 'personal' ? '4px' : 'calc(50% + 2px)', width: 'calc(50% - 6px)', background: '#222', borderRadius: '10px', transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)', border: '1px solid #333' }} />
                <div onClick={() => setNoteType('personal')} style={{ position: 'relative', zIndex: 1, flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', color: noteType === 'personal' ? '#0abab5' : '#666', fontWeight: '900', fontSize: '13px', transition: '0.3s' }}>Для себя</div>
                <div onClick={() => setNoteType('deadline')} style={{ position: 'relative', zIndex: 1, flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', color: noteType === 'deadline' ? '#0abab5' : '#666', fontWeight: '900', fontSize: '13px', transition: '0.3s' }}>Дедлайн</div>
            </div>

            {noteType === 'deadline' && (
                <div style={{ marginBottom: '15px', animation: 'fadeInUp 0.3s ease' }}>
                    <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', marginBottom: '8px' }}>Кому назначить:</div>
                    <select style={{ ...adminIn, marginBottom: 0, padding: '12px', cursor: 'pointer' } as any} value={deadlineTarget} onChange={e => setDeadlineTarget(e.target.value)}>
                        <option value="Все">Всем сотрудникам</option>
                        {users.filter(u => u.role === 'staff').map(u => <option key={u.id} value={u.id}>{u.name} ({u.login})</option>)}
                    </select>
                    
                    <div style={{ position: 'relative', marginTop: '15px' }}>
                        <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', marginBottom: '8px' }}>Прикрепить материал:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                            {([
                                { type: 'document', label: 'Документ' },
                                { type: 'route', label: 'Тема' },
                                { type: 'test', label: 'Тест' },
                            ] as Array<{ type: DeadlineMaterialType; label: string }>).map(item => (
                                <button
                                    key={item.type}
                                    type="button"
                                    onClick={() => {
                                        setDeadlineMaterialType(item.type);
                                        setSelectedDeadlineMaterial(null);
                                        setDeadlineSearchQuery('');
                                        setShowTestDropdown(false);
                                    }}
                                    style={{
                                        padding: '9px 6px',
                                        borderRadius: '10px',
                                        border: `1px solid ${deadlineMaterialType === item.type ? '#0abab5' : '#333'}`,
                                        background: deadlineMaterialType === item.type ? 'rgba(10,186,181,0.15)' : '#111',
                                        color: deadlineMaterialType === item.type ? '#0abab5' : '#888',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        fontWeight: '900',
                                    }}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <input 
                            type="text"
                            style={{ ...adminIn, marginBottom: 0, padding: '12px' } as any}
                            placeholder={deadlineMaterialType === 'test' ? 'Найдите или создайте тест...' : `Найдите ${DEADLINE_MATERIAL_OBJECT_LABELS[deadlineMaterialType]}...`}
                            value={deadlineSearchQuery}
                            onChange={(e) => {
                                setDeadlineSearchQuery(e.target.value);
                                setSelectedDeadlineMaterial(null);
                                setShowTestDropdown(true);
                            }}
                            onFocus={() => setShowTestDropdown(true)}
                            onBlur={() => setTimeout(() => setShowTestDropdown(false), 200)}
                        />
                        {showTestDropdown && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: '12px', maxHeight: '150px', overflowY: 'auto', zIndex: 1000, marginTop: '5px' }} className="custom-scroll">
                                <div 
                                    onClick={() => { setSelectedDeadlineMaterial(null); setDeadlineSearchQuery(''); setShowTestDropdown(false); }}
                                    style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '13px', color: '#888', borderBottom: '1px solid #222' }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
                                >
                                     Без прикрепленного материала
                                </div>
                                {visibleDeadlineMaterialOptions.slice(0, 30).map(option => (
                                    <div 
                                        key={`${option.type}:${option.id}`}
                                        onClick={() => {
                                            setSelectedDeadlineMaterial({ type: option.type, id: option.id, title: option.title.replace('[Аттестация] ', '') });
                                            setDeadlineSearchQuery(option.title.replace('[Аттестация] ', ''));
                                            setShowTestDropdown(false);
                                        }}
                                        style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '13px', color: '#fff', borderBottom: '1px solid #222' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(10,186,181,0.2)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div>{option.title}</div>
                                        <div style={{ color: '#666', fontSize: '10px', marginTop: '3px' }}>{option.section}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {noteType === 'personal' ? (
                <div style={{ display: 'grid', gap: '14px' }}>
                    <label htmlFor="admin-note-title" style={{ display: 'grid', gap: '7px' }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#aaa', fontSize: '12px', fontWeight: '800' }}>
                            <span>Заголовок заметки</span>
                            <span aria-live="polite">{noteTitle.length} / {NOTE_TITLE_MAX_LENGTH}</span>
                        </span>
                        <input
                            id="admin-note-title"
                            autoFocus
                            value={noteTitle}
                            maxLength={NOTE_TITLE_MAX_LENGTH}
                            onChange={(event) => setNoteTitle(event.target.value)}
                            placeholder="Коротко: что важно сделать"
                            style={{ ...noteTextarea, minHeight: '54px', padding: '15px 16px', borderRadius: '14px' } as any}
                        />
                    </label>
                    <label htmlFor="admin-note-body" style={{ display: 'grid', gap: '7px' }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#aaa', fontSize: '12px', fontWeight: '800' }}>
                            <span>Подробности</span>
                            <span aria-live="polite">{noteText.length} / {NOTE_BODY_MAX_LENGTH}</span>
                        </span>
                        <textarea
                            id="admin-note-body"
                            value={noteText}
                            maxLength={NOTE_BODY_MAX_LENGTH}
                            onChange={(event) => setNoteText(event.target.value)}
                            placeholder="Опишите заметку подробнее..."
                            style={{ ...noteTextarea, height: '154px' } as any}
                        />
                    </label>
                </div>
            ) : (
                <textarea
                    autoFocus
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Текст задачи..."
                    style={{ ...noteTextarea, height: '135px' } as any}
                />
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button className="hover-unified-app" onClick={saveNote} disabled={isProcessing} style={{...adminSendBtn, flex: 1, minWidth: '100px', cursor: isProcessing ? 'not-allowed' : 'pointer'} as any}>{isProcessing ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}</button>
                {notes[selectedDateKey] && <button className="hover-unified-app" onClick={deleteNote} disabled={isProcessing} style={{...noteDeleteBtn, flex: 1, minWidth: '100px', cursor: isProcessing ? 'not-allowed' : 'pointer'} as any}>УДАЛИТЬ</button>}
            </div>
          </div>
        </div>
      )}

      {showSuccessModal.show && (
          <div style={modalOverlay as any} onClick={() => setShowSuccessModal({ ...showSuccessModal, show: false })}>
              <div className="admin-modal-content" style={{ ...modalContentSmall, maxWidth: '420px', padding: '35px', textAlign: 'center' } as any} onClick={e => e.stopPropagation()}>
                  <div style={{ marginBottom: '20px', animation: 'scaleIn 0.3s ease', display: 'flex', justifyContent: 'center' }}><CustomIcon name="success" size={56} color="#0abab5" /></div>
                  <h2 style={{ color: '#0abab5', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>{showSuccessModal.title}</h2>
                  <p style={{ color: '#ccc', fontSize: '16px', lineHeight: '1.6', marginBottom: '25px' }}>{showSuccessModal.text}</p>
                  <button className="hover-unified-app" onClick={() => setShowSuccessModal({ ...showSuccessModal, show: false })} style={saveBtn as any}>ПОНЯТНО</button>
              </div>
          </div>
      )}

      {errorModal.show && (
          <div style={modalOverlay as any} onClick={() => setErrorModal({ show: false, text: '' })}>
              <div className="admin-modal-content" style={{ ...modalContentSmall, maxWidth: '380px', padding: '35px', textAlign: 'center' } as any} onClick={e => e.stopPropagation()}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '18px', border: '1px solid rgba(255,77,77,0.35)', background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                  <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>ОШИБКА</h2>
                  <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.5', marginBottom: '25px', wordBreak: 'break-word' }}>{errorModal.text}</p>
                  <button className="hover-unified-app" onClick={() => setErrorModal({ show: false, text: '' })} style={{ ...saveBtn, background: '#333', color: '#fff' } as any}>ПОНЯТНО</button>
              </div>
          </div>
      )}

      <style jsx global>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        * { box-sizing: border-box; }
        body { overflow-x: hidden; margin: 0; padding: 0; background: #0d0f0d; }

        .cal-day { position: relative; font-size: 13px; padding: 10px 0; border-radius: 12px; font-weight: 800; color: #fff; cursor: pointer; transition: 0.2s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 38px; }
        .cal-day:hover { background: #0abab5; color: #000; }
        .cal-day.today { background: #0abab5; color: #000; }
        .note-dot { position: absolute; bottom: 4px; width: 4px; height: 4px; background: #0abab5; border-radius: 50%; }
        .deadline-dot { background: #ff4d4d; }
        .cal-day:hover .note-dot, .cal-day.today .note-dot { background: #000; }
        
        .keep-scroll::-webkit-scrollbar { width: 6px !important; display: block !important; }
        .keep-scroll::-webkit-scrollbar-thumb { background: #333 !important; border-radius: 10px !important; }
        .keep-scroll { -ms-overflow-style: auto !important; scrollbar-width: thin !important; scrollbar-color: #333 transparent !important; }

        @media (max-width: 767px) {
            .desktop-sidebar-spacer { display: none !important; width: 0 !important; }
            .admin-main { padding: 90px 15px 50px 15px !important; }
            .admin-layout-grid { grid-template-columns: 1fr !important; gap: 20px !important; margin-top: 20px !important; }
            .admin-section-title { font-size: 20px !important; margin-bottom: 20px !important; }
            .admin-flex-space { flex-direction: column; align-items: flex-start !important; gap: 15px !important; margin-bottom: 25px !important; }
            .admin-user-grid { grid-template-columns: 1fr !important; }
            .admin-user-card { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; padding: 16px !important; border-radius: 20px !important; }
            .admin-user-avatar-col { flex: auto !important; width: 100% !important; margin-bottom: 0 !important; }
            .admin-user-bars-col { border-left: none !important; padding-left: 0 !important; width: 100% !important; border-top: 1px solid #222; padding-top: 16px !important; }
            .admin-user-actions-col { border-left: none !important; padding-left: 0 !important; width: 100% !important; justify-content: flex-end; height: auto !important; border-top: 1px solid #222; padding-top: 16px !important; }
            .admin-user-progress-row { gap: 8px !important; }
            .admin-user-progress-label { width: 56px !important; font-size: 10px !important; }
            .admin-user-progress-value { width: 40px !important; font-size: 12px !important; }
            .interaction-center-tabs { flex-direction: column; }
            .interaction-center-tabs > div { border-left: none !important; border-bottom: 1px solid #222; }
            .interaction-center-row { flex-direction: column; align-items: stretch !important; gap: 15px !important; }
            .interaction-center-label { width: 100% !important; margin-bottom: -5px; }
            .admin-modal-content { padding: 30px 20px !important; width: 95% !important; border-radius: 25px !important; }
        }
      `}</style>
    </div>
  );
}
