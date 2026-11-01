"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import CustomIcon from '@/app/components/CustomIcon';
import ThemeToggle from '@/app/components/ThemeToggle';
import VatesLogo from '@/app/components/VatesLogo';
import type { CustomIconName } from '@/app/components/CustomIcon';
import {
  applyClientAuthState,
  clearClientAuthState,
  getClientLandingPath,
  getClientViewMode,
  setClientViewMode,
  type ClientSessionUser,
} from '@/app/lib/authClient';
import { fetchStorageBatch } from '@/app/lib/storageClient';

const saveDataToServer = (key: string, data: any) => {
    fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data })
    }).catch(err => console.error("Ошибка сохранения на сервер:", err));
};

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const isProtectedPath = pathname?.startsWith('/tasks') || pathname?.startsWith('/admin') || pathname?.startsWith('/profile');
  const lastServerDataLoadRef = React.useRef(0);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<ClientSessionUser | null>(null);
  const [currentViewMode, setCurrentViewMode] = useState<'admin' | 'staff'>('staff');
  const [currentHash, setCurrentHash] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  
  
  
  
  

  

  const [searchDbRoutes, setSearchDbRoutes] = useState<any[]>([]);
  const [searchDbTests, setSearchDbTests] = useState<any[]>([]);
  const [searchDbProducts, setSearchDbProducts] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);

  const handleCaptchaClick = () => {
      if (isCaptchaVerified || isCaptchaLoading) return;
      setIsCaptchaLoading(true);
      setTimeout(() => {
          setIsCaptchaLoading(false);
          setIsCaptchaVerified(true);
          setErrorMessage(""); 
      }, 1200);
  };

  useEffect(() => {
    let isDisposed = false;

    const handleUnauthorizedState = () => {
        if (isDisposed) {
            return;
        }

        setIsLoggedIn(false);
        setUserRole(null);
        setSessionUser(null);
        clearClientAuthState();
        setNotifications([]);

        if (isProtectedPath) {
            router.replace('/');
        }
    };

    const fetchSessionPayload = async () => {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });

        if (response.status === 401) {
            return { unauthorized: true as const, payload: null };
        }

        if (!response.ok) {
            return { unauthorized: false as const, payload: null };
        }

        const payload = await response.json().catch(() => null);
        return { unauthorized: false as const, payload };
    };

    const loadServerData = async () => {
        const now = Date.now();
        if (now - lastServerDataLoadRef.current < 8_000) {
            return;
        }
        lastServerDataLoadRef.current = now;

        try {
            let sessionResult = await fetchSessionPayload();

            if (sessionResult.unauthorized) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                sessionResult = await fetchSessionPayload();
            }

            if (sessionResult.unauthorized) {
                handleUnauthorizedState();
                return;
            }

            if (!sessionResult.payload) {
                console.warn('Навигация пропустила временную ошибку сессии.');
                return;
            }

            const sessionData = sessionResult.payload;
            const sessionUser = sessionData?.user;

            if (sessionData?.authenticated && sessionUser) {
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
                setIsLoggedIn(true);
                setSessionUser(normalizedUser);
                setCurrentViewMode(getClientViewMode(normalizedUser));
                setUserRole(getClientViewMode(normalizedUser));
            } else {
                if (isProtectedPath) {
                    router.replace('/');
                }
                return;
            }

            let hasCachedProducts = false;
            if (typeof window !== 'undefined') {
                const cachedProducts = localStorage.getItem('tea_hub_products_cache_v1');
                if (cachedProducts) {
                    const parsedProducts = JSON.parse(cachedProducts);
                    if (Array.isArray(parsedProducts)) {
                        setSearchDbProducts(parsedProducts);
                        hasCachedProducts = true;
                    }
                }
            }

            // Для фильтрации уведомлений используем подтвержденный ID сессии,
            // а не устаревшее значение из браузерного хранилища после смены аккаунта.
            const currentUserId = typeof sessionUser?.id === 'string' ? sessionUser.id : 'guest';
            const storageKeys = [
                'tea_hub_notifications_v1',
                'tea_hub_dynamic_route_v2',
                'tea_hub_dynamic_tests_v1',
                ...(hasCachedProducts ? [] : ['tea_hub_products_v1']),
            ];
            const storageData = await fetchStorageBatch(storageKeys).catch(() => ({} as Record<string, any>));

            const notificationsData = storageData['tea_hub_notifications_v1'];
            if (Array.isArray(notificationsData)) {
                const myNotifs = notificationsData.filter((n: any) => n.target === 'Все' || n.target === currentUserId || !n.target);
                setNotifications(myNotifs);
            }

            const routesData = storageData['tea_hub_dynamic_route_v2'];
            if (Array.isArray(routesData)) setSearchDbRoutes(routesData);

            const testsData = storageData['tea_hub_dynamic_tests_v1'];
            if (Array.isArray(testsData)) setSearchDbTests(testsData);

            const productsData = storageData['tea_hub_products_v1'];
            if (Array.isArray(productsData)) {
                setSearchDbProducts(productsData);
                if (typeof window !== 'undefined') {
                    localStorage.setItem('tea_hub_products_cache_v1', JSON.stringify(productsData));
                }
            }

        } catch (e) {
            console.error("Ошибка синхронизации Navigation:", e);
        }
    };

    const handleVisibilityRefresh = () => {
        if (document.visibilityState === 'visible') {
            loadServerData();
        }
    };

    const handleWindowRefresh = () => {
        loadServerData();
    };

    loadServerData();
    window.addEventListener('focus', handleWindowRefresh);
    window.addEventListener('storage', handleWindowRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
        isDisposed = true;
        window.removeEventListener('focus', handleWindowRefresh);
        window.removeEventListener('storage', handleWindowRefresh);
        document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [isProtectedPath, router]);

  useEffect(() => {
    if (!isLoggedIn || !sessionUser?.id) {
      return;
    }

    let isDisposed = false;

    const sendHeartbeat = async () => {
      if (isDisposed || document.visibilityState !== 'visible') {
        return;
      }

      try {
        const response = await fetch('/api/auth/heartbeat', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
        });

        if (!response.ok && response.status !== 401) {
          console.warn('Сервер не обновил статус присутствия:', response.status);
        }
      } catch (error) {
        console.warn('Не удалось отправить heartbeat присутствия:', error);
      }
    };

    const handleActivityResume = () => {
      void sendHeartbeat();
    };

    void sendHeartbeat();
    const heartbeatInterval = window.setInterval(() => {
      void sendHeartbeat();
    }, 30_000);

    window.addEventListener('focus', handleActivityResume);
    document.addEventListener('visibilitychange', handleActivityResume);

    return () => {
      isDisposed = true;
      window.clearInterval(heartbeatInterval);
      window.removeEventListener('focus', handleActivityResume);
      document.removeEventListener('visibilitychange', handleActivityResume);
    };
  }, [isLoggedIn, sessionUser?.id]);

  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  const handleLogin = async () => {
    if (failedAttempts >= 3 && !isCaptchaVerified) {
        setErrorMessage("Пожалуйста, подтвердите, что вы человек.");
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password: pass }),
        });
        const result = await response.json().catch(() => ({}));

        

        if (!response.ok || !result?.user) {
            const newFails = failedAttempts + 1;
            setFailedAttempts(newFails);
            if (isCaptchaVerified) setIsCaptchaVerified(false);
            setErrorMessage(result?.error || "Неправильно введен логин или пароль!");
            return;
        }

        const normalizedUser = {
            id: result.user.id,
            login: result.user.login,
            role: result.user.role,
            name: result.user.name || (result.user.role === 'admin' ? 'Главный Мастер' : 'Сотрудник'),
            systemAccount: Boolean(result.user.systemAccount),
            ghostAccount: Boolean(result.user.ghostAccount),
            profileDisabled: Boolean(result.user.profileDisabled),
            profileOwnerOnly: Boolean(result.user.profileOwnerOnly),
            hideFromStats: Boolean(result.user.hideFromStats),
            canSwitchMode: Boolean(result.user.canSwitchMode),
            accountLabel: result.user.accountLabel || '',
        } satisfies ClientSessionUser;
        applyClientAuthState(normalizedUser);
        setFailedAttempts(0);
        setIsCaptchaVerified(false);
        setIsLoggedIn(true);
        setSessionUser(normalizedUser);
        setCurrentViewMode(getClientViewMode(normalizedUser));
        setUserRole(getClientViewMode(normalizedUser));
        setShowLoginModal(false);

        router.push(getClientLandingPath(normalizedUser));
    } catch (error) {
        console.error("Ошибка связи с сервером:", error);
        setErrorMessage("Не удалось подключиться к базе данных.");
    }
  };

  

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .catch((error) => console.error('Ошибка завершения сессии:', error))
      .finally(() => {
        clearClientAuthState();
        window.dispatchEvent(new Event('storage'));
        setIsLoggedIn(false);
        setUserRole(null);
        setSessionUser(null);
        setIsProfileOpen(false);
        router.push('/');
      });
  };

  const handleViewModeChange = (mode: 'admin' | 'staff') => {
    if (!sessionUser?.canSwitchMode || mode === currentViewMode) {
      return;
    }

    setClientViewMode(mode);
    setCurrentViewMode(mode);
    setUserRole(mode);
    setIsProfileOpen(false);
    router.replace(mode === 'admin' ? '/admin' : '/tasks?tab=welcome');
    router.refresh();
  };

  const removeNotification = async (id: number) => {
    try {
        const res = await fetch('/api/storage?key=tea_hub_notifications_v1');
        const allNotifs = await res.json().catch(() => []);
        
        if (Array.isArray(allNotifs)) {
            const updated = allNotifs.filter((n: any) => n.id !== id);
            saveDataToServer('tea_hub_notifications_v1', updated);
            
            const currentUserId = localStorage.getItem('current_user_id') || sessionStorage.getItem('current_user_id') || 'guest';
            const myNotifs = updated.filter((n: any) => n.target === 'Все' || n.target === currentUserId || !n.target);
            setNotifications(myNotifs);
        }
    } catch (e) {
        console.error("Не удалось удалить уведомление:", e);
    }
  };

  const clearAllNotifications = async () => {
    try {
        const res = await fetch('/api/storage?key=tea_hub_notifications_v1');
        const allNotifs = await res.json().catch(() => []);

        if (Array.isArray(allNotifs)) {
            const currentUserId = localStorage.getItem('current_user_id') || sessionStorage.getItem('current_user_id') || 'guest';
            
            const updated = allNotifs.filter((n: any) => {
                const isMyNotif = n.target === 'Все' || n.target === currentUserId || !n.target;
                return !isMyNotif; 
            });
            
            saveDataToServer('tea_hub_notifications_v1', updated);
            setNotifications([]);
        }
    } catch (e) {
        console.error("Не удалось очистить уведомления:", e);
    }
  };

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }

    const q = val.toLowerCase();
    const results: any[] = [];

    searchDbRoutes.forEach((route: any) => {
      const rText = [route.title, route.h1, route.t1, route.h2, route.t2, route.h3, route.t3].filter(Boolean).join(" ").toLowerCase();
      if (rText.includes(q)) {
        results.push({ id: `r_${route.id}`, title: route.title, subtitle: `Теория`, link: `/tasks?tab=edu&routeId=${route.id}` });
      }
    });

    searchDbTests.forEach((test: any) => {
      const tText = [test.title, test.subtitle, test.theory, ...(test.quiz ? test.quiz.map((qz:any) => qz.q) : [])].filter(Boolean).join(" ").toLowerCase();
      if (tText.includes(q)) {
        results.push({ id: `t_${test.id}`, title: test.title, subtitle: `Тестирование`, link: `/tasks?tab=edu&testId=${test.id}` });
      }
    });

    searchDbProducts.forEach((product: any) => {
      const pText = [
        product.name,
        product.code,
        product.category,
        product.subcategory,
        product.groupPath,
        product.desc,
        product.priority,
      ].filter(Boolean).join(" ").toLowerCase();

      if (pText.includes(q)) {
        results.push({
          id: `p_${product.id || product.code || product.name}`,
          title: product.name || 'Товар',
          subtitle: `Товары${product.category ? ` • ${product.category}` : ''}`,
          link: `/tasks?tab=products&productId=${encodeURIComponent(product.id || product.code || product.name || '')}`,
        });
      }
    });

    setSearchResults(results.slice(0, 6)); 
    setIsSearchOpen(true);
  };

  const handleResultClick = (link: string) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    router.push(link);
  };

  const adminSideItems: Array<{ id: string; label: string; icon: CustomIconName }> = [
    { id: '/admin', label: 'Рабочее пространство', icon: 'day' },
    { id: '/admin#employees', label: 'Сотрудники', icon: 'user' },
    { id: '/tasks?tab=paths', label: 'Учебные пути', icon: 'book' },
    { id: '/tasks?tab=edu', label: 'Материалы', icon: 'cap' },
    { id: '/tasks?tab=docs', label: 'Документы', icon: 'file' },
    { id: '/tasks?tab=products', label: 'Товары', icon: 'brew' },
    { id: '/tasks?tab=standards', label: 'AI-ассистент', icon: 'brain' },
  ];

  const staffSideItems: Array<{ id: string; label: string; icon: CustomIconName }> = [
    { id: '/tasks?tab=welcome', label: 'Мой прогресс', icon: 'rocket' },
    { id: '/tasks?tab=edu', label: 'Материалы', icon: 'book' },
    { id: '/tasks?tab=edu#tests', label: 'Тесты', icon: 'cap' },
    { id: '/tasks?tab=docs', label: 'Документы', icon: 'file' },
    { id: '/tasks?tab=standards', label: 'AI-ассистент', icon: 'brain' },
    { id: '/tasks?tab=products', label: 'Товары', icon: 'brew' },
  ];

  const sideItems = userRole === 'admin' ? adminSideItems : staffSideItems;
  const bottomSideItems = userRole === 'admin'
    ? [adminSideItems[0], adminSideItems[1], adminSideItems[2], adminSideItems[3], adminSideItems[4]]
    : [staffSideItems[0], staffSideItems[1], staffSideItems[3]];

  const isCurrentNavItem = (itemId: string) => {
    if (itemId === '/admin#employees') {
      return pathname === '/admin' && currentHash === '#employees';
    }

    if (itemId === '/admin') {
      return pathname === '/admin' && currentHash !== '#employees';
    }

    if (typeof window === 'undefined') {
      return itemId === pathname;
    }

    const [itemWithoutHash, itemHash = ''] = itemId.split('#');
    const [itemPath, itemSearch = ''] = itemWithoutHash.split('?');

    if (pathname !== itemPath) {
      return false;
    }

    const itemTab = new URLSearchParams(itemSearch).get('tab');
    const currentTab = new URLSearchParams(window.location.search).get('tab');
    if (itemTab && itemTab !== currentTab) {
      return false;
    }

    if (itemHash) {
      return currentHash === `#${itemHash}`;
    }

    if (itemId === '/tasks?tab=edu') {
      return currentHash !== '#tests';
    }

    return true;
  };

  return (
    <>
      {!isLoggedIn ? (
        <header style={guestHeader} className="guest-header">
           <VatesLogo className="guest-brand-logo" priority />
           <div className="guest-header-actions">
             <ThemeToggle />
             <button type="button" onClick={() => setShowLoginModal(true)} className="vates-button vates-button-primary" style={loginBtn}>Войти</button>
           </div>
        </header>
      ) : (
        <>
           <aside style={sidebarStyle} className="nav-sidebar">
             <div style={logoArea}>
                 <VatesLogo className="nav-brand-logo nav-brand-logo--full" priority />
                 <VatesLogo className="nav-brand-logo nav-brand-logo--symbol" variant="symbol" priority />
              </div>
             {sessionUser?.canSwitchMode && (
                <div className="account-mode-switch" style={modeSwitchWrap}>
                    <div className="account-mode-switch-title" style={modeSwitchTitle}>Режим аккаунта</div>
                    <div className="account-mode-switch-options" style={modeSwitchSegment}>
                        <button
                            type="button"
                            onClick={() => handleViewModeChange('admin')}
                            className={`account-mode-switch-button ${currentViewMode === 'admin' ? 'is-active' : ''}`}
                            style={modeSwitchButton(currentViewMode === 'admin')}
                        >
                            Админ
                        </button>
                        <button
                            type="button"
                            onClick={() => handleViewModeChange('staff')}
                            className={`account-mode-switch-button ${currentViewMode === 'staff' ? 'is-active' : ''}`}
                            style={modeSwitchButton(currentViewMode === 'staff')}
                        >
                            Сотрудник
                        </button>
                    </div>
                </div>
             )}
              <nav style={sideNav} className="vates-sidebar-nav" aria-label="Основная навигация">
                 {sideItems.map(item => {
                     const isActive = isCurrentNavItem(item.id);
                     const isAdminSectionLink = item.id === '/admin' || item.id === '/admin#employees';
                     const linkContent = (
                       <>
                         <span className="nav-item-icon" aria-hidden="true">
                           <CustomIcon name={item.icon} size={20} color="currentColor" />
                         </span>
                         <span className="nav-item-label">{item.label}</span>
                       </>
                     );

                     if (isAdminSectionLink) {
                       return (
                         <a
                           key={item.id}
                           href={item.id}
                           className={`nav-item ${isActive ? 'active' : ''}`}
                           title={item.label}
                         >
                           {linkContent}
                         </a>
                       );
                     }

                     return (
                        <Link 
                            key={item.id} 
                            href={item.id} 
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            title={item.label}
                        >
                            {linkContent}
                        </Link>
                    );
                })}
             </nav>
          </aside>

           <header style={topBarStyle} className="nav-topbar">
              <VatesLogo className="vates-mobile-brand-logo" priority />
              <div className="vates-workspace-label">
                <strong>ООО «Чайная Артель»</strong>
              </div>
              <div style={searchBox} className="search-box-container hover-search-surface">
                <span style={{ opacity: 0.5, display: 'flex', alignItems: 'center' }}><SearchIcon /></span>
                <input 
                  type="text" 
                  placeholder="Поиск по базе знаний..." 
                  style={searchInput} 
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => searchQuery.trim() && setIsSearchOpen(true)}
                  onBlur={() => setTimeout(() => setIsSearchOpen(false), 200)}
                />

                {isSearchOpen && (
                  <div style={searchDropdownStyle as any}>
                    {searchResults.length > 0 ? (
                      searchResults.map(res => (
                        <div key={res.id} onMouseDown={() => handleResultClick(res.link)} className="search-result-item" style={searchResultItem as any}>
                          <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff' }}>{res.title}</div>
                          <div style={{ fontSize: '11px', color: '#0abab5', fontWeight: '900', marginTop: '5px' }}>{res.subtitle}</div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px', fontWeight: 'bold' }}>Ничего не найдено</div>
                    )}
                  </div>
                )}
              </div>
             
             <div style={topActions} className="top-actions">
                <ThemeToggle />
                {/* Заменен эмодзи колокольчика на векторный SVG */}
                <div onClick={() => setIsNotifOpen(true)} className="top-icon-btn" style={topIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 22C13.1046 22 14 21.1046 14 20H10C10 21.1046 10.8954 22 12 22Z" fill="currentColor"/>
                      <path d="M18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16ZM16 17H8V11C8 8.52 9.51 6.5 12 6.5C14.49 6.5 16 8.52 16 11V17Z" fill="currentColor"/>
                  </svg>
                  {notifications.length > 0 && (
                    <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '12px', height: '12px', background: '#ff4d4d', borderRadius: '50%', border: '2px solid #111' }}></div>
                  )}
                </div>
                
                {/* Заменен эмодзи профиля на векторный SVG */}
                 <div onClick={() => setIsProfileOpen(!isProfileOpen)} className="top-icon-btn vates-profile-trigger" style={profileTrigger}>
                   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                   </svg>
                     <span className="vates-profile-name">
                       {sessionUser?.canSwitchMode && currentViewMode === 'staff'
                         ? 'Режим сотрудника'
                         : sessionUser?.name || 'Профиль'}
                     </span>
                    {isProfileOpen && (
                     <div style={profileDropdown}>
                        {(!sessionUser?.profileDisabled || sessionUser?.profileOwnerOnly) && (
                          <Link href="/profile" className="drop-item" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                              </svg>
                              Мой Профиль
                          </Link>
                        )}
                        <div onClick={handleLogout} className="drop-item logout-item" style={{ borderBottom: 'none', paddingLeft: '20px' }}>Выйти</div>
                     </div>
                   )}
                </div>
             </div>
           </header>

           {userRole === 'staff' && isMobileNavOpen && (
             <>
               <button
                 type="button"
                 className="vates-mobile-nav-overlay"
                 aria-label="Закрыть список разделов"
                 onClick={() => setIsMobileNavOpen(false)}
               />
               <section id="vates-mobile-nav-sheet" className="vates-mobile-nav-sheet" aria-label="Все разделы сотрудника">
                 <div className="vates-mobile-nav-sheet-heading">
                   <strong>Разделы</strong>
                   <button type="button" onClick={() => setIsMobileNavOpen(false)} aria-label="Закрыть список разделов">
                     <CustomIcon name="close" size={18} color="currentColor" accent="none" />
                   </button>
                 </div>
                 <div className="vates-mobile-nav-sheet-grid">
                   {staffSideItems.map((item) => (
                     <Link
                       key={`mobile-sheet-${item.id}`}
                       href={item.id}
                       className={`vates-mobile-nav-sheet-item ${isCurrentNavItem(item.id) ? 'active' : ''}`}
                       onClick={() => setIsMobileNavOpen(false)}
                     >
                       <CustomIcon name={item.icon} size={20} color="currentColor" accent="none" />
                       <span>{item.label}</span>
                     </Link>
                   ))}
                 </div>
               </section>
             </>
           )}

           <nav className={`vates-bottom-nav ${userRole === 'admin' ? 'is-admin' : 'is-staff'}`} aria-label="Мобильная навигация">
             {bottomSideItems.map((item) => {
               const isActive = isCurrentNavItem(item.id);
               const linkContent = (
                 <>
                   <CustomIcon name={item.icon} size={19} color="currentColor" accent="none" />
                   <span>{item.label}</span>
                 </>
               );

               if (item.id === '/admin' || item.id === '/admin#employees') {
                 return (
                   <a key={`mobile-${item.id}`} href={item.id} className={`vates-bottom-nav-item ${isActive ? 'active' : ''}`}>
                     {linkContent}
                   </a>
                 );
               }

               return (
                 <Link
                   key={`mobile-${item.id}`}
                   href={item.id}
                   className={`vates-bottom-nav-item ${isActive ? 'active' : ''}`}
                 >
                   {linkContent}
                 </Link>
               );
             })}

             {userRole === 'staff' && (
               <button
                 type="button"
                 className={`vates-bottom-nav-item vates-bottom-nav-more ${isMobileNavOpen ? 'active' : ''}`}
                 aria-expanded={isMobileNavOpen}
                 aria-controls="vates-mobile-nav-sheet"
                 onClick={() => setIsMobileNavOpen((currentValue) => !currentValue)}
               >
                 <CustomIcon name="menu" size={19} color="currentColor" accent="none" />
                 <span>Ещё</span>
               </button>
             )}
           </nav>

           {isNotifOpen && (
            <div style={notifOverlayStyle as any} onClick={() => setIsNotifOpen(false)}>
              <div style={notifSidebarStyle as any} className="notif-sidebar-custom" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#fff', margin: 0 }}>УВЕДОМЛЕНИЯ</h2>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginLeft: 'auto' }}>
                      {notifications.length > 0 && (
                          <span onClick={clearAllNotifications} style={{ fontSize: '11px', color: '#ff4d4d', cursor: 'pointer', fontWeight: '900', textTransform: 'uppercase', borderBottom: '1px dashed #ff4d4d', transition: '0.2s', whiteSpace: 'nowrap' }}>Очистить всё</span>
                      )}
                      <button type="button" className="vates-icon-button" onClick={() => setIsNotifOpen(false)} aria-label="Закрыть уведомления" title="Закрыть"><CustomIcon name="close" size={18} color="currentColor" /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {notifications.length === 0 ? (
                     <div style={{ color: '#555', textAlign: 'center', marginTop: '40px', fontSize: '14px', fontWeight: 'bold' }}>Нет новых уведомлений</div>
                  ) : (
                     notifications.map(n => (
                      <div key={n.id} style={notifItemStyle as any}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '900', color: '#0abab5' }}>{n.title}</div>
                          <button type="button" className="vates-icon-button" onClick={() => removeNotification(n.id)} aria-label="Удалить уведомление" title="Удалить"><CustomIcon name="close" size={15} color="currentColor" /></button>
                        </div>
                        <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.4' }}>{n.text}</div>
                        <div style={{ fontSize: '10px', color: '#555', marginTop: '10px', fontWeight: 'bold' }}>{n.time}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- МОДАЛЬНОЕ ОКНО ОШИБКИ (ФИРМЕННОЕ) --- */}
      {errorMessage && (
          <div style={{...modalOverlay, zIndex: 40000} as any} onClick={() => setErrorMessage("")}>
              <div className="modal-content-custom" style={{
                  background: '#111',
                  padding: '40px 30px',
                  borderRadius: '30px',
                  width: '90%',
                  maxWidth: '380px',
                  border: '1px solid #333',
                  textAlign: 'center',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                  boxSizing: 'border-box',
                  animation: 'scaleIn 0.2s ease'
              }} onClick={e => e.stopPropagation()}>
                  <div style={warningBadgeStyle as any}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                  <h2 style={{ color: '#ff4d4d', fontSize: '20px', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>Ошибка</h2>
                  <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.5', marginBottom: '25px' }}>{errorMessage}</p>
                  <div className="hover-unified-app" onClick={() => setErrorMessage("")} style={{ width: '100%', padding: '14px', background: '#333', color: '#fff', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '14px', textTransform: 'uppercase', transition: '0.2s' }}>ЗАКРЫТЬ</div>
              </div>
          </div>
      )}

      {/* --- МОДАЛЬНОЕ ОКНО ВХОДА И РЕГИСТРАЦИИ --- */}
      {showLoginModal && (
        <div style={modalOverlay}>
          <div className="modal-content-custom" style={{ ...modalContent, maxHeight: '90vh', overflowY: 'auto' }}>
            <VatesLogo className="modal-brand-logo" />
            <h2 style={{color:'#fff', textAlign:'center', marginBottom:'25px', fontWeight: '900', letterSpacing: '1px', fontSize: '18px'}}>
                {'Войти в аккаунт'}
            </h2>
            
            
            
            <input type="text" placeholder="Логин" value={login} onChange={(e)=>setLogin(e.target.value)} style={inputS} />
            <input type="password" placeholder="Пароль" value={pass} onChange={(e)=>setPass(e.target.value)} style={inputS} onKeyDown={(e) => { if(e.key === 'Enter') { handleLogin() } }} />
            
            

            {failedAttempts >= 3 && (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '15px', marginTop: '5px' }}>
                    <div style={teaGuardContainerStyle as any}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div onClick={handleCaptchaClick} style={teaGuardCheckboxStyle(isCaptchaVerified) as any}>
                                {isCaptchaLoading && <div className="captcha-spinner"></div>}
                                {isCaptchaVerified && <span style={{ color: '#0abab5', display: 'inline-flex' }}><CustomIcon name="check" size={24} color="#0abab5" /></span>}
                            </div>
                            <span style={{ color: '#fff', fontSize: '15px', fontWeight: '500' }}>Я человек</span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#0abab5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <rect x="9" y="11" width="6" height="5" rx="1" stroke="#0abab5" strokeWidth="1.5"/>
                                <path d="M10 11V9a2 2 0 014 0v2" stroke="#0abab5" strokeWidth="1.5" strokeLinecap="round"/>
                                <circle cx="12" cy="13.5" r="1" fill="#0abab5"/>
                            </svg>
                            <div style={{ color: '#fff', fontSize: '11px', fontWeight: '900', marginTop: '4px', letterSpacing: '0.5px' }}>Vates Guard</div>
                            <div style={{ color: '#666', fontSize: '9px', marginTop: '2px' }}>Ватэс</div>
                        </div>
                    </div>
                </div>
            )}
            
            {(
                <div className="hover-unified-app" onClick={handleLogin} style={modalLoginBtn}>Войти</div>
            )}
            
            

            <div onClick={()=> { 
                setShowLoginModal(false); 
                 
                setFailedAttempts(0); 
                setIsCaptchaVerified(false); 
                setIsCaptchaLoading(false); 
                
            }} className="hover-link-unified-app" style={closeText}>Отмена</div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
         @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes scaleIn { 
          from { transform: scale(0.9); opacity: 0; } 
          to { transform: scale(1); opacity: 1; } 
        }
        @keyframes captchaSpin {
          100% { transform: rotate(360deg); }
        }
        .captcha-spinner {
          width: 18px;
          height: 18px;
          border: 3px solid #333;
          border-top-color: #0abab5;
          border-radius: 50%;
          animation: captchaSpin 1s linear infinite;
        }

        body {
            margin: 0;
            padding: 0;
            overflow-x: hidden !important;
        }
        * {
            box-sizing: border-box;
        }

        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
            display: none;
            width: 0;
        }
        html, body {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }

        .custom-scroll::-webkit-scrollbar {
            display: none;
        }
        .custom-scroll {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 15px;
            color: #555;
            text-decoration: none;
            padding: 16px;
            border-radius: 18px;
            background: transparent;
            font-weight: 800;
            font-size: 15px;
            
            /* Фикс прыгающих шрифтов при масштабировании и анимациях */
            transition: transform 0.2s ease, color 0.2s ease, background-color 0.2s ease, opacity 0.2s ease;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            backface-visibility: hidden;
            transform: translateZ(0);
            will-change: transform, color, background-color;
            
            cursor: pointer;
        }
        
        /* СТИЛИ ДЛЯ ПОДПУНКТОВ МЕНЮ */
        .nav-item.sub-item {
            font-size: 13px;
            padding: 10px 16px 10px 30px;
            margin-top: -5px;
            margin-bottom: 5px;
            opacity: 0.7;
            font-weight: 700;
        }
        .sub-item-arrow {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            margin-right: 8px;
            color: rgba(255, 255, 255, 0.52);
            font-size: 14px;
            line-height: 1;
            transition: color 0.2s ease, transform 0.2s ease;
        }
        .nav-item.sub-item:hover {
            opacity: 1;
            color: #0abab5;
            background: transparent;
            transform: translateX(4px) translateZ(0);
        }
        .nav-item.sub-item:hover .sub-item-arrow {
            color: #0abab5;
            transform: translateX(1px);
        }
        .nav-item.sub-item.active {
            color: #0abab5;
            background: rgba(10, 186, 181, 0.1);
            opacity: 1;
            transform: translateX(0) translateZ(0);
        }
        .nav-item.sub-item.active .sub-item-arrow {
            color: #0abab5;
        }

        .nav-item.active:not(.sub-item) {
            color: #fff;
            background: #111;
        }
        .nav-item:not(.sub-item):hover {
            color: #0abab5;
            background: rgba(10, 186, 181, 0.05);
            transform: translateX(6px) translateZ(0);
        }
        .nav-item:not(.sub-item):active {
            transform: scale(0.96) translateX(0) translateZ(0);
            background: rgba(10, 186, 181, 0.15);
        }

        .drop-item {
            display: block;
            padding: 20px;
            color: #fff;
            text-decoration: none;
            font-size: 14px;
            font-weight: 700;
            border-bottom: 1px solid #1a1a1a;
            transition: 0.2s ease;
            cursor: pointer;
        }
        .drop-item:hover {
            background: #1a1a1a;
            color: #0abab5;
            padding-left: 28px;
        }

        .logout-item:hover {
            color: #ff4d4d !important;
            background: rgba(255, 77, 77, 0.1) !important;
        }
        
        .search-result-item:hover {
            background: rgba(10, 186, 181, 0.1);
        }

        .hover-unified-app {
            transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease !important;
        }

        .hover-unified-app:hover {
            transform: translateY(1px) scale(0.985);
            border-color: rgba(10, 186, 181, 0.45) !important;
            background: rgba(10, 186, 181, 0.14) !important;
            color: #fff !important;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10, 186, 181, 0.24);
        }

        .hover-unified-app:active {
            transform: translateY(2px) scale(0.97);
            box-shadow: inset 0 3px 8px rgba(0,0,0,0.24);
        }

        .hover-link-unified-app {
            transition: transform 0.16s ease, color 0.16s ease, text-shadow 0.16s ease !important;
        }

        .hover-link-unified-app:hover {
            transform: translateY(1px) scale(0.985);
            color: #fff !important;
            text-shadow: 0 0 10px rgba(10, 186, 181, 0.18);
        }

        .hover-link-unified-app:active {
            transform: translateY(2px) scale(0.97);
        }

        .hover-search-surface {
            transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease !important;
        }

        .hover-search-surface:hover,
        .hover-search-surface:focus-within {
            transform: translateY(1px) scale(0.995);
            border-color: rgba(10, 186, 181, 0.45) !important;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10, 186, 181, 0.18);
        }

        .hover-chip-unified-app {
            transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease !important;
        }

        .hover-chip-unified-app:hover {
            transform: translateY(1px) scale(0.985);
            border-color: rgba(10, 186, 181, 0.45) !important;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.18);
        }

        .hover-chip-unified-app:active {
            transform: translateY(2px) scale(0.97);
        }

        .hover-card-unified-app {
            transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease !important;
        }

        /* Новые стили для кнопок в хедере */
        .top-icon-btn {
            transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease !important;
        }

        .top-icon-btn:hover {
            color: #fff !important;
            transform: translateY(1px) scale(0.985);
            border-color: rgba(10, 186, 181, 0.45) !important;
            background: rgba(10, 186, 181, 0.14) !important;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10, 186, 181, 0.24);
        }

        .top-icon-btn:active {
            transform: translateY(2px) scale(0.97);
            box-shadow: inset 0 3px 8px rgba(0,0,0,0.24);
        }

        @media (max-width: 767px) {
            .search-box-container {
                width: 100% !important;
                max-width: 100% !important;
                padding: 8px 12px !important;
                margin-right: 8px !important;
                flex: 1 !important;
                min-width: 0 !important;
            }
            .search-box-container input {
                min-width: 0 !important;
                text-overflow: ellipsis !important;
            }

            .guest-header {
                right: 15px !important;
                top: 15px !important;
            }
            
            .top-actions {
                align-items: center !important;
                gap: 15px !important;
            }

            .top-actions .top-icon-btn {
                width: 40px !important;
                height: 40px !important;
                min-width: 40px !important;
                min-height: 40px !important;
                border-radius: 14px !important;
                background: #111 !important;
                border: 1px solid #222 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                line-height: 0 !important;
            }

            .top-actions .top-icon-btn svg {
                width: 18px !important;
                height: 18px !important;
                display: block !important;
            }

            .modal-content-custom {
                padding: 30px 20px !important;
                width: 95% !important;
            }

            .notif-sidebar-custom {
                width: 100% !important;
                border-left: none !important;
            }
        }
      `}</style>
    </>
  );
}

function SearchIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.5 18C14.6421 18 18 14.6421 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18Z" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

// --- СТИЛИ ---
const guestHeader: any = { position: 'fixed', top: '20px', right: '40px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '12px' };
const loginBtn: any = { background: '#0ABAB5', color: '#000', padding: '12px 35px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize:'14px' };

const sidebarStyle: any = { width: '248px', height: '100vh', background: '#000', position: 'fixed', left: 0, top: 0, padding: '22px 20px 40px 20px', display: 'flex', flexDirection: 'column', zIndex: 1001, borderRight: '1px solid #1a1a1a', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
const logoArea: any = { display: 'flex', alignItems: 'center', minHeight: '36px', gap: '15px', color: '#fff', marginBottom: '50px', paddingLeft: '58px' };
const logoIcon: any = { fontSize: '24px', cursor: 'pointer' };
const warningBadgeStyle: any = { width: '60px', height: '60px', borderRadius: '18px', border: '1px solid rgba(255,77,77,0.35)', background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: '900', margin: '0 auto 15px auto' };
const logoText: any = { fontSize: '20px', fontWeight: '900', letterSpacing: '1px', color: '#fff' };
const modeSwitchWrap: any = { marginBottom: '24px', padding: '14px', borderRadius: '18px', background: '#0f0f0f', border: '1px solid #1c1c1c' };
const modeSwitchTitle: any = { fontSize: '11px', fontWeight: '900', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' };
const modeSwitchSegment: any = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' };
const modeSwitchButton = (isActive: boolean): React.CSSProperties => ({
    minHeight: '38px',
    borderRadius: '12px',
    border: `1px solid ${isActive ? '#0abab5' : '#222'}`,
    background: isActive ? 'rgba(10,186,181,0.18)' : '#111',
    color: isActive ? '#0abab5' : '#b5b5b5',
    fontSize: '12px',
    fontWeight: 900,
    cursor: 'pointer',
    transition: '0.2s ease',
});
const sideNav: any = { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 };

const topBarStyle: any = { position: 'fixed', top: 0, right: 0, height: '90px', background: 'rgba(13, 15, 13, 0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 50px', zIndex: 1000, boxSizing: 'border-box' };
const searchBox: any = { position: 'relative', background: '#111', padding: '12px 25px', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '15px', width: '450px', maxWidth: '40vw', border: '1px solid #222', boxSizing: 'border-box' };
const searchInput: any = { background: 'none', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '16px', fontWeight: '500' };
const searchDropdownStyle: any = { position: 'absolute', top: '55px', left: 0, width: '100%', background: '#111', border: '1px solid #222', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', zIndex: 10005, display: 'flex', flexDirection: 'column' };
const searchResultItem: any = { padding: '16px 20px', borderBottom: '1px solid #1a1a1a', cursor: 'pointer', transition: '0.2s' };
const topActions: any = { display: 'flex', alignItems: 'center', gap: '30px' };
const topIcon: any = { width: '48px', height: '48px', background: '#111', border: '1px solid #222', borderRadius: '16px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', cursor: 'pointer', transition: '0.3s', flexShrink: 0 };
const profileTrigger: any = { width: '48px', height: '48px', background: '#111', border: '1px solid #222', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', color: '#888', transition: '0.3s' };
const profileDropdown: any = { position: 'absolute', top: '65px', right: 0, background: '#111', border: '1px solid #222', borderRadius: '20px', width: '220px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.7)', zIndex: 10003 };
const notifOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', zIndex: 20000, display: 'flex', justifyContent: 'flex-end' };
const notifSidebarStyle = { width: '350px', height: '100%', background: '#000', borderLeft: '1px solid #222', padding: '40px 30px', animation: 'slideInRight 0.4s ease', boxShadow: '-20px 0 50px rgba(0,0,0,0.5)', overflowY: 'auto' };
const notifItemStyle = { background: '#0d0d0d', padding: '20px', borderRadius: '18px', border: '1px solid #1a1a1a', marginBottom: '10px' };
const modalOverlay: any = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30000, backdropFilter: 'blur(15px)', boxSizing: 'border-box' };

const modalContent: any = { 
    background: '#000', 
    padding: '40px 35px', 
    borderRadius: '35px', 
    width: '90%', 
    maxWidth: '440px', 
    maxHeight: '95vh', 
    overflowY: 'auto',
    border: '1px solid #222', 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', 
    boxSizing: 'border-box',
    className: 'custom-scroll' 
};

const teaGuardContainerStyle = {
    background: '#161816',
    border: '1px solid #333',
    borderRadius: '12px',
    width: '100%',
    height: '78px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    justifyContent: 'space-between',
    boxShadow: '0px 4px 10px rgba(0,0,0,0.3)',
    boxSizing: 'border-box'
};

const teaGuardCheckboxStyle = (isVerified: boolean) => ({
    width: '32px',
    height: '32px',
    background: isVerified ? 'transparent' : '#000',
    border: isVerified ? '2px solid #0abab5' : '2px solid #444',
    borderRadius: '6px',
    cursor: isVerified ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: '0.2s ease',
    boxShadow: isVerified ? '0 0 10px rgba(10,186,181,0.2)' : 'none'
});

const inputS: any = { 
    width: '100%', 
    padding: '14px 20px', 
    marginBottom: '12px', 
    borderRadius: '14px', 
    background: '#0d0d0d', 
    border: '1px solid #222', 
    color: '#fff', 
    outline: 'none', 
    fontSize: '16px', 
    textAlign: 'center', 
    boxSizing: 'border-box' 
};

const modalLoginBtn: any = { 
    width: '100%', 
    padding: '14px', 
    background: '#0ABAB5', 
    color: '#000', 
    textAlign: 'center', 
    borderRadius: '14px', 
    fontWeight: '900', 
    cursor: 'pointer', 
    fontSize: '15px', 
    textTransform: 'uppercase', 
    marginTop: '15px', 
    boxSizing: 'border-box' 
};

const closeText: any = { 
    color: '#444', 
    textAlign: 'center', 
    marginTop: '20px', 
    cursor: 'pointer', 
    fontSize: '12px', 
    fontWeight: '800', 
    textTransform: 'uppercase' 
};
