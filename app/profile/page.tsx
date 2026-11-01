"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Navigation from '@/app/components/Navigation';
import CustomIcon from '@/app/components/CustomIcon';

import { useRouter } from 'next/navigation';
import {
    applyClientAuthState,
    clearClientAuthState,
    getClientLandingPath,
    getClientViewMode,
    type ClientSessionUser,
} from '@/app/lib/authClient';

function ProfileContent() {
    const router = useRouter();
    const [isMounted, setIsMounted] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    // Стейты для модального окна авторизации (Логин + Пароль)
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [newLogin, setNewLogin] = useState('');
    const [newPass, setNewPass] = useState('');
    const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [loginDraft, setLoginDraft] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [isSavingLogin, setIsSavingLogin] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loginSuccess, setLoginSuccess] = useState('');
    
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    
    
    const [userRole, setUserRole] = useState('staff');
    
    const [userLogin, setUserLogin] = useState('');
    const [userLocation, setUserLocation] = useState('Не указана');
    const [testResults, setTestResults] = useState<any[]>([]);
    
    // Стейты для кнопки PUSH-уведомлений
    
    
    
    const [profile, setProfile] = useState({
        name: '',
        avatar: '',
        
        
        
    });

    const [progress, setProgress] = useState({
        routeCount: 0,
        basicsCount: 0,
        totalRoute: 5,
        totalBasics: 10
    });

    useEffect(() => {
        const loadProfileData = async () => {
            try {
                const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
                if (!sessionResponse.ok) {
                    clearClientAuthState();
                    router.push('/login');
                    return;
                }
                const sessionData = await sessionResponse.json();
                const sessionUser = sessionData?.user;

                if (!sessionData?.authenticated || !sessionUser) {
                    clearClientAuthState();
                    router.push('/login');
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

                if (normalizedUser.profileDisabled && !normalizedUser.profileOwnerOnly) {
                    router.replace(getClientLandingPath(normalizedUser));
                    return;
                }

                const role = getClientViewMode(normalizedUser);
                const currentId = sessionUser.id || 'guest';
                const currentName = role === 'staff' && normalizedUser.canSwitchMode
                    ? 'Сотрудник'
                    : sessionUser.name || (role === 'admin' ? 'Главный Мастер' : 'Сотрудник');

                setUserRole(role);
                
                setUserLogin(sessionUser.login || '');

                const profileResponse = await fetch('/api/account/profile', { cache: 'no-store' });
                const profileData = profileResponse.ok ? await profileResponse.json() : null;
                const pData = profileData?.profile || {};
                setUserLocation(profileData?.user?.location || 'Не указана');

                setProfile({
                    name: currentName,
                    avatar: pData.avatar || '',
                    
                    
                    
                });

                const [routeData, basicsData, routeDb, testsDb, resultsDb] = await Promise.all([
                    fetch(`/api/storage?key=prog_route_${currentId}`).then((response) => response.json()).catch(() => []),
                    fetch(`/api/storage?key=prog_tests_${currentId}`).then((response) => response.json()).catch(() => []),
                    fetch('/api/storage?key=tea_hub_dynamic_route_v2').then((response) => response.json()).catch(() => []),
                    fetch('/api/storage?key=tea_hub_dynamic_tests_v1').then((response) => response.json()).catch(() => []),
                    fetch('/api/storage?key=tea_hub_test_results_v1').then((response) => response.json()).catch(() => []),
                ]);

                setProgress({
                    routeCount: Array.isArray(routeData) ? routeData.length : 0,
                    basicsCount: Array.isArray(basicsData) ? basicsData.length : 0,
                    totalRoute: Array.isArray(routeDb) ? routeDb.length : 5,
                    totalBasics: Array.isArray(testsDb) ? testsDb.length : 0,
                });
                setTestResults(Array.isArray(resultsDb) ? resultsDb : []);

                // Проверка подписки на Push
                

                setIsMounted(true);
            } catch (error) {
                console.error("Ошибка загрузки профиля:", error);
                setIsMounted(true); 
            }
        };

        loadProfileData();
    }, []);

    

    const handleOpenEdit = () => {
        setIsMenuOpen(false);
        setIsEditing(true);
    };

    // Открытие окна изменения данных авторизации с автоматической подгрузкой текущих логина и пароля
    const handleOpenAuthChange = async () => {
        setIsMenuOpen(false);
        setNewLogin(localStorage.getItem('login') || '');
        setNewPass('');
        setIsNewPasswordVisible(false);
        setIsAuthModalOpen(true);
    };

    const closeAuthModal = () => {
        setIsAuthModalOpen(false);
        setNewPass('');
        setIsNewPasswordVisible(false);
    };

    const openLoginModal = () => {
        setLoginDraft(userLogin);
        setLoginPassword('');
        setLoginError('');
        setLoginSuccess('');
        setIsLoginModalOpen(true);
    };

    const closeLoginModal = () => {
        if (isSavingLogin) return;
        setIsLoginModalOpen(false);
        setLoginPassword('');
        setLoginError('');
    };

    const handleChangeLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSavingLogin) return;
        const nextLogin = loginDraft.trim();
        if (!nextLogin || nextLogin.length > 120 || /[\s\u0000-\u001f\u007f]/u.test(nextLogin)) {
            setLoginError('Введите логин от 1 до 120 символов без пробелов.');
            return;
        }
        if (!loginPassword) {
            setLoginError('Введите текущий пароль.');
            return;
        }

        setIsSavingLogin(true);
        setLoginError('');
        try {
            const response = await fetch('/api/account/login', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: nextLogin, currentPassword: loginPassword }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.user) throw new Error(result?.error || 'Не удалось изменить логин.');

            // Обновляем данные текущего пользователя, сохраняя его ID и выбранный режим просмотра.
            applyClientAuthState(result.user);
            setUserLogin(result.user.login);
            setNewLogin(result.user.login);
            setLoginPassword('');
            setIsLoginModalOpen(false);
            setLoginSuccess('Логин обновлён. Для следующего входа используйте новый логин и прежний пароль.');
        } catch (error) {
            setLoginError(error instanceof Error ? error.message : 'Не удалось изменить логин.');
        } finally {
            setIsSavingLogin(false);
        }
    };

    const handleLogout = () => {
        fetch('/api/auth/logout', { method: 'POST' })
            .catch((error) => console.error('Ошибка завершения сессии:', error))
            .finally(() => {
                clearClientAuthState();
                router.push('/');
            });
    };

    const handleSaveProfile = async () => {
        try {
            const response = await fetch('/api/account/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile),
            });

            const result = await response.json().catch(() => ({}));
            if (response.ok && result?.user) {
                applyClientAuthState({
                    id: result.user.id,
                    login: result.user.login,
                    role: result.user.role,
                    name: result.user.name || profile.name,
                });
            }
        } catch (error) {
            console.error("Ошибка сохранения профиля:", error);
        }

        setIsEditing(false);
    };

    // Сохранение только пароля из модального окна
    const handleChangeAuth = async () => {
        if (!newPass.trim()) {
            alert("Пароль не может быть пустым!");
            return;
        }
        
        try {
            const response = await fetch('/api/account/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPass.trim() }),
            });

            if (response.ok) {
                alert("Пароль успешно обновлен!");
                closeAuthModal();
            } else {
                const result = await response.json().catch(() => ({}));
                alert(result?.error || "Не удалось сохранить новые данные.");
            }
        } catch (error) {
            console.error("Ошибка смены данных авторизации:", error);
            alert("Не удалось сохранить новые данные.");
        }
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setProfile(prev => ({ ...prev, avatar: event.target!.result as string }));
            }
        };
        reader.readAsDataURL(file);
    };

    if (!isMounted) return <div style={{ backgroundColor: '#0d0f0d', minHeight: '100vh' }} />;

    const routePercent = Math.min((progress.routeCount / Math.max(progress.totalRoute, 1)) * 100, 100);
    const testsPercent = Math.min((progress.basicsCount / Math.max(progress.totalBasics, 1)) * 100, 100);
    const personalTestResults = testResults.filter((result: any) => result?.userName === profile.name);
    const passedTests = personalTestResults.filter((result: any) => Number(result?.score) >= 80).length;
    const learningStatus = routePercent >= 100 ? 'Завершено' : routePercent > 0 ? 'В обучении' : 'Не начато';
    const learningStatusClass = routePercent >= 100 ? 'is-complete' : routePercent > 0 ? 'is-learning' : 'is-idle';
    const roleLabel = userRole === 'admin' ? 'Администратор' : 'Сотрудник';
    const position = userRole === 'admin' ? 'Администратор пространства' : 'Чайный мастер';

    return (
        <div className="vates-app-page vates-own-profile-page vates-personal-profile-page">
            <Navigation />
            <div className="sidebar-spacer" aria-hidden="true" />

            <main className="vates-personal-profile-main">
                <div className="vates-own-profile-content vates-personal-profile-content">
                    <header className="vates-page-heading vates-personal-profile-heading">
                        <div>
                            <span className="vates-eyebrow">Учетная запись</span>
                            <h1>Мой профиль</h1>
                            <p>Личные данные, обучение и настройки учетной записи.</p>
                        </div>
                    </header>

                    <div className="vates-profile-top-grid">
                        <section className="vates-profile-person-card">
                            <div className="vates-profile-avatar">
                                {profile.avatar ? (
                                    <img src={profile.avatar} alt={profile.name || 'Аватар пользователя'} />
                                ) : (
                                    <span>{profile.name?.slice(0, 2).toUpperCase() || 'ВТ'}</span>
                                )}
                            </div>
                            <div className="vates-profile-person-copy">
                                <h3>{profile.name || 'Пользователь'}</h3>
                                <p>{position} · {userLocation}</p>
                                <div className="vates-profile-person-actions">
                                    <button type="button" className="vates-button secondary compact" onClick={() => setIsEditing(true)}>Редактировать профиль</button>
                                    <button type="button" className="vates-button primary compact" onClick={handleOpenAuthChange}>Сменить пароль</button>
                                    <button type="button" className="vates-button danger compact" onClick={handleLogout}>Выйти</button>
                                </div>
                                <div className="vates-profile-facts">
                                    <div><span>Роль</span><strong>{roleLabel}</strong></div>
                                    <div><span>Логин</span><strong>{userLogin || 'Нет данных'}</strong></div>
                                    <div><span>Статус обучения</span><strong><span className={`vates-status-pill ${learningStatusClass}`}>{learningStatus}</span></strong></div>
                                    <div><span>Тесты</span><strong>{passedTests} из {personalTestResults.length}</strong></div>
                                </div>
                                
                            </div>
                        </section>

                        <section className="vates-profile-path-card">
                            <div className="vates-card-heading">
                                <div>
                                    <span className="vates-eyebrow">Назначенный путь</span>
                                    <h3>Базовая подготовка · v1.2</h3>
                                </div>
                                <span className="vates-status-pill is-complete">Опубликован</span>
                            </div>
                            <div className="vates-profile-progress-copy">
                                <strong>{Math.round(routePercent)}%</strong>
                                <span>{progress.routeCount} из {progress.totalRoute} шагов</span>
                            </div>
                            <div className="vates-progress-track"><span style={{ width: `${routePercent}%` }} /></div>
                            <div className="vates-profile-path-details">
                                <div><span>Начало</span><strong>Нет данных</strong></div>
                                <div><span>Последний шаг</span><strong>{progress.routeCount > 0 ? `${progress.routeCount}-й шаг` : 'Не начат'}</strong></div>
                            </div>
                            <button type="button" className="vates-profile-path-link" onClick={() => document.getElementById('vates-own-profile-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Открыть путь</button>
                        </section>
                    </div>

                    <div className="vates-profile-content-grid">
                        <div className="vates-profile-main-column">
                            <section className="vates-content-card">
                                <div className="vates-card-heading with-action">
                                    <div>
                                        <span className="vates-eyebrow">Учетная запись</span>
                                        <h3>Данные авторизации</h3>
                                    </div>
                                    <div className="vates-profile-person-actions">
                                        <button type="button" className="vates-button secondary compact" onClick={openLoginModal}>Сменить логин</button>
                                        <button type="button" className="vates-button secondary compact" onClick={handleOpenAuthChange}>Сменить пароль</button>
                                    </div>
                                </div>
                                <div className="vates-auth-grid">
                                    <label><span>Логин доступа</span><strong>{userLogin || 'Нет данных'}</strong></label>
                                    <label><span>Пароль</span><strong className="is-muted">Скрыт</strong></label>
                                </div>
                                {loginSuccess && <p role="status">{loginSuccess}</p>}
                            </section>

                            

                            <section className="vates-content-card" id="vates-own-profile-progress">
                                <div className="vates-card-heading">
                                    <div>
                                        <span className="vates-eyebrow">Последняя активность</span>
                                        <h3>Результаты обучения</h3>
                                    </div>
                                </div>
                                {personalTestResults.length === 0 ? (
                                    <div className="vates-empty-state">Действий по обучению пока нет.</div>
                                ) : (
                                    <div className="vates-profile-results">
                                        {personalTestResults.map((result: any, index: number) => {
                                            const isPassed = Number(result.score) >= 80;
                                            return (
                                                <article key={`${result.id || result.testId || result.testName}-${index}`} className="vates-profile-result-row">
                                                    <div><strong>{result.testName || 'Тест'}</strong><span>{result.date || 'Дата не указана'} · Попытка {result.attempts || 1}</span></div>
                                                    <span className={`vates-status-pill ${isPassed ? 'is-complete' : 'is-danger'}`}>{result.score ?? 0}%</span>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>

                        <aside className="vates-profile-side-column">
                            <section className="vates-content-card">
                                <div className="vates-card-heading">
                                    <div><span className="vates-eyebrow">Прогресс</span><h3>Обучение</h3></div>
                                </div>
                                <div className="vates-profile-metric">
                                    <div><span>Учебный путь</span><strong>{progress.routeCount}/{progress.totalRoute}</strong></div>
                                    <div className="vates-progress-track"><span style={{ width: `${routePercent}%` }} /></div>
                                </div>
                                <div className="vates-profile-metric">
                                    <div><span>Тесты</span><strong>{progress.basicsCount}/{progress.totalBasics}</strong></div>
                                    <div className="vates-progress-track"><span style={{ width: `${testsPercent}%` }} /></div>
                                </div>
                                <div className="vates-profile-summary-grid">
                                    <div><strong>{passedTests}</strong><span>тестов сдано</span></div>
                                    <div><strong>{personalTestResults.length}</strong><span>всего попыток</span></div>
                                </div>
                            </section>

                            <section className="vates-content-card vates-own-profile-notification-card">
    <div className="vates-card-heading"><div><span className="vates-eyebrow">Уведомления</span><h3>Личный кабинет</h3></div><span className="vates-status-pill is-complete">Доступно</span></div>
    <p>Сообщения администратора, документы и дедлайны доступны внутри платформы.</p>
    <button type="button" className="vates-button secondary own-profile-full-button" onClick={() => setIsHelpModalOpen(true)}>Открыть инструкцию</button>
</section>
                        </aside>
                    </div>
                </div>

                {isEditing && (
                    <div className="vates-own-profile-overlay" onClick={() => setIsEditing(false)}>
                        <section className="vates-own-profile-dialog" onClick={(event) => event.stopPropagation()}>
                            <header><div><span className="vates-eyebrow">Личные данные</span><h2>Редактировать профиль</h2></div><button type="button" className="vates-icon-button" onClick={() => setIsEditing(false)} aria-label="Закрыть редактор"><CustomIcon name="close" size={18} color="currentColor" /></button></header>
                            <div className="vates-own-profile-form-grid">
                                <label><span>Имя</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Ваше имя" /></label>
                                <label><span>Ссылка на фото</span><input value={profile.avatar} onChange={(event) => setProfile({ ...profile, avatar: event.target.value })} placeholder="URL фотографии" /></label>
                                <label className="vates-own-profile-upload"><span>Аватар с устройства</span><input type="file" id="avatar-upload" accept="image/*" onChange={handleAvatarUpload} /><button type="button" className="vates-button secondary compact" onClick={() => document.getElementById('avatar-upload')?.click()}>Выбрать файл</button></label>
                                
                                
                                
                            </div>
                            <div className="vates-own-profile-dialog-actions"><button type="button" className="vates-button secondary" onClick={() => setIsEditing(false)}>Отмена</button><button type="button" className="vates-button primary" onClick={handleSaveProfile}>Сохранить изменения</button></div>
                        </section>
                    </div>
                )}

                {isLoginModalOpen && (
                    <div className="vates-own-profile-overlay" onClick={closeLoginModal}>
                        <section className="vates-own-profile-dialog vates-own-profile-password-dialog" role="dialog" aria-modal="true" aria-labelledby="own-profile-login-title" onClick={event => event.stopPropagation()}>
                            <header><div><span className="vates-eyebrow">Данные авторизации</span><h2 id="own-profile-login-title">Смена логина</h2></div><button type="button" className="vates-icon-button" onClick={closeLoginModal} disabled={isSavingLogin} aria-label="Закрыть смену логина"><CustomIcon name="close" size={18} color="currentColor" /></button></header>
                            <form onSubmit={handleChangeLogin}>
                                <div className="vates-own-profile-form-grid">
                                    <label><span>Новый логин</span><input value={loginDraft} onChange={event => setLoginDraft(event.target.value)} autoComplete="username" maxLength={120} placeholder="Введите новый логин" disabled={isSavingLogin} required /></label>
                                    <label><span>Текущий пароль</span><input type="password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} autoComplete="current-password" maxLength={128} placeholder="Подтвердите текущий пароль" disabled={isSavingLogin} required /></label>
                                    <p>Пароль и учебный прогресс сохранятся. В других окнах потребуется войти заново.</p>
                                    {loginError && <p role="alert" style={{ color: 'var(--app-danger)' }}>{loginError}</p>}
                                </div>
                                <div className="vates-own-profile-dialog-actions"><button type="button" className="vates-button secondary" onClick={closeLoginModal} disabled={isSavingLogin}>Отмена</button><button type="submit" className="vates-button primary" disabled={isSavingLogin}>{isSavingLogin ? 'Сохраняем...' : 'Сохранить логин'}</button></div>
                            </form>
                        </section>
                    </div>
                )}

                {isAuthModalOpen && (
                    <div className="vates-own-profile-overlay" onClick={closeAuthModal}>
                        <section className="vates-own-profile-dialog vates-own-profile-password-dialog" onClick={(event) => event.stopPropagation()}>
                            <header><div><span className="vates-eyebrow">Безопасность</span><h2>Смена пароля</h2></div><button type="button" className="vates-icon-button" onClick={closeAuthModal} aria-label="Закрыть смену пароля"><CustomIcon name="close" size={18} color="currentColor" /></button></header>
                            <div className="vates-own-profile-form-grid">
                                <label><span>Логин доступа</span><strong>{newLogin || userLogin || 'Нет данных'}</strong></label>
                                <label className="vates-own-profile-password-field">
                                    <span>Новый пароль</span>
                                    <span className="vates-own-profile-password-control">
                                        <input
                                            id="own-profile-new-password"
                                            type={isNewPasswordVisible ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            value={newPass}
                                            onChange={(event) => setNewPass(event.target.value)}
                                            placeholder="Введите новый пароль"
                                        />
                                        <button
                                            type="button"
                                            className="vates-own-profile-password-visibility"
                                            onClick={() => setIsNewPasswordVisible((isVisible) => !isVisible)}
                                            aria-label={isNewPasswordVisible ? 'Скрыть новый пароль' : 'Показать новый пароль'}
                                            aria-pressed={isNewPasswordVisible}
                                            title={isNewPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                                        >
                                            <CustomIcon name={isNewPasswordVisible ? 'eye' : 'hidden'} size={18} color="currentColor" accent="none" />
                                        </button>
                                    </span>
                                </label>
                            </div>
                            <div className="vates-own-profile-dialog-actions"><button type="button" className="vates-button secondary" onClick={closeAuthModal}>Отмена</button><button type="button" className="vates-button primary" onClick={handleChangeAuth}>Сохранить пароль</button></div>
                        </section>
                    </div>
                )}

                {isHelpModalOpen && (
    <div className="vates-own-profile-overlay" onClick={() => setIsHelpModalOpen(false)}>
        <section className="vates-own-profile-dialog vates-own-profile-help-dialog" onClick={event => event.stopPropagation()}>
            <header><div><span className="vates-eyebrow">Уведомления</span><h2>Уведомления в личном кабинете</h2></div><button type="button" className="vates-icon-button" onClick={() => setIsHelpModalOpen(false)} aria-label="Закрыть инструкцию"><CustomIcon name="close" size={18} color="currentColor" /></button></header>
            <div className="vates-own-profile-help-copy"><p>Откройте значок колокольчика в верхней части страницы, чтобы прочитать сообщения администратора. Документы и назначенные задания доступны в соответствующих разделах кабинета.</p></div>
            <div className="vates-own-profile-dialog-actions"><button type="button" className="vates-button primary" onClick={() => setIsHelpModalOpen(false)}>Понятно, закрыть</button></div>
        </section>
    </div>
)}
            </main>
        </div>
    );

    return (
        <div className="vates-app-page profile-page vates-own-profile-page" style={{ backgroundColor: '#0d0f0d', minHeight: '100vh', color: '#fff', display: 'flex', overflowX: 'hidden' }}>
            <Navigation />
            
            <div className="sidebar-spacer" aria-hidden="true" />

            <main style={{ flex: 1, padding: '120px 20px 140px 20px', maxWidth: '100%', boxSizing: 'border-box' }}>
                <div className="vates-own-profile-content" style={{ maxWidth: '980px', margin: '0 auto' }}>
                    <header className="vates-page-heading">
                        <div>
                            <span className="vates-eyebrow">Учетная запись</span>
                            <h1>Мой профиль</h1>
                            <p>Контактные данные, прогресс обучения и настройки уведомлений.</p>
                        </div>
                    </header>
                    
                    <section className="profile-hero-card" style={profileHeaderCardStyle}>
                        
                        {/* Прозрачный фон для закрытия меню шестерёнки по клику вне его */}
                        {isMenuOpen && (
                            <div onClick={() => setIsMenuOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} />
                        )}

                        {/* Кнопка настроек (Шестерёнка) */}
                        <div onClick={() => setIsMenuOpen(!isMenuOpen)} style={settingsBtnStyle} className="settings-btn">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </div>

                        {isMenuOpen && (
                            <div style={contextMenuStyle}>
                                <div onClick={handleOpenEdit} style={menuItemStyle}>Настроить данные</div>
                                <div onClick={handleOpenAuthChange} style={menuItemStyle}>Сменить пароль</div>
                                <div onClick={handleLogout} style={{ ...menuItemStyle, color: '#ff7675', borderBottom: 'none' }}>Выйти из аккаунта</div>
                            </div>
                        )}

                        <div className="profile-avatar-frame" style={{ width: '130px', height: '130px', borderRadius: '45px', backgroundColor: '#000', margin: '0 auto 25px', border: '2px solid #4CAF50', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 15px 35px rgba(76, 175, 80, 0.2)' }}>
                            {profile.avatar ? (
                                <img src={profile.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profile" />
                            ) : (
                                <span style={avatarFallbackText as any}><CustomIcon name={userRole === 'admin' ? 'lantern' : 'user'} size={42} color="#0abab5" /></span>
                            )}
                        </div>

                        <h2 style={{ fontSize: '32px', fontWeight: '900', margin: '0 0 8px 0', color: '#fff' }}>{profile.name}</h2>
                        <p style={{ color: '#0abab5', fontWeight: 'bold', fontSize: '13px', margin: 0, letterSpacing: '2px', textTransform: 'uppercase' }}>
                            {userRole === 'admin' ? 'ГЛАВНЫЙ МАСТЕР (ADMIN)' : 'ЧАЙНЫЙ МАСТЕР (УЧЕНИК)'}
                        </p>
                    </section>

                    {/* Блок статистики обучения показывается только для сотрудников */}
                    {userRole !== 'admin' && (
                        <div style={{ animation: 'fadeInUp 0.5s ease' }}>
                            <section className="profile-theme-surface" style={progressSectionStyle}>
                                <div style={{ marginBottom: '25px' }}>
                                    <div style={labelRow}><span style={{color:'#888'}}>ПЛАН НА НЕДЕЛЮ</span><span style={{color:'#0abab5'}}>{progress.routeCount}/{progress.totalRoute}</span></div>
                                    <div style={barBg}><div style={{ ...barFill, width: `${Math.min((progress.routeCount / (progress.totalRoute || 1)) * 100, 100)}%` }} /></div>
                                </div>
                                <div>
                                    <div style={labelRow}><span style={{color:'#888'}}>ОСНОВЫ ОБУЧЕНИЯ</span><span style={{color:'#0abab5'}}>{progress.basicsCount}/{progress.totalBasics}</span></div>
                                    <div style={barBg}><div style={{ ...barFill, width: `${Math.min((progress.basicsCount / (progress.totalBasics || 1)) * 100, 100)}%` }} /></div>
                                </div>
                            </section>
                        </div>
                    )}

                    
                    

                    <section className="vates-content-card vates-own-profile-notification-card">
    <div className="vates-card-heading"><div><span className="vates-eyebrow">Уведомления</span><h3>Личный кабинет</h3></div><span className="vates-status-pill is-complete">Доступно</span></div>
    <p>Сообщения администратора, документы и дедлайны доступны внутри платформы.</p>
    <button type="button" className="vates-button secondary own-profile-full-button" onClick={() => setIsHelpModalOpen(true)}>Открыть инструкцию</button>
</section>
                </div>

                {/* МОДАЛЬНОЕ ОКНО: РЕДАКТОР ПРОФИЛЯ */}
                {isEditing && (
                    <div style={overlayStyle} onClick={() => setIsEditing(false)}>
                        <div style={modalStyle} onClick={e => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '30px', textAlign: 'center', fontWeight: '900', letterSpacing: '1px' }}>РЕДАКТОР ПРОФИЛЯ</h2>
                            <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                <input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} placeholder="Ваше имя" style={inputItemStyle} />
                                
                                <div className="profile-avatar-upload-row" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input type="file" id="avatar-upload" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                                    <input value={profile.avatar} onChange={e => setProfile({...profile, avatar: e.target.value})} placeholder="Ссылка на фото (URL)" style={{ ...inputItemStyle, flex: 1, minWidth: '220px', marginBottom: 0 }} />
                                    <button onClick={() => document.getElementById('avatar-upload')?.click()} className="profile-avatar-upload-btn hover-unified-app" style={{ background: '#222', color: '#0abab5', border: '1px solid #333', padding: '0 20px', height: '58px', borderRadius: '18px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ЗАГРУЗИТЬ</button>
                                </div>

                                
                                
                                
                            </div>
                            <button className="hover-unified-app" onClick={handleSaveProfile} style={saveButtonStyle}>СОХРАНИТЬ ИЗМЕНЕНИЯ</button>
                            <div className="hover-link-unified-app" onClick={() => setIsEditing(false)} style={cancelButtonStyle}>ОТМЕНА</div>
                        </div>
                    </div>
                )}

                {/* МОДАЛЬНОЕ ОКНО: СМЕНА ПАРОЛЯ */}
                {isAuthModalOpen && (
                    <div style={overlayStyle} onClick={() => setIsAuthModalOpen(false)}>
                        <div style={modalStyle} onClick={e => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '30px', textAlign: 'center', fontWeight: '900', letterSpacing: '1px', color: '#fff' }}>СМЕНА ПАРОЛЯ</h2>
                            <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                <div>
                                    <div style={{fontSize: '12px', color: '#888', fontWeight: 'bold', marginLeft: '5px', marginBottom: '5px'}}>Ваш логин (изменить нельзя):</div>
                                    <div style={{ ...inputItemStyle, background: '#111', color: '#888', borderColor: '#333' } as any}>{newLogin}</div>
                                </div>
                                
                                <div>
                                    <div style={{fontSize: '12px', color: '#888', fontWeight: 'bold', marginLeft: '5px', marginBottom: '5px'}}>Новый пароль доступа:</div>
                                    <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Введите новый пароль" style={inputItemStyle} />
                                </div>
                            </div>
                            <button className="hover-unified-app" onClick={handleChangeAuth} style={saveButtonStyle}>СОХРАНИТЬ ПАРОЛЬ</button>
                            <div className="hover-link-unified-app" onClick={() => setIsAuthModalOpen(false)} style={cancelButtonStyle}>ОТМЕНА</div>
                        </div>
                    </div>
                )}

                {/* МОДАЛЬНОЕ ОКНО: ИНСТРУКЦИЯ */}
                {isHelpModalOpen && (
    <div className="vates-own-profile-overlay" onClick={() => setIsHelpModalOpen(false)}>
        <section className="vates-own-profile-dialog vates-own-profile-help-dialog" onClick={event => event.stopPropagation()}>
            <header><div><span className="vates-eyebrow">Уведомления</span><h2>Уведомления в личном кабинете</h2></div><button type="button" className="vates-icon-button" onClick={() => setIsHelpModalOpen(false)} aria-label="Закрыть инструкцию"><CustomIcon name="close" size={18} color="currentColor" /></button></header>
            <div className="vates-own-profile-help-copy"><p>Откройте значок колокольчика в верхней части страницы, чтобы прочитать сообщения администратора. Документы и назначенные задания доступны в соответствующих разделах кабинета.</p></div>
            <div className="vates-own-profile-dialog-actions"><button type="button" className="vates-button primary" onClick={() => setIsHelpModalOpen(false)}>Понятно, закрыть</button></div>
        </section>
    </div>
)}
            </main>

            <style jsx global>{` 
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } 
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
                ::-webkit-scrollbar-track { background: transparent; }
                body { overflow-x: hidden; width: 100vw; }
                @media (max-width: 767px) { .sidebar-spacer { display: none; } }
                @media (max-width: 767px) {
                    .notification-help-modal {
                        padding: 24px 18px !important;
                        border-radius: 28px !important;
                    }
                    .notification-help-header {
                        align-items: flex-start !important;
                    }
                    .notification-help-tabs {
                        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                        gap: 8px !important;
                    }
                    .notification-step-card {
                        gap: 14px !important;
                        align-items: flex-start !important;
                        padding: 18px 16px !important;
                    }
                    .profile-notification-head {
                        flex-direction: column !important;
                    }
                    .profile-avatar-upload-row {
                        align-items: stretch !important;
                    }
                    .profile-avatar-upload-btn {
                        width: 100% !important;
                    }
                }
                
                .settings-btn:hover {
                    background: #222 !important;
                    border-color: #0abab5 !important;
                    color: #0abab5 !important;
                }
            `}</style>
        </div>
    );
}

// --- СТИЛИ ---

const profileHeaderCardStyle: any = { 
    position: 'relative',
    backgroundColor: '#161816', 
    padding: '40px 30px', 
    borderRadius: '40px', 
    border: '1px solid #222', 
    textAlign: 'center', 
    marginBottom: '40px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
};

const settingsBtnStyle: any = { 
    position: 'absolute', 
    top: '25px', 
    right: '25px', 
    width: '45px',
    height: '45px',
    background: '#111',
    border: '1px solid #333',
    borderRadius: '14px',
    color: '#aaa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer', 
    transition: '0.2s',
    zIndex: 95
};

const contextMenuStyle: any = { 
    position: 'absolute', 
    top: '75px', 
    right: '25px', 
    backgroundColor: '#111', 
    border: '1px solid #333', 
    borderRadius: '20px', 
    width: '220px', 
    overflow: 'hidden', 
    boxShadow: '0 20px 50px rgba(0,0,0,0.8)', 
    zIndex: 100,
    textAlign: 'left',
    animation: 'fadeIn 0.2s ease'
};

const menuItemStyle: any = { 
    padding: '16px 20px', 
    color: '#eee', 
    fontSize: '14px', 
    fontWeight: 'bold', 
    cursor: 'pointer', 
    borderBottom: '1px solid #1a1a1a', 
    transition: '0.2s' 
};



const progressSectionStyle: any = { background: '#161816', padding: '35px', borderRadius: '35px', border: '1px solid #222', marginBottom: '35px' };
const labelRow: any = { display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', fontWeight: '900' };
const barBg: any = { width: '100%', height: '10px', background: '#000', borderRadius: '12px', overflow: 'hidden' };
const barFill: any = { height: '100%', background: '#0abab5', transition: '1.2s cubic-bezier(0.4, 0, 0.2, 1)' };



const avatarFallbackText: any = { color: '#0abab5', fontSize: '32px', fontWeight: '900', letterSpacing: '2px' };

const overlayStyle: any = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000, padding: '20px', backdropFilter: 'blur(10px)', boxSizing: 'border-box' };

const modalStyle: any = { 
    background: '#111', 
    borderRadius: '40px', 
    border: '1px solid #222',
    padding: '40px 35px',
    width: '100%',
    maxWidth: '500px',
    boxSizing: 'border-box',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
};

const inputItemStyle: any = { width: '100%', padding: '20px', background: '#000', border: '1px solid #222', borderRadius: '18px', color: '#fff', outline: 'none', fontSize: '16px', boxSizing: 'border-box' };
const saveButtonStyle: any = { width: '100%', padding: '22px', background: '#0abab5', border: 'none', borderRadius: '18px', fontWeight: '900', color: '#000', cursor: 'pointer', marginTop: '20px', fontSize: '15px' };
const cancelButtonStyle: any = { textAlign: 'center', marginTop: '25px', color: '#444', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' };















export default function ProfilePage() {
    return <Suspense fallback={<div style={{backgroundColor: '#0d0f0d', minHeight: '100vh'}} />}><ProfileContent /></Suspense>;
}
