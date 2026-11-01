"use client";
import React, { useState } from 'react';
import { adminIn, modalOverlay, modalContentSmall, saveBtn } from './adminStyles';
import CustomIcon from '@/app/components/CustomIcon';

import { getVisibleWorkspaceUsers } from '@/app/lib/userVisibility';
import { applyClientAuthState } from '@/app/lib/authClient';

export default function UserManagement({
    users, setUsers, userAvatars, usersStats, totalRouteSteps, totalBasicsModules,
    userPresence, setShowSuccessModal, setErrorModal, setSelectedProfileUser
}: any) {
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'learning' | 'completed'>('all');
    const [userLocationFilter, setUserLocationFilter] = useState('all');
    const [userRoleFilter, setUserRoleFilter] = useState('all');
    const [showUserForm, setShowUserForm] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', login: '', pass: '', role: 'staff', location: '', newLocation: '' });
    const [confirmModal, setConfirmModal] = useState({ show: false, id: '' });
    const [passwordResetModal, setPasswordResetModal] = useState({ show: false, userId: '', userName: '' });
    const [temporaryPassword, setTemporaryPassword] = useState('');
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [loginEditModal, setLoginEditModal] = useState({ show: false, userId: '', userName: '', login: '' });
    const [employeeLogin, setEmployeeLogin] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isSavingLogin, setIsSavingLogin] = useState(false);
    const visibleUsers = getVisibleWorkspaceUsers(Array.isArray(users) ? users : []);

    const getUserProgress = (user: any) => {
        const route = Number(usersStats?.[user.id]?.route || 0);
        const basics = Number(usersStats?.[user.id]?.basics || 0);
        const routePercent = Math.min(100, Math.round((route / Math.max(Number(totalRouteSteps) || 1, 1)) * 100));
        const basicsPercent = Math.min(100, Math.round((basics / Math.max(Number(totalBasicsModules) || 1, 1)) * 100));
        return Math.round((routePercent + basicsPercent) / 2);
    };

    const getUserLocation = (user: any) => {
        return String(user?.location || user?.branch || user?.point || user?.department || 'Не указана');
    };

    const getUserPosition = (user: any) => {
        return String(user?.position || user?.jobTitle || (user?.role === 'admin' ? 'Администратор пространства' : 'Сотрудник'));
    };

    const formatLastSeen = (lastSeenAt: unknown) => {
        if (typeof lastSeenAt !== 'string' || !lastSeenAt) {
            return 'Последний визит: нет данных';
        }

        const date = new Date(lastSeenAt);
        if (Number.isNaN(date.getTime())) {
            return 'Последний визит: нет данных';
        }

        return `Последний визит: ${date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })} в ${date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        })}`;
    };

    const locationOptions: string[] = Array.from(new Set<string>(visibleUsers.map((user: any) => getUserLocation(user))));
    const assignableLocationOptions = locationOptions.filter((location) => location !== 'Не указана').sort((left, right) => left.localeCompare(right, 'ru'));

    const filteredUsers = visibleUsers.filter((u: any) => {
        const normalizedQuery = userSearchQuery.toLocaleLowerCase('ru').trim();
        const matchesQuery = !normalizedQuery
            || String(u.name || '').toLocaleLowerCase('ru').includes(normalizedQuery)
            || String(u.login || '').toLocaleLowerCase('ru').includes(normalizedQuery)
            || getUserLocation(u).toLocaleLowerCase('ru').includes(normalizedQuery)
            || getUserPosition(u).toLocaleLowerCase('ru').includes(normalizedQuery);
        const matchesLocation = userLocationFilter === 'all' || getUserLocation(u) === userLocationFilter;
        const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
        const progress = getUserProgress(u);
        const matchesStatus = userStatusFilter === 'all'
            || (userStatusFilter === 'completed' && progress >= 100)
            || (userStatusFilter === 'learning' && progress > 0 && progress < 100);
        return matchesQuery && matchesLocation && matchesRole && matchesStatus;
    });

    const completedCount = visibleUsers.filter((user: any) => getUserProgress(user) >= 100).length;
    const learningCount = visibleUsers.filter((user: any) => {
        const progress = getUserProgress(user);
        return progress > 0 && progress < 100;
    }).length;

    const isProtectedUser = (user: any) => {
        return user?.id === 'u_admin' || user?.id === 'u_staff' || user?.systemAccount || user?.ghostAccount;
    };

    const getRoleLabel = (user: any) => {
        if (user?.systemAccount || user?.accountLabel) {
            return user.accountLabel || 'Системный администратор';
        }

        return user?.role === 'admin' ? 'Администратор' : 'Сотрудник';
    };

    const getRoleColor = (user: any) => {
        if (user?.systemAccount || user?.accountLabel) {
            return '#f7c873';
        }

        return user?.role === 'admin' ? 'var(--app-danger)' : '#0abab5';
    };

    const getLoginLabel = (user: any) => {
        if (user?.systemAccount || user?.ghostAccount) {
            return 'скрыт';
        }

        return user?.login || '';
    };

    const openLoginEditModal = (user: { id: string; name: string; login: string }) => {
        setLoginEditModal({ show: true, userId: user.id, userName: user.name, login: user.login });
        setEmployeeLogin(user.login);
        setLoginError('');
    };

    const closeLoginEditModal = () => {
        if (isSavingLogin) return;
        setLoginEditModal({ show: false, userId: '', userName: '', login: '' });
        setLoginError('');
    };

    const saveEmployeeLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSavingLogin) return;
        const login = employeeLogin.trim();
        if (!login || login.length > 120 || /[\s\u0000-\u001f\u007f]/u.test(login)) {
            setLoginError('Введите логин от 1 до 120 символов без пробелов.');
            return;
        }

        setIsSavingLogin(true);
        setLoginError('');
        try {
            const response = await fetch('/api/admin/users/credentials', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: loginEditModal.userId, login }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.user) throw new Error(result?.error || 'Не удалось изменить логин.');

            setUsers(users.map((user: { id: string }) => user.id === result.user.id ? result.user : user));
            // Если администратор изменил свой логин, синхронизируем браузер с новой серверной сессией.
            const currentId = localStorage.getItem('current_user_id') || sessionStorage.getItem('current_user_id');
            if (currentId === result.user.id) applyClientAuthState(result.user);
            setLoginEditModal({ show: false, userId: '', userName: '', login: '' });
            setShowSuccessModal({ show: true, title: 'ЛОГИН ИЗМЕНЁН', text: `Новый логин для ${loginEditModal.userName} сохранён. Пароль остался прежним.` });
        } catch (error) {
            setLoginError(error instanceof Error ? error.message : 'Не удалось изменить логин.');
        } finally {
            setIsSavingLogin(false);
        }
    };

    const handleCreateUser = () => {
        if (!newUser.name.trim() || !newUser.login.trim() || !newUser.pass.trim()) {
            setErrorModal({ show: true, text: "Заполните все поля!" }); return;
        }
        if (users.find((u: any) => u.login === newUser.login.trim())) {
            setErrorModal({ show: true, text: "Логин уже существует!" }); return;
        }

        const location = newUser.location === '__new__' ? newUser.newLocation.trim() : newUser.location;
        if (newUser.location === '__new__' && !location) {
            setErrorModal({ show: true, text: 'Введите название новой точки.' }); return;
        }

        fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newUser.name.trim(),
                login: newUser.login.trim(),
                password: newUser.pass.trim(),
                role: newUser.role,
                location,
            }),
        })
            .then(async (response) => {
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result?.user) {
                    throw new Error(result?.error || 'Не удалось создать сотрудника');
                }

                const updatedUsers = [...users, result.user];
                setUsers(updatedUsers);
                setShowUserForm(false);
                setShowSuccessModal({ show: true, title: 'СОТРУДНИК СОЗДАН', text: `Аккаунт для ${newUser.name} успешно добавлен.` });
                setNewUser({ name: '', login: '', pass: '', role: 'staff', location: '', newLocation: '' });
            })
            .catch((error) => {
                setErrorModal({ show: true, text: error.message || 'Не удалось создать сотрудника' });
            });
    };

    const handleDeleteUser = (id: string) => {
        const targetUser = users.find((u: any) => u.id === id);
        if (isProtectedUser(targetUser)) {
            setErrorModal({ show: true, text: "Базовые аккаунты удалить нельзя!" }); return;
        }
        setConfirmModal({ show: true, id: id });
    };

    const executeDelete = async () => {
        try {
            const deleteResponse = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: confirmModal.id }),
            });
            const deleteResult = await deleteResponse.json().catch(() => ({}));
            if (!deleteResponse.ok) {
                throw new Error(deleteResult?.error || 'Не удалось удалить сотрудника');
            }

            const updatedUsers = users.filter((u: any) => u.id !== confirmModal.id);
            setUsers(updatedUsers);
        } catch (error: any) {
            setErrorModal({ show: true, text: error?.message || 'Не удалось удалить сотрудника' });
        }
        setConfirmModal({ show: false, id: '' });
    };

    const openPasswordResetModal = (user: any) => {
        setTemporaryPassword('');
        setPasswordResetModal({ show: true, userId: user.id, userName: user.name });
    };

    const closePasswordResetModal = () => {
        if (isResettingPassword) {
            return;
        }

        setTemporaryPassword('');
        setPasswordResetModal({ show: false, userId: '', userName: '' });
    };

    const executePasswordReset = async () => {
        if (temporaryPassword.trim().length < 8) {
            setErrorModal({ show: true, text: 'Временный пароль должен содержать не менее 8 символов.' });
            return;
        }

        setIsResettingPassword(true);

        try {
            const response = await fetch('/api/admin/users/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: passwordResetModal.userId,
                    temporaryPassword: temporaryPassword.trim(),
                }),
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result?.user) {
                throw new Error(result?.error || 'Не удалось сбросить пароль сотрудника');
            }

            setUsers(users.map((user: any) => (user.id === result.user.id ? result.user : user)));
            setTemporaryPassword('');
            setPasswordResetModal({ show: false, userId: '', userName: '' });
            setShowSuccessModal({
                show: true,
                title: 'ПАРОЛЬ СБРОШЕН',
                text: `Для ${passwordResetModal.userName} установлен новый временный пароль. Передайте его сотруднику безопасным способом.`,
            });
        } catch (error: any) {
            setErrorModal({ show: true, text: error?.message || 'Не удалось сбросить пароль сотрудника' });
        } finally {
            setIsResettingPassword(false);
        }
    };

    return (
        <>
            <section className="vates-employees-section" aria-labelledby="vates-employees-title">
                <div className="vates-page-heading vates-section-heading">
                    <div>
                        <h2 id="vates-employees-title">Сотрудники</h2>
                        <p>Сотрудники пространства, состояние обучения и присутствие на сайте.</p>
                    </div>
                    <button type="button" className="vates-button primary" onClick={() => setShowUserForm(true)}>Добавить сотрудника</button>
                </div>

                <div className="vates-employee-tabs" role="tablist" aria-label="Статус обучения сотрудников">
                    <button type="button" className={userStatusFilter === 'all' ? 'active' : ''} onClick={() => setUserStatusFilter('all')}>Все <span>{visibleUsers.length}</span></button>
                    <button type="button" className={userStatusFilter === 'learning' ? 'active' : ''} onClick={() => setUserStatusFilter('learning')}>В обучении <span>{learningCount}</span></button>
                    <button type="button" className={userStatusFilter === 'completed' ? 'active' : ''} onClick={() => setUserStatusFilter('completed')}>Завершили <span>{completedCount}</span></button>
                </div>

                <div className="vates-employee-filters">
                    <label>
                        <span><SearchIcon /></span>
                        <input type="search" placeholder="Поиск сотрудника" value={userSearchQuery} onChange={(event) => setUserSearchQuery(event.target.value)} />
                    </label>
                    <select value={userLocationFilter} onChange={(event) => setUserLocationFilter(event.target.value)} aria-label="Точка сотрудника">
                        <option value="all">Все точки</option>
                        {locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                    <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)} aria-label="Роль сотрудника">
                        <option value="all">Все роли</option>
                        <option value="staff">Сотрудники</option>
                        <option value="admin">Администраторы</option>
                    </select>
                </div>

                <div className="vates-table-shell">
                    <table className="vates-employee-table">
                        <thead>
                            <tr>
                                <th>Сотрудник</th>
                                <th>Точка</th>
                                <th>Роль</th>
                                <th>В сети</th>
                                <th>Прогресс</th>
                                <th>Тесты</th>
                                <th>Статус</th>
                                <th aria-label="Действия" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((u: any) => {
                                const avatarImg = userAvatars[u.id] || u.avatar;
                                const progress = getUserProgress(u);
                                const testsCompleted = Number(usersStats?.[u.id]?.basics || 0);
                                const status = progress >= 100 ? 'Завершил' : progress > 0 ? 'Учится' : 'Не начал';
                                const statusClass = progress >= 100 ? 'complete' : progress > 0 ? 'learning' : 'idle';
                                const location = getUserLocation(u);
                                const position = getUserPosition(u);
                                const isAdminUser = u.role === 'admin';
                                const presence = userPresence?.[u.id];
                                const isOnline = presence?.isOnline === true;

                                return (
                                    <tr key={u.id}>
                                        <td data-label="Сотрудник">
                                            <div className="vates-employee-person">
                                                <div className="vates-employee-avatar">
                                                    {avatarImg ? <img src={avatarImg} alt="" /> : (
                                                        <span style={avatarFallbackText as any}>
                                                            {u.systemAccount || u.ghostAccount ? <CustomIcon name="gear" size={18} color="var(--app-warning)" accent="none" /> : String(u.name || 'В').slice(0, 2).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                <div>
                                                    <button type="button" onClick={() => setSelectedProfileUser(u)}>{u.name}</button>
                                                    <span title={`Логин: ${getLoginLabel(u)}`}>{u.systemAccount || u.ghostAccount ? 'Служебная запись' : position}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td data-label="Точка">{location}</td>
                                        <td data-label="Роль"><span style={{ color: getRoleColor(u) }}>{getRoleLabel(u)}</span></td>
                                        <td data-label="В сети">
                                            <div className="vates-presence-cell">
                                                <span className={`vates-presence-badge ${isOnline ? 'is-online' : 'is-offline'}`}>
                                                    <span />{isOnline ? 'Онлайн' : 'Не в сети'}
                                                </span>
                                                {!isOnline && <small className="vates-presence-last-seen">{formatLastSeen(presence?.lastSeenAt)}</small>}
                                            </div>
                                        </td>
                                        <td data-label="Прогресс">
                                            {isAdminUser ? <span className="vates-table-not-applicable">—</span> : (
                                                <div className="vates-table-progress"><span>{progress}%</span><b><i style={{ width: `${progress}%` }} /></b></div>
                                            )}
                                        </td>
                                        <td data-label="Тесты">{isAdminUser ? <span className="vates-table-not-applicable">—</span> : `${testsCompleted} из ${Math.max(Number(totalBasicsModules) || 0, testsCompleted)}`}</td>
                                        <td data-label="Статус">{isAdminUser ? <span className="vates-table-not-applicable">—</span> : <span className={`vates-status-badge ${statusClass}`}>{status}</span>}</td>
                                        <td data-label="Действия">
                                            <div className="vates-row-actions">
                                                <button type="button" className="vates-button compact secondary" onClick={() => setSelectedProfileUser(u)}>Профиль</button>
                                                {!u.systemAccount && !u.ghostAccount && (
                                                    <button type="button" className="vates-button compact secondary" title="Сменить логин" aria-label={`Сменить логин сотрудника ${u.name}`} onClick={() => openLoginEditModal(u)}>Логин</button>
                                                )}
                                                {!u.systemAccount && !u.ghostAccount && (
                                                    <button type="button" className="vates-icon-action" title="Сбросить пароль" onClick={() => openPasswordResetModal(u)}><CustomIcon name="refresh" size={17} color="currentColor" accent="none" /></button>
                                                )}
                                                {!isProtectedUser(u) && (
                                                    <button type="button" className="vates-icon-action danger" title="Удалить сотрудника" onClick={() => handleDeleteUser(u.id)}><CustomIcon name="close" size={17} color="currentColor" accent="none" /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredUsers.length === 0 && <div className="vates-table-empty">Сотрудники не найдены</div>}
                </div>
            </section>

            {/* Модалки создания и удаления */}
            {showUserForm && (
                <div className="vates-employee-modal-overlay" style={modalOverlay as any}>
                    <div className="vates-employee-create-modal">
                        <div className="vates-employee-create-header">
                            <span>Новая учетная запись</span>
                            <h2>Добавить сотрудника</h2>
                            <p>Укажите доступ, роль и точку работы сотрудника.</p>
                        </div>
                        <div className="vates-employee-form-grid">
                            <label className="vates-employee-form-field">
                                <span>Имя сотрудника</span>
                                <input placeholder="Например, Анна Лебедева" value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
                            </label>
                            <label className="vates-employee-form-field">
                                <span>Логин</span>
                                <input autoComplete="username" placeholder="Логин для входа" value={newUser.login} onChange={(event) => setNewUser({ ...newUser, login: event.target.value })} />
                            </label>
                            <label className="vates-employee-form-field">
                                <span>Временный пароль</span>
                                <input type="password" autoComplete="new-password" placeholder="Пароль для первого входа" value={newUser.pass} onChange={(event) => setNewUser({ ...newUser, pass: event.target.value })} />
                            </label>
                            <label className="vates-employee-form-field">
                                <span>Роль</span>
                                <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
                                    <option value="staff">Чайный мастер</option>
                                    <option value="admin">Администратор</option>
                                </select>
                            </label>
                        </div>
                        <div className="vates-employee-location-panel">
                            <div>
                                <span className="vates-employee-form-label">Точка работы</span>
                                <p>Выберите существующую точку или добавьте новую.</p>
                            </div>
                            <select value={newUser.location} onChange={(event) => setNewUser({ ...newUser, location: event.target.value, newLocation: event.target.value === '__new__' ? newUser.newLocation : '' })} aria-label="Точка работы">
                                <option value="">Без точки</option>
                                {assignableLocationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
                                <option value="__new__">Создать новую точку</option>
                            </select>
                            {newUser.location === '__new__' && (
                                <label className="vates-employee-form-field is-new-location">
                                    <span>Название новой точки</span>
                                    <input maxLength={120} placeholder="Например, ТЦ Центральный" value={newUser.newLocation} onChange={(event) => setNewUser({ ...newUser, newLocation: event.target.value })} />
                                </label>
                            )}
                        </div>
                        <div className="vates-employee-create-actions">
                            <button type="button" className="vates-button secondary" onClick={() => setShowUserForm(false)}>Отмена</button>
                            <button type="button" className="vates-button primary" onClick={handleCreateUser}>Создать учетную запись</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmModal.show && (
                <div className="vates-employee-modal-overlay" style={modalOverlay as any} onClick={() => setConfirmModal({ show: false, id: '' })}>
                    <div style={{...modalContentSmall, textAlign: 'center'} as any} onClick={e => e.stopPropagation()}>
                        <div style={warningBadgeStyle as any}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px' }}>УДАЛИТЬ?</h2>
                        <p style={{ color: '#ccc', fontSize: '15px', marginBottom: '25px' }}>Вы уверены, что хотите удалить сотрудника?</p>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button className="hover-unified-app" onClick={() => setConfirmModal({ show: false, id: '' })} style={{...saveBtn, background: '#222', color: '#fff', flex: 1} as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={executeDelete} style={{...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1} as any}>УДАЛИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {loginEditModal.show && (
                <div className="vates-employee-modal-overlay" style={modalOverlay as React.CSSProperties} onClick={closeLoginEditModal}>
                    <section className="vates-employee-create-modal" role="dialog" aria-modal="true" aria-labelledby="employee-login-title" onClick={event => event.stopPropagation()}>
                        <div className="vates-employee-create-header"><span>Данные авторизации</span><h2 id="employee-login-title">Смена логина</h2></div>
                        <form onSubmit={saveEmployeeLogin}>
                            <p style={{ color: 'var(--app-warning)', lineHeight: 1.55 }}>
                                Вы меняете логин сотрудника <strong>{loginEditModal.userName}</strong>. Передайте ему новый логин: прежний перестанет работать. Пароль и учебный прогресс сохранятся.
                            </p>
                            <p>Текущий логин: <strong>{loginEditModal.login}</strong></p>
                            <label className="vates-employee-form-field"><span>Новый логин</span><input value={employeeLogin} onChange={event => setEmployeeLogin(event.target.value)} autoComplete="off" maxLength={120} placeholder="Новый логин сотрудника" disabled={isSavingLogin} required /></label>
                            {loginError && <p role="alert" style={{ color: 'var(--app-danger)' }}>{loginError}</p>}
                            <div className="vates-employee-create-actions"><button type="button" className="vates-button secondary" onClick={closeLoginEditModal} disabled={isSavingLogin}>Отмена</button><button type="submit" className="vates-button primary" disabled={isSavingLogin}>{isSavingLogin ? 'Сохраняем...' : 'Сохранить логин'}</button></div>
                        </form>
                    </section>
                </div>
            )}

            {passwordResetModal.show && (
                <div className="vates-employee-modal-overlay" style={modalOverlay as any} onClick={closePasswordResetModal}>
                    <div className="user-management-reset-modal" style={{ ...modalContentSmall, textAlign: 'center' } as any} onClick={e => e.stopPropagation()}>
                        <div style={warningBadgeStyle as any}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px' }}>СБРОСИТЬ ПАРОЛЬ?</h2>
                        <p style={{ color: '#ccc', fontSize: '15px', lineHeight: 1.55, marginBottom: '22px' }}>
                            Старый пароль сотрудника <strong>{passwordResetModal.userName}</strong> перестанет работать сразу после подтверждения. Передайте новый временный пароль только самому сотруднику.
                        </p>
                        <label className="user-management-password-label" htmlFor="temporary-employee-password">Новый временный пароль</label>
                        <input
                            id="temporary-employee-password"
                            type="text"
                            autoComplete="new-password"
                            value={temporaryPassword}
                            onChange={event => setTemporaryPassword(event.target.value)}
                            placeholder="Не менее 8 символов"
                            style={{ ...adminIn, marginBottom: '20px' } as any}
                            disabled={isResettingPassword}
                        />
                        <div className="user-management-reset-actions">
                            <button
                                type="button"
                                className="hover-unified-app"
                                onClick={closePasswordResetModal}
                                style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1 } as any}
                                disabled={isResettingPassword}
                            >
                                ОТМЕНА
                            </button>
                            <button
                                type="button"
                                className="hover-unified-app"
                                onClick={executePasswordReset}
                                style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1 } as any}
                                disabled={isResettingPassword}
                            >
                                {isResettingPassword ? 'СОХРАНЯЕМ...' : 'СБРОСИТЬ'}
                            </button>
                        </div>
                        <p className="user-management-password-hint">После входа сотрудник сможет заменить временный пароль в своём профиле.</p>
                    </div>
                </div>
            )}
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

const avatarFallbackText = {
    color: '#0abab5',
    fontSize: '16px',
    fontWeight: '900',
    letterSpacing: '1px'
};

const warningBadgeStyle = {
    width: '60px',
    height: '60px',
    borderRadius: '18px',
    border: '1px solid rgba(255,77,77,0.35)',
    background: 'rgba(255,77,77,0.08)',
    color: '#ff4d4d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: '900',
    margin: '0 auto 20px auto'
};
