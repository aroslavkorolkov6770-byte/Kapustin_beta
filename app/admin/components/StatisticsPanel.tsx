"use client";
import React from 'react';
import { getVisibleWorkspaceUsers } from '@/app/lib/userVisibility';
import { flexSpace, sectionTitle, adminCard, profileBtnStyle, barStyle } from './adminStyles';

export default function StatisticsPanel({
    users, usersStats, totalRouteSteps, totalBasicsModules, userAvatars, setSelectedProfileUser
}: any) {
    const staffUsers = getVisibleWorkspaceUsers(Array.isArray(users) ? users : [])
        .filter((u: any) => u.role === 'staff' && !u.hideFromStats && !u.profileDisabled);

    return (
        <section style={{...adminCard, padding: '35px'} as any}>
            <div style={flexSpace as any}>
                <h2 style={sectionTitle as any}>Статистика обучения</h2>
                <span style={{ fontSize: '13px', color: '#666', fontWeight: 'bold' }}>Сотрудников в базе: {staffUsers.length}</span>
            </div>
            
            {staffUsers.length === 0 && (
                <div style={{ color: '#555', textAlign: 'center', padding: '30px', fontWeight: 'bold' }}>Нет добавленных сотрудников</div>
            )}

            {staffUsers.map((user: any) => {
                const routeLen = usersStats[user.id]?.route || 0;
                const testsLen = usersStats[user.id]?.basics || 0;
                const theoryPercent = Math.round((routeLen / (totalRouteSteps || 1)) * 100);
                const testsPercent = Math.round((testsLen / (totalBasicsModules || 1)) * 100);
                const avatarImg = userAvatars[user.id] || user.avatar;

                return (
                    <div
                        key={user.id}
                        className="admin-user-card"
                        style={{ background: '#0d0d0d', borderRadius: '25px', padding: '25px', border: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '15px' }}
                    >
                        <div
                            className="admin-user-avatar-col"
                            style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: '0 0 250px', minWidth: 0 }}
                        >
                            <div style={{ width: '55px', height: '55px', borderRadius: '18px', background: '#222', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {avatarImg ? <img src={avatarImg} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#0abab5', fontSize: '16px', fontWeight: '900', letterSpacing: '1px' }}>TH</span>}
                            </div>
                            <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                <h3 style={{ fontSize: '17px', fontWeight: '900', color: '#fff', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.name}</h3>
                                <div style={{ fontSize: '12px', color: '#0abab5', fontWeight: 'bold', marginTop: '3px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>@{user.login}</div>
                                <div onClick={() => setSelectedProfileUser(user)} style={profileBtnStyle as any}>ПРОФИЛЬ ↗</div>
                            </div>
                        </div>

                        <div
                            className="admin-user-bars-col"
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', borderLeft: '1px solid #222', paddingLeft: '30px', minWidth: 0 }}
                        >
                            <div className="admin-user-progress-row" style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 }}>
                                <div className="admin-user-progress-label" style={{ width: '52px', flexShrink: 0, fontSize: '11px', fontWeight: '900', color: '#555' }}>ТЕОРИЯ</div>
                                <div style={{ flex: 1, height: '8px', background: '#000', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ width: `${theoryPercent}%`, height: '100%', background: '#0abab5', borderRadius: '10px', transition: '1.5s ease' }} />
                                </div>
                                <div className="admin-user-progress-value" style={{ width: '45px', flexShrink: 0, fontSize: '13px', fontWeight: '900', color: '#0abab5', textAlign: 'right' }}>{theoryPercent}%</div>
                            </div>
                            <div className="admin-user-progress-row" style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 }}>
                                <div className="admin-user-progress-label" style={{ width: '52px', flexShrink: 0, fontSize: '11px', fontWeight: '900', color: '#555' }}>ТЕСТЫ</div>
                                <div style={{ flex: 1, height: '8px', background: '#000', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ width: `${testsPercent}%`, height: '100%', background: '#0abab5', borderRadius: '10px', transition: '1.5s ease' }} />
                                </div>
                                <div className="admin-user-progress-value" style={{ width: '45px', flexShrink: 0, fontSize: '13px', fontWeight: '900', color: '#0abab5', textAlign: 'right' }}>{testsPercent}%</div>
                            </div>
                        </div>

                        <div
                            className="admin-user-actions-col"
                            style={{ display: 'flex', gap: '12px', height: '50px', alignItems: 'flex-end', borderLeft: '1px solid #222', paddingLeft: '30px', flexShrink: 0 }}
                        >
                            <div style={barStyle(theoryPercent) as any} />
                            <div style={barStyle(testsPercent) as any} />
                        </div>
                    </div>
                )
            })}
            <style jsx>{`
                @media (max-width: 900px) {
                    .admin-user-card {
                        flex-direction: column !important;
                        align-items: stretch !important;
                        gap: 18px !important;
                    }
                    .admin-user-avatar-col {
                        flex: 1 1 auto !important;
                        width: 100% !important;
                    }
                    .admin-user-bars-col {
                        border-left: none !important;
                        border-top: 1px solid #222 !important;
                        padding-left: 0 !important;
                        padding-top: 18px !important;
                    }
                    .admin-user-actions-col {
                        border-left: none !important;
                        border-top: 1px solid #222 !important;
                        padding-left: 0 !important;
                        padding-top: 16px !important;
                        height: auto !important;
                        justify-content: flex-start !important;
                    }
                }
                @media (max-width: 560px) {
                    .admin-user-progress-row {
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                    }
                    .admin-user-progress-label {
                        width: auto !important;
                    }
                    .admin-user-progress-value {
                        width: auto !important;
                        margin-left: auto !important;
                    }
                }
            `}</style>
        </section>
    );
}
