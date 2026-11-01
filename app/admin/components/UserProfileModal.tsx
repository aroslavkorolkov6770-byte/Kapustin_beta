"use client";

import React from 'react';
import CustomIcon from '@/app/components/CustomIcon';
import { isSystemWorkspaceAccount } from '@/app/lib/userVisibility';
import { modalOverlay } from './adminStyles';

export default function UserProfileModal({
    selectedProfileUser, setSelectedProfileUser, userProfiles, usersStats,
    totalRouteSteps, totalBasicsModules, userAvatars, testResults,
    editAuthMode, setEditAuthMode, editAuthLogin, setEditAuthLogin,
    editAuthPass, setEditAuthPass, handleSaveUserAuth
}: any) {
    if (!selectedProfileUser) return null;
    if (isSystemWorkspaceAccount(selectedProfileUser)) return null;

    const profileData = userProfiles[selectedProfileUser.id] || {};
    const routeLength = usersStats[selectedProfileUser.id]?.route || 0;
    const basicsLength = usersStats[selectedProfileUser.id]?.basics || 0;
    const profileAvatar = userAvatars[selectedProfileUser.id] || selectedProfileUser.avatar;
    
    
    
    const routePercent = Math.min((routeLength / (totalRouteSteps || 1)) * 100, 100);
    const testsPercent = Math.min((basicsLength / (totalBasicsModules || 1)) * 100, 100);
    const employeeResults = testResults.filter((result: any) => result.userName === selectedProfileUser.name);
    const attestationResults = employeeResults.filter((result: any) => result.testName?.toLowerCase().includes('аттестация'));
    const passedTests = employeeResults.filter((result: any) => Number(result.score) >= 80).length;
    const location = selectedProfileUser.location || selectedProfileUser.branch || selectedProfileUser.point || selectedProfileUser.department || 'Не указана';
    const position = selectedProfileUser.position || selectedProfileUser.jobTitle || (selectedProfileUser.role === 'admin' ? 'Администратор пространства' : 'Сотрудник');
    const learningStatus = routePercent >= 100 ? 'Завершено' : routePercent > 0 ? 'В обучении' : 'Не начато';
    const lastLogin = profileData.lastLogin || selectedProfileUser.lastLogin || 'Нет данных';

    const closeProfile = () => {
        setSelectedProfileUser(null);
        setEditAuthMode(false);
    };

    return (
        <div className="vates-profile-overlay" style={modalOverlay as any} onClick={closeProfile}>
            <div className="vates-profile-modal custom-scroll" onClick={(event) => event.stopPropagation()}>
                <header className="vates-profile-page-header">
                    <div>
                        <button type="button" className="vates-profile-back-button" onClick={closeProfile}>К списку</button>
                        <h2>Профиль сотрудника</h2>
                        <p>Контекст сотрудника, назначенный путь и текущее состояние обучения.</p>
                    </div>
                    <button type="button" className="vates-icon-button" onClick={closeProfile} aria-label="Закрыть профиль" title="Закрыть">
                        <CustomIcon name="close" size={20} color="currentColor" />
                    </button>
                </header>

                <div className="vates-profile-top-grid">
                    <section className="vates-profile-person-card">
                        <div className="vates-profile-avatar">
                            {profileAvatar ? (
                                <img src={profileAvatar} alt={selectedProfileUser.name} />
                            ) : (
                                <span>{selectedProfileUser.name?.slice(0, 2).toUpperCase() || 'ВТ'}</span>
                            )}
                        </div>
                        <div className="vates-profile-person-copy">
                            <h3>{selectedProfileUser.name}</h3>
                            <p>{position} · {location}</p>
                            <div className="vates-profile-person-actions">
                                <button
                                    type="button"
                                    className="vates-button secondary compact"
                                    onClick={() => document.getElementById('vates-profile-learning-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                >
                                    Открыть прогресс
                                </button>
                                <button
                                    type="button"
                                    className="vates-button primary compact"
                                    onClick={() => {
                                        setEditAuthLogin(selectedProfileUser.login);
                                        setEditAuthPass('');
                                        setEditAuthMode(true);
                                    }}
                                >
                                    Редактировать доступ
                                </button>
                            </div>
                            <div className="vates-profile-facts">
                                <div><span>Роль</span><strong>{selectedProfileUser.role === 'admin' ? 'Администратор' : 'Сотрудник'}</strong></div>
                                <div><span>Последний вход</span><strong>{lastLogin}</strong></div>
                                <div><span>Статус обучения</span><strong><span className={`vates-status-pill ${routePercent >= 100 ? 'is-complete' : routePercent > 0 ? 'is-learning' : 'is-idle'}`}>{learningStatus}</span></strong></div>
                                <div><span>Тесты</span><strong>{passedTests} из {employeeResults.length}</strong></div>
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
                            <span>{routeLength} из {totalRouteSteps || 0} шагов</span>
                        </div>
                        <div className="vates-progress-track"><span style={{ width: `${routePercent}%` }} /></div>
                        <div className="vates-profile-path-details">
                            <div><span>Начало</span><strong>Нет данных</strong></div>
                            <div><span>Последний шаг</span><strong>{routeLength > 0 ? `${routeLength}-й шаг` : 'Не начат'}</strong></div>
                        </div>
                        <button
                            type="button"
                            className="vates-profile-path-link"
                            onClick={() => document.getElementById('vates-profile-learning-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                            Открыть путь
                        </button>
                    </section>
                </div>

                <div className="vates-profile-content-grid">
                    <div className="vates-profile-main-column">
                        <section className="vates-content-card" id="vates-profile-learning-progress">
                            <div className="vates-card-heading with-action">
                                <div>
                                    <span className="vates-eyebrow">Учетная запись</span>
                                    <h3>Данные авторизации</h3>
                                </div>
                                <button
                                    type="button"
                                    className={editAuthMode ? 'vates-button primary compact' : 'vates-button secondary compact'}
                                    onClick={() => {
                                        if (editAuthMode) {
                                            handleSaveUserAuth();
                                        } else {
                                            setEditAuthLogin(selectedProfileUser.login);
                                            setEditAuthPass('');
                                            setEditAuthMode(true);
                                        }
                                    }}
                                >
                                    <CustomIcon name={editAuthMode ? 'check' : 'edit'} size={16} color="currentColor" />
                                    {editAuthMode ? 'Сохранить' : 'Редактировать'}
                                </button>
                            </div>
                            <div className="vates-auth-grid">
                                <label>
                                    <span>Логин доступа</span>
                                    {editAuthMode ? (
                                        <input value={editAuthLogin} onChange={(event) => setEditAuthLogin(event.target.value)} />
                                    ) : (
                                        <strong>{selectedProfileUser.login}</strong>
                                    )}
                                </label>
                                <label>
                                    <span>Новый пароль</span>
                                    {editAuthMode ? (
                                        <input type="password" value={editAuthPass} onChange={(event) => setEditAuthPass(event.target.value)} placeholder="Введите новый пароль" />
                                    ) : (
                                        <strong className="is-muted">Скрыт</strong>
                                    )}
                                </label>
                            </div>
                        </section>

                        <section className="vates-content-card">
                            <div className="vates-card-heading">
                                <div>
                                    <span className="vates-eyebrow">Последняя активность</span>
                                    <h3>Результаты обучения</h3>
                                </div>
                            </div>
                            {employeeResults.length === 0 ? (
                                <div className="vates-empty-state">Действий по обучению пока нет.</div>
                            ) : (
                                <div className="vates-profile-results">
                                    {employeeResults.map((result: any) => {
                                        const isPassed = Number(result.score) >= 80;
                                        return (
                                            <article key={result.id} className="vates-profile-result-row">
                                                <div>
                                                    <strong>{result.testName}</strong>
                                                    <span>{result.date} · Попытка {result.attempts}</span>
                                                </div>
                                                <span className={`vates-status-pill ${isPassed ? 'is-complete' : 'is-danger'}`}>
                                                    {result.score}%
                                                </span>
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
                                <div>
                                    <span className="vates-eyebrow">Прогресс</span>
                                    <h3>Обучение</h3>
                                </div>
                            </div>
                            <div className="vates-profile-metric">
                                <div><span>Учебный путь</span><strong>{routeLength}/{totalRouteSteps || 0}</strong></div>
                                <div className="vates-progress-track"><span style={{ width: `${routePercent}%` }} /></div>
                            </div>
                            <div className="vates-profile-metric">
                                <div><span>Тесты</span><strong>{basicsLength}/{totalBasicsModules || 0}</strong></div>
                                <div className="vates-progress-track"><span style={{ width: `${testsPercent}%` }} /></div>
                            </div>
                            <div className="vates-profile-summary-grid">
                                <div><strong>{passedTests}</strong><span>тестов сдано</span></div>
                                <div><strong>{employeeResults.length}</strong><span>всего попыток</span></div>
                            </div>
                        </section>

                        <section className="vates-content-card">
                            <div className="vates-card-heading">
                                <div>
                                    <span className="vates-eyebrow">Достижения</span>
                                    <h3>Этапы развития</h3>
                                </div>
                            </div>
                            <div className="vates-achievements-grid">
                                <div className={routeLength >= 1 ? 'is-earned' : ''} title="Старт"><CustomIcon name="sprout" size={22} color="currentColor" /></div>
                                <div className={routeLength >= 5 ? 'is-earned' : ''} title="Учебный план"><CustomIcon name="rocket" size={22} color="currentColor" /></div>
                                <div className={basicsLength >= 5 ? 'is-earned' : ''} title="Теория"><CustomIcon name="book" size={22} color="currentColor" /></div>
                                <div className={basicsLength >= 10 ? 'is-earned' : ''} title="Мастер"><CustomIcon name="lantern" size={22} color="currentColor" /></div>
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}
