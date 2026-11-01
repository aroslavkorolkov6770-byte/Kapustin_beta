"use client";
import React from 'react';
import CustomIcon from '@/app/components/CustomIcon';
import { modalOverlay } from './adminStyles';
import { getVisibleWorkspaceUsers } from '@/app/lib/userVisibility';

export default function TestResultsModal({
    setShowTestModal, selectedTestUser, setSelectedTestUser, users, testResults
}: any) {
    const visibleUsers = getVisibleWorkspaceUsers(Array.isArray(users) ? users : []);
    const filteredResults = testResults.filter(
        (result: any) => selectedTestUser === 'Все' || result.userName === selectedTestUser
    );
    const passedResults = filteredResults.filter((result: any) => result.score === 100).length;
    const averageScore = filteredResults.length > 0
        ? Math.round(filteredResults.reduce((total: number, result: any) => total + result.score, 0) / filteredResults.length)
        : 0;

    return (
        <div className="vates-test-results-overlay" style={modalOverlay as any} onClick={() => setShowTestModal(false)}>
            <section
                className="admin-modal-content vates-test-results-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vates-test-results-title"
                onClick={event => event.stopPropagation()}
            >
                <header className="vates-test-results-header">
                    <div>
                        <span className="vates-eyebrow">Контроль знаний</span>
                        <h2 id="vates-test-results-title">Результаты тестов</h2>
                        <p>Результаты и количество попыток сотрудников.</p>
                    </div>
                    <button
                        type="button"
                        className="vates-test-results-close"
                        onClick={() => setShowTestModal(false)}
                        aria-label="Закрыть результаты тестов"
                        title="Закрыть"
                    >
                        <CustomIcon name="close" size={19} color="currentColor" accent="none" />
                    </button>
                </header>

                <div className="vates-test-results-controls">
                    <label className="vates-test-results-filter">
                        <span>Сотрудник</span>
                        <select
                            value={selectedTestUser}
                            onChange={(event) => setSelectedTestUser(event.target.value)}
                        >
                            <option value="Все">Все сотрудники</option>
                            {visibleUsers.filter((user: any) => user.role === 'staff').map((user: any) => (
                                <option key={user.id} value={user.name}>{user.name} ({user.login})</option>
                            ))}
                        </select>
                    </label>

                    <div className="vates-test-results-summary" aria-label="Сводка результатов">
                        <div>
                            <span>Результатов</span>
                            <strong>{filteredResults.length}</strong>
                        </div>
                        <div>
                            <span>Пройдено</span>
                            <strong>{passedResults}</strong>
                        </div>
                        <div>
                            <span>Средний балл</span>
                            <strong>{averageScore}%</strong>
                        </div>
                    </div>
                </div>

                <div className="vates-test-results-list custom-scroll">
                    {filteredResults.map((result: any) => {
                        const isPassed = result.score === 100;

                        return (
                            <article
                                key={result.id}
                                className={`vates-test-result-card ${isPassed ? 'is-passed' : 'is-failed'}`}
                            >
                                <div className="vates-test-result-copy">
                                    <span className="vates-test-result-type">Проверка знаний</span>
                                    <h3>{result.testName}</h3>
                                    <div className="vates-test-result-meta">
                                        <span>
                                            <CustomIcon name="user" size={15} color="currentColor" accent="none" />
                                            {result.userName}
                                        </span>
                                        <span>Попыток: <strong>{result.attempts}</strong></span>
                                    </div>
                                </div>
                                <div className="vates-test-result-score">
                                    <strong>{result.score}%</strong>
                                    <span>{isPassed ? 'Пройден' : 'Не пройден'}</span>
                                </div>
                            </article>
                        );
                    })}

                    {filteredResults.length === 0 && (
                        <div className="vates-test-results-empty">
                            <span><CustomIcon name="cap" size={23} color="currentColor" accent="none" /></span>
                            <strong>Результатов пока нет</strong>
                            <p>Для выбранного сотрудника тестирования ещё не сохранены.</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
