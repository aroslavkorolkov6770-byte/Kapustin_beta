"use client";

import React, { useState } from 'react';
import CustomIcon from '@/app/components/CustomIcon';
import { getVisibleWorkspaceUsers } from '@/app/lib/userVisibility';
import { adminIn, modalOverlay, modalContentSmall } from './adminStyles';

export default function InteractionCenter({
    users, interactionTab, setInteractionTab, selectedStaff, setSelectedStaff,
    notifText, setNotifText, testType, setTestType, handleSendNotification,
    handleOpenTestEditor, handleQuickSendTest, isProcessing,
    testTypesList, handleUpdateTestTypes
}: any) {
    const [isManagingTypes, setIsManagingTypes] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');
    const staffUsers = getVisibleWorkspaceUsers(Array.isArray(users) ? users : [])
        .filter((user: any) => user.role === 'staff');
    const recipientHint = selectedStaff === 'Все'
        ? `Сообщение получат ${staffUsers.length} ${staffUsers.length === 1 ? 'сотрудник' : 'сотрудника'}`
        : 'Сообщение получит выбранный сотрудник';

    return (
        <section className="vates-communication-card" aria-labelledby="vates-communication-title">
            <header className="vates-communication-header">
                <div>
                    <span className="vates-eyebrow">Связь с командой</span>
                    <h3 id="vates-communication-title">Центр коммуникаций</h3>
                    <p>Выберите формат, получателя и подготовьте сообщение для команды.</p>
                </div>
            </header>

            <div className="interaction-center-tabs vates-communication-tabs" role="tablist" aria-label="Формат сообщения">
                <button
                    type="button"
                    role="tab"
                    aria-selected={interactionTab === 'notif'}
                    className={interactionTab === 'notif' ? 'active' : ''}
                    onClick={() => setInteractionTab('notif')}
                >
                    <CustomIcon name="chat" size={18} color="currentColor" accent="none" />
                    Уведомление
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={interactionTab === 'test'}
                    className={interactionTab === 'test' ? 'active' : ''}
                    onClick={() => setInteractionTab('test')}
                >
                    <CustomIcon name="cap" size={18} color="currentColor" accent="none" />
                    Аттестация
                </button>
            </div>

            <div className="vates-communication-form">
                <label className="vates-communication-field">
                    <span>Получатель</span>
                    <small>Можно отправить всей команде или одному сотруднику.</small>
                    <select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)}>
                        <option value="Все">Всем сотрудникам</option>
                        {staffUsers.map((user: any) => (
                            <option key={user.id} value={user.id}>{user.name} ({user.login})</option>
                        ))}
                    </select>
                </label>

                {interactionTab === 'notif' ? (
                    <div className="vates-notification-composer" role="tabpanel">
                        <label className="vates-communication-field">
                            <span>Текст уведомления</span>
                            <small>Коротко опишите, что сотруднику нужно сделать.</small>
                            <input
                                type="text"
                                placeholder="Например: проверьте новый материал до пятницы"
                                value={notifText}
                                onChange={(event) => setNotifText(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && handleSendNotification()}
                                disabled={isProcessing}
                            />
                        </label>

                        <div className="vates-composer-footer">
                            <span>{recipientHint}</span>
                            <button
                                type="button"
                                className="vates-button primary vates-send-button"
                                onClick={handleSendNotification}
                                disabled={isProcessing || !notifText.trim()}
                            >
                                <CustomIcon name="chat" size={18} color="currentColor" accent="none" />
                                {isProcessing ? 'Отправка...' : 'Отправить уведомление'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="vates-attestation-composer" role="tabpanel">
                        <label className="vates-communication-field">
                            <span>Шаблон аттестации</span>
                            <small>Выберите готовый тест или откройте редактор перед назначением.</small>
                            <select value={testType} onChange={(event) => setTestType(event.target.value)}>
                                {testTypesList.map((type: any) => <option key={type.id} value={type.name}>{type.name}</option>)}
                            </select>
                        </label>

                        <div className="vates-attestation-tools">
                            <button type="button" className="vates-button secondary" onClick={() => setIsManagingTypes(true)}>
                                <CustomIcon name="file" size={17} color="currentColor" accent="none" />
                                Список тестов
                            </button>
                            <button type="button" className="vates-button secondary" onClick={handleOpenTestEditor} disabled={isProcessing}>
                                <CustomIcon name="edit" size={17} color="currentColor" accent="none" />
                                Открыть редактор
                            </button>
                            <button type="button" className="vates-button primary" onClick={handleQuickSendTest} disabled={isProcessing}>
                                <CustomIcon name="cap" size={17} color="currentColor" accent="none" />
                                {isProcessing ? 'Отправка...' : 'Назначить аттестацию'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {isManagingTypes && (
                <div style={modalOverlay as any} onClick={() => setIsManagingTypes(false)}>
                    <div className="admin-modal-content custom-scroll" style={{ ...modalContentSmall, position: 'relative', maxWidth: '500px' } as any} onClick={event => event.stopPropagation()}>
                        <button
                            type="button"
                            className="vates-icon-button vates-test-types-close"
                            onClick={() => setIsManagingTypes(false)}
                            aria-label="Закрыть список тестов"
                            title="Закрыть"
                        >
                            <CustomIcon name="close" size={18} color="currentColor" accent="none" />
                        </button>

                        <h2 style={{ color: '#0abab5', fontWeight: '900', marginBottom: '25px', textAlign: 'center', textTransform: 'uppercase', fontSize: '18px' }}>
                            Управление списком тестов
                        </h2>

                        <div className="vates-test-types-create">
                            <input
                                style={{ ...adminIn, marginBottom: 0, padding: '14px', fontSize: '14px' } as any}
                                placeholder="Название, например: Вводный тест"
                                value={newTypeName}
                                onChange={event => setNewTypeName(event.target.value)}
                                autoFocus
                            />
                            <button
                                type="button"
                                className="vates-button primary"
                                onClick={() => {
                                    if (newTypeName.trim()) {
                                        handleUpdateTestTypes([...testTypesList, { id: 'type_' + Date.now(), name: newTypeName.trim() }]);
                                        setNewTypeName('');
                                    }
                                }}
                            >
                                Добавить
                            </button>
                        </div>

                        <div className="vates-test-types-caption">Существующие шаблоны: {testTypesList.length}</div>

                        <div className="vates-test-types-list custom-scroll">
                            {testTypesList.map((type: any) => (
                                <div key={type.id} className="vates-test-type-item">
                                    <span>{type.name}</span>
                                    {testTypesList.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextTypes = testTypesList.filter((item: any) => item.id !== type.id);
                                                handleUpdateTestTypes(nextTypes);
                                                if (testType === type.name) setTestType(nextTypes[0].name);
                                            }}
                                        >
                                            <CustomIcon name="close" size={14} color="currentColor" accent="none" />
                                            Удалить
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
