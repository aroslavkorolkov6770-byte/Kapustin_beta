"use client";

import React, { useState } from 'react';
import CustomIcon from '@/app/components/CustomIcon';
import { getVisibleWorkspaceUsers } from '@/app/lib/userVisibility';

type VatesAdminOverviewProps = {
    users: any[];
    usersStats: Record<string, { route?: number; basics?: number }>;
    totalRouteSteps: number;
    totalBasicsModules: number;
    testResults: any[];
    urgentFiles: any[];
    onOpenEmployees: () => void;
    onOpenTestResults: () => void;
    onOpenMaterials: () => void;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export default function VatesAdminOverview({
    users,
    usersStats,
    totalRouteSteps,
    totalBasicsModules,
    testResults,
    urgentFiles,
    onOpenEmployees,
    onOpenTestResults,
    onOpenMaterials,
}: VatesAdminOverviewProps) {
    const [period, setPeriod] = useState<7 | 30 | 90>(30);
    const [progressAnimationVersion, setProgressAnimationVersion] = useState(0);
    const staffUsers = getVisibleWorkspaceUsers(Array.isArray(users) ? users : [])
        .filter(user => user?.role === 'staff' && !user?.hideFromStats && !user?.profileDisabled);

    const progressRows = staffUsers.map(user => {
        const route = Number(usersStats[user.id]?.route || 0);
        const basics = Number(usersStats[user.id]?.basics || 0);
        const routePercent = clampPercent((route / Math.max(totalRouteSteps, 1)) * 100);
        const basicsPercent = clampPercent((basics / Math.max(totalBasicsModules, 1)) * 100);
        const progress = clampPercent((routePercent + basicsPercent) / 2);
        return { user, progress };
    });

    const completedCount = progressRows.filter(item => item.progress >= 100).length;
    const learningCount = progressRows.filter(item => item.progress > 0 && item.progress < 100).length;
    const notStartedCount = progressRows.filter(item => item.progress === 0).length;
    const averageProgress = progressRows.length
        ? clampPercent(progressRows.reduce((sum, item) => sum + item.progress, 0) / progressRows.length)
        : 0;
    const scoredTestResults = testResults.filter(result => Number.isFinite(Number(result?.score)));
    const averageTestScore = scoredTestResults.length
        ? clampPercent(scoredTestResults.reduce((sum, result) => sum + Number(result.score), 0) / scoredTestResults.length)
        : 0;
    const reviewCount = urgentFiles.filter(file => {
        const status = String(file?.status || file?.reviewStatus || '').toLocaleLowerCase('ru');
        return status.includes('провер') || status === 'review' || status === 'pending';
    }).length;

    const distribution = [
        { label: 'В обучении', value: learningCount, color: 'var(--app-accent)' },
        { label: 'Завершили', value: completedCount, color: 'var(--app-success)' },
        { label: 'Не начали', value: notStartedCount, color: 'var(--app-text-soft)' },
    ];
    const maxDistributionValue = Math.max(...distribution.map(item => item.value), 1);
    const hasAttentionItems = reviewCount > 0 || notStartedCount > 0;
    const progressRingStyle = (averageProgress > 0
        ? { '--progress-target': `${averageProgress * 3.6}deg` }
        : { '--progress': `${averageProgress * 3.6}deg` }) as unknown as React.CSSProperties;

    const handlePeriodChange = (value: 7 | 30 | 90) => {
        setPeriod(value);
        setProgressAnimationVersion(version => version + 1);
    };

    return (
        <section className="vates-admin-overview" aria-labelledby="vates-workspace-title">
            <div className="vates-page-heading">
                <div>
                    <p className="vates-page-eyebrow">Центр управления обучением</p>
                    <h1 id="vates-workspace-title">Рабочее пространство</h1>
                    <p>Сводка по сотрудникам, учебным материалам и результатам.</p>
                </div>
            </div>

            <div className="vates-kpi-grid" aria-label="Ключевые показатели">
                <button type="button" className="vates-kpi-card" onClick={onOpenEmployees}>
                    <span>Сотрудники в обучении</span>
                    <strong>{learningCount}</strong>
                    <small>Открыть список</small>
                </button>
                <button type="button" className="vates-kpi-card" onClick={onOpenTestResults}>
                    <span>Завершили обучение</span>
                    <strong>{completedCount}</strong>
                    <small>Посмотреть результаты</small>
                </button>
                <button type="button" className="vates-kpi-card" onClick={onOpenMaterials}>
                    <span>Документы на проверке</span>
                    <strong>{reviewCount}</strong>
                    <small>Перейти к документам</small>
                </button>
            </div>

            <div className="vates-overview-grid">
                <article className="vates-panel vates-attention-panel">
                    <div className="vates-panel-heading">
                        <div>
                            <h2>Требует внимания</h2>
                            <p>Задачи, которые влияют на актуальность обучения.</p>
                        </div>
                    </div>

                    {hasAttentionItems ? (
                        <div className="vates-attention-list">
                            {reviewCount > 0 && (
                                <div className="vates-attention-item">
                                    <span className="vates-attention-icon warning"><CustomIcon name="file" size={22} color="currentColor" accent="none" /></span>
                                    <div>
                                        <strong>{reviewCount} {reviewCount === 1 ? 'документ' : 'документов'} на проверке</strong>
                                        <span>До подтверждения AI не должен использовать эти источники.</span>
                                    </div>
                                    <button type="button" className="vates-button compact secondary" onClick={onOpenMaterials}>Открыть</button>
                                </div>
                            )}
                            {notStartedCount > 0 && (
                                <div className="vates-attention-item">
                                    <span className="vates-attention-icon warning"><CustomIcon name="user" size={22} color="currentColor" accent="none" /></span>
                                    <div>
                                        <strong>{notStartedCount} {notStartedCount === 1 ? 'сотрудник не начал' : 'сотрудников не начали'}</strong>
                                        <span>Проверьте назначение учебного пути.</span>
                                    </div>
                                    <button type="button" className="vates-button compact secondary" onClick={onOpenEmployees}>Посмотреть</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="vates-attention-empty">
                            <span className="vates-attention-icon success"><CustomIcon name="success" size={22} color="currentColor" accent="none" /></span>
                            <div>
                                <strong>Все под контролем</strong>
                                <span>Документы проверены, а сотрудники уже приступили к обучению.</span>
                            </div>
                        </div>
                    )}
                </article>

                <article className="vates-panel vates-training-statistics">
                    <div className="vates-panel-heading vates-statistics-heading">
                        <div>
                            <h2>Статистика обучения</h2>
                            <p>Актуальный срез по всем сотрудникам. Период отображения: {period} дней.</p>
                        </div>
                        <div className="vates-segmented-control" role="group" aria-label="Период статистики">
                            {([7, 30, 90] as const).map(value => (
                                <button
                                    type="button"
                                    key={value}
                                    className={period === value ? 'active' : ''}
                                    onClick={() => handlePeriodChange(value)}
                                >
                                    {value} дней
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="vates-statistics-summary">
                        <div
                            key={`${period}-${progressAnimationVersion}-${averageProgress}`}
                            className={`vates-progress-ring ${averageProgress > 0 ? 'is-animated' : 'is-empty'}`}
                            style={progressRingStyle}
                        >
                            <div><strong>{averageProgress}%</strong><span>средний прогресс</span></div>
                        </div>
                        <div className="vates-stat-mini-grid">
                            <div><span>Завершили</span><strong>{completedCount}</strong></div>
                            <div><span>Результатов тестов</span><strong>{testResults.length}</strong></div>
                            <div><span>Средний результат</span><strong>{averageTestScore}%</strong></div>
                        </div>
                    </div>

                    <div className="vates-distribution" aria-label="Распределение сотрудников">
                        {distribution.map(item => (
                            <button type="button" key={item.label} onClick={onOpenEmployees}>
                                <span><i style={{ background: item.color }} />{item.label}</span>
                                <strong>{item.value}</strong>
                                <b><i style={{ width: `${(item.value / maxDistributionValue) * 100}%`, background: item.color }} /></b>
                            </button>
                        ))}
                    </div>
                </article>
            </div>
        </section>
    );
}
