"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomIcon from '@/app/components/CustomIcon';
import { fetchStorageBatch } from '@/app/lib/storageClient';
import { getVisibleWorkspaceUsers } from '@/app/lib/userVisibility';

type LearningItem = {
    id: string;
    title?: string;
    section?: string;
    isPlaceholder?: boolean;
    linkedMaterials?: Array<{ id?: string; type?: string; title?: string }>;
};

type LearningPath = {
    id: string;
    title: string;
    description: string;
    version: string;
    routes: LearningItem[];
    tests: LearningItem[];
    sourcesCount: number;
    status: 'published' | 'draft';
};

type PathDefinition = {
    id: string;
    isCustom: boolean;
    title: string;
    description: string;
    version: string;
    status: 'published' | 'draft';
    routeIds: string[];
    testIds: string[];
};

type PathEditorState = PathDefinition;

type StoredAssignment = {
    id: string;
    pathId: string;
    employeeId: string;
    assignedAt: string;
};

type PublicUser = {
    id: string;
    name?: string;
    login?: string;
    role?: 'admin' | 'staff';
    systemAccount?: boolean;
    ghostAccount?: boolean;
    canSwitchMode?: boolean;
};

const ASSIGNMENTS_SESSION_KEY = 'vates_learning_path_assignments_v1';
const PATH_DEFINITIONS_SESSION_KEY = 'vates_learning_path_definitions_v1';
const DEFAULT_SECTION_NAME = 'Основной раздел';

const normalizeSectionName = (value: unknown) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || DEFAULT_SECTION_NAME;
};

const getPathId = (sectionName: string) => `path_${encodeURIComponent(sectionName.toLocaleLowerCase('ru'))}`;

const getLinkedSourcesCount = (items: LearningItem[]) => {
    const sources = new Set<string>();

    items.forEach((item) => {
        item.linkedMaterials?.forEach((source) => {
            const sourceId = String(source.id || source.title || '').trim();
            if (sourceId) {
                sources.add(`${source.type || 'source'}:${sourceId}`);
            }
        });
    });

    return sources.size;
};

const getPluralForm = (value: number, one: string, few: string, many: string) => {
    const lastTwoDigits = Math.abs(value) % 100;
    const lastDigit = Math.abs(value) % 10;

    if (lastTwoDigits > 10 && lastTwoDigits < 20) {
        return many;
    }

    if (lastDigit === 1) {
        return one;
    }

    if (lastDigit > 1 && lastDigit < 5) {
        return few;
    }

    return many;
};

const getPathStepsLabel = (routesCount: number, testsCount: number) => {
    const routesLabel = `${routesCount} ${getPluralForm(routesCount, 'шаг', 'шага', 'шагов')}`;

    if (testsCount === 0) {
        return routesLabel;
    }

    return `${routesLabel} + ${testsCount} ${getPluralForm(testsCount, 'тест', 'теста', 'тестов')}`;
};

const readSessionAssignments = (): StoredAssignment[] => {
    try {
        const rawAssignments = window.sessionStorage.getItem(ASSIGNMENTS_SESSION_KEY);
        const parsedAssignments = rawAssignments ? JSON.parse(rawAssignments) : [];
        return Array.isArray(parsedAssignments) ? parsedAssignments : [];
    } catch (error) {
        console.error('Не удалось прочитать назначения учебных путей:', error);
        return [];
    }
};

const readSessionPathDefinitions = (): PathDefinition[] => {
    try {
        const rawDefinitions = window.sessionStorage.getItem(PATH_DEFINITIONS_SESSION_KEY);
        const parsedDefinitions = rawDefinitions ? JSON.parse(rawDefinitions) : [];
        return Array.isArray(parsedDefinitions) ? parsedDefinitions : [];
    } catch (error) {
        console.error('Не удалось прочитать настройки учебных путей:', error);
        return [];
    }
};

export default function LearningPaths({
    isAdmin,
    dynamicRoute,
    dynamicTests,
}: {
    isAdmin: boolean;
    dynamicRoute: LearningItem[];
    dynamicTests: LearningItem[];
}) {
    const router = useRouter();
    const [selectedPath, setSelectedPath] = useState<LearningPath | null>(null);
    const [assignmentPath, setAssignmentPath] = useState<LearningPath | null>(null);
    const [employees, setEmployees] = useState<PublicUser[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [assignments, setAssignments] = useState<StoredAssignment[]>([]);
    const [pathDefinitions, setPathDefinitions] = useState<PathDefinition[]>([]);
    const [pathEditor, setPathEditor] = useState<PathEditorState | null>(null);
    const [materialSearchQuery, setMaterialSearchQuery] = useState('');
    const [pathEditorError, setPathEditorError] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        setAssignments(readSessionAssignments());
        setPathDefinitions(readSessionPathDefinitions());
    }, []);

    useEffect(() => {
        if (!assignmentPath || !isAdmin) {
            return;
        }

        let isDisposed = false;

        const loadEmployees = async () => {
            try {
                const data = await fetchStorageBatch(['tea_hub_users_v1']);
                const storedUsers = Array.isArray(data.tea_hub_users_v1) ? data.tea_hub_users_v1 : [];
                const assignableUsers = getVisibleWorkspaceUsers(storedUsers as PublicUser[])
                    .filter((user: PublicUser) => user.role === 'staff');

                if (!isDisposed) {
                    setEmployees(assignableUsers);
                    setSelectedEmployeeId(assignableUsers[0]?.id || '');
                    setErrorMessage(assignableUsers.length === 0 ? 'Нет сотрудников, которым можно назначить путь.' : '');
                }
            } catch (error) {
                console.error('Не удалось загрузить сотрудников для назначения пути:', error);
                if (!isDisposed) {
                    setEmployees([]);
                    setSelectedEmployeeId('');
                    setErrorMessage('Не удалось загрузить список сотрудников. Повторите попытку позже.');
                }
            }
        };

        loadEmployees();

        return () => {
            isDisposed = true;
        };
    }, [assignmentPath, isAdmin]);

    const visibleRoutes = (Array.isArray(dynamicRoute) ? dynamicRoute : []).filter((item) => !item.isPlaceholder);
    const visibleTests = (Array.isArray(dynamicTests) ? dynamicTests : []).filter((item) => !item.isPlaceholder);
    const sectionNames = Array.from(new Set([
        ...visibleRoutes.map((item) => normalizeSectionName(item.section)),
        ...visibleTests.map((item) => normalizeSectionName(item.section)),
    ]));

    const generatedPaths: LearningPath[] = sectionNames.map((sectionName) => {
        const routes = visibleRoutes.filter((item) => normalizeSectionName(item.section) === sectionName);
        const tests = visibleTests.filter((item) => normalizeSectionName(item.section) === sectionName);
        const pathItems = [...routes, ...tests];

        return {
            id: getPathId(sectionName),
            title: sectionName,
            description: 'Учебная программа по материалам этого раздела.',
            version: '1.0',
            routes,
            tests,
            sourcesCount: getLinkedSourcesCount(pathItems),
            status: pathItems.length > 0 ? 'published' : 'draft',
        };
    });

    const applyPathDefinition = (definition: PathDefinition, fallbackPath?: LearningPath): LearningPath => {
        const routes = visibleRoutes.filter((item) => definition.routeIds.includes(item.id));
        const tests = visibleTests.filter((item) => definition.testIds.includes(item.id));
        const pathItems = [...routes, ...tests];

        return {
            id: definition.id,
            title: definition.title || fallbackPath?.title || 'Учебный путь без названия',
            description: definition.description || fallbackPath?.description || 'Учебная программа.',
            version: definition.version || fallbackPath?.version || '1.0',
            routes,
            tests,
            sourcesCount: getLinkedSourcesCount(pathItems),
            status: definition.status,
        };
    };

    const learningPaths = [
        ...generatedPaths.map((path) => {
            const definition = pathDefinitions.find((item) => item.id === path.id && !item.isCustom);
            return definition ? applyPathDefinition(definition, path) : path;
        }),
        ...pathDefinitions
            .filter((definition) => definition.isCustom)
            .map((definition) => applyPathDefinition(definition)),
    ];

    const getAssignmentCount = (pathId: string) => assignments.filter((assignment) => assignment.pathId === pathId).length;

    const closeAssignmentDialog = () => {
        setAssignmentPath(null);
        setSelectedEmployeeId('');
        setEmployees([]);
        setErrorMessage('');
    };

    const closePathEditor = () => {
        setPathEditor(null);
        setMaterialSearchQuery('');
        setPathEditorError('');
    };

    const openPathEditor = (path?: LearningPath) => {
        setPathEditor({
            id: path?.id || `path_custom_${Date.now()}`,
            isCustom: !path,
            title: path?.title || '',
            description: path?.description || '',
            version: path?.version || '1.0',
            status: path?.status || 'draft',
            routeIds: path?.routes.map((item) => item.id) || [],
            testIds: path?.tests.map((item) => item.id) || [],
        });
        setMaterialSearchQuery('');
        setPathEditorError('');
    };

    const togglePathItem = (type: 'route' | 'test', itemId: string) => {
        setPathEditor((currentEditor) => {
            if (!currentEditor) {
                return currentEditor;
            }

            if (type === 'route') {
                const routeIds = currentEditor.routeIds.includes(itemId)
                    ? currentEditor.routeIds.filter((id) => id !== itemId)
                    : [...currentEditor.routeIds, itemId];
                return { ...currentEditor, routeIds };
            }

            const testIds = currentEditor.testIds.includes(itemId)
                ? currentEditor.testIds.filter((id) => id !== itemId)
                : [...currentEditor.testIds, itemId];
            return { ...currentEditor, testIds };
        });
    };

    const handleSavePath = () => {
        if (!pathEditor) {
            return;
        }

        const title = pathEditor.title.trim();
        const description = pathEditor.description.trim();
        const version = pathEditor.version.trim();

        if (!title) {
            setPathEditorError('Укажите название учебного пути.');
            return;
        }

        if (!version) {
            setPathEditorError('Укажите версию пути.');
            return;
        }

        if (pathEditor.routeIds.length + pathEditor.testIds.length === 0) {
            setPathEditorError('Добавьте в путь хотя бы одну тему или тест.');
            return;
        }

        const nextDefinition: PathDefinition = {
            ...pathEditor,
            title,
            description: description || 'Учебная программа.',
            version,
        };
        const nextDefinitions = [
            ...pathDefinitions.filter((definition) => definition.id !== nextDefinition.id),
            nextDefinition,
        ];

        try {
            window.sessionStorage.setItem(PATH_DEFINITIONS_SESSION_KEY, JSON.stringify(nextDefinitions));
            setPathDefinitions(nextDefinitions);
            setSuccessMessage(pathEditor.isCustom ? `Учебный путь «${title}» создан.` : `Учебный путь «${title}» обновлён.`);
            closePathEditor();
        } catch (error) {
            console.error('Не удалось сохранить настройку учебного пути в текущем сеансе:', error);
            setPathEditorError('Не удалось сохранить путь в текущем сеансе браузера.');
        }
    };

    const handleAssignPath = () => {
        if (!assignmentPath || !selectedEmployeeId) {
            setErrorMessage('Выберите сотрудника для назначения.');
            return;
        }

        const nextAssignments = [
            ...assignments.filter((assignment) => !(assignment.pathId === assignmentPath.id && assignment.employeeId === selectedEmployeeId)),
            {
                id: `assignment_${Date.now()}`,
                pathId: assignmentPath.id,
                employeeId: selectedEmployeeId,
                assignedAt: new Date().toISOString(),
            },
        ];

        try {
            window.sessionStorage.setItem(ASSIGNMENTS_SESSION_KEY, JSON.stringify(nextAssignments));
            setAssignments(nextAssignments);
            const employee = employees.find((item) => item.id === selectedEmployeeId);
            setSuccessMessage(`Путь «${assignmentPath.title}» назначен сотруднику ${employee?.name || 'сотруднику'}.`);
            closeAssignmentDialog();
        } catch (error) {
            console.error('Не удалось сохранить назначение учебного пути в текущем сеансе:', error);
            setErrorMessage('Не удалось сохранить назначение в текущем сеансе браузера.');
        }
    };

    const openLearningItem = (item: LearningItem, type: 'route' | 'test') => {
        router.push(`/tasks?tab=edu&${type === 'route' ? 'routeId' : 'testId'}=${encodeURIComponent(item.id)}`);
    };

    const normalizedMaterialSearch = materialSearchQuery.trim().toLocaleLowerCase('ru');
    const matchesMaterialSearch = (item: LearningItem) => {
        if (!normalizedMaterialSearch) {
            return true;
        }

        return [item.title, normalizeSectionName(item.section)]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('ru')
            .includes(normalizedMaterialSearch);
    };
    const filteredRoutes = visibleRoutes.filter(matchesMaterialSearch);
    const filteredTests = visibleTests.filter(matchesMaterialSearch);

    return (
        <section className="vates-learning-paths-screen">
            <header className="vates-page-heading vates-learning-paths-heading">
                <div>
                    <span className="vates-eyebrow">Программы обучения</span>
                    <h1>Учебные пути</h1>
                    <p>Подготовленные программы обучения и назначение опубликованных версий.</p>
                </div>
                <button type="button" className="vates-button primary" onClick={() => openPathEditor()} disabled={!isAdmin}>
                    <CustomIcon name="folder" size={18} color="currentColor" accent="none" />
                    Создать путь
                </button>
            </header>

            <section className="vates-info-banner vates-learning-paths-notice">
                <CustomIcon name="idea" size={24} color="currentColor" accent="none" />
                <div>
                    <strong>Публикация учебного пути</strong>
                    <span>Перед назначением сотрудникам проверьте структуру, обязательные шаги и связанные материалы.</span>
                </div>
            </section>

            {successMessage && (
                <div className="vates-learning-paths-success" role="status">
                    <CustomIcon name="success" size={20} color="currentColor" accent="none" />
                    <span>{successMessage}</span>
                    <button type="button" onClick={() => setSuccessMessage('')} aria-label="Скрыть сообщение">
                        <CustomIcon name="close" size={18} color="currentColor" accent="none" />
                    </button>
                </div>
            )}

            <div className="vates-learning-paths-list">
                {learningPaths.length === 0 ? (
                    <div className="vates-empty-state">
                        В материалах пока нет тем или тестов. Создайте их в разделе «Материалы», чтобы сформировать учебный путь.
                    </div>
                ) : learningPaths.map((path) => {
                    const stepsCount = path.routes.length + path.tests.length;
                    const assignmentCount = getAssignmentCount(path.id);
                    const isPublished = path.status === 'published';

                    return (
                        <article className="vates-learning-path-card" key={path.id}>
                            <div className="vates-learning-path-card-main">
                                <div className="vates-learning-path-card-title">
                                    <span className="vates-learning-path-icon"><CustomIcon name="book" size={22} color="currentColor" accent="none" /></span>
                                    <div>
                                        <h2>{path.title}</h2>
                                        <p>Версия {path.version} · {path.description}</p>
                                    </div>
                                </div>
                                <span className={`vates-status-pill ${isPublished ? 'is-complete' : 'is-idle'}`}>
                                    {isPublished ? 'Проверен' : 'На подготовке'}
                                </span>
                            </div>

                            <div className="vates-learning-path-metrics">
                                <span>{getPathStepsLabel(path.routes.length, path.tests.length)}</span>
                                <span>{path.sourcesCount} {getPluralForm(path.sourcesCount, 'источник', 'источника', 'источников')}</span>
                                <span>{assignmentCount} {getPluralForm(assignmentCount, 'назначение', 'назначения', 'назначений')}</span>
                            </div>

                            <div className="vates-learning-path-actions">
                                <button type="button" className="vates-button secondary" onClick={() => setSelectedPath(path)}>
                                    <CustomIcon name="eye" size={17} color="currentColor" accent="none" />
                                    Открыть
                                </button>
                                {isAdmin && (
                                    <>
                                        <button type="button" className="vates-button secondary vates-learning-path-edit-button" onClick={() => openPathEditor(path)} aria-label={`Редактировать путь «${path.title}»`} title="Редактировать путь">
                                            <CustomIcon name="edit" size={17} color="currentColor" accent="none" />
                                            Редактировать
                                        </button>
                                        <button type="button" className="vates-button primary" disabled={!isPublished} onClick={() => setAssignmentPath(path)}>
                                            <CustomIcon name="user" size={17} color="currentColor" accent="none" />
                                            Назначить
                                        </button>
                                    </>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>

            {selectedPath && (
                <div className="vates-learning-paths-overlay" role="presentation" onMouseDown={() => setSelectedPath(null)}>
                    <section className="vates-learning-paths-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-path-details-title" onMouseDown={(event) => event.stopPropagation()}>
                        <header>
                            <div>
                                <span className="vates-eyebrow">Структура пути</span>
                                <h2 id="learning-path-details-title">{selectedPath.title}</h2>
                                <p>{selectedPath.routes.length + selectedPath.tests.length} шагов в актуальной версии программы.</p>
                            </div>
                            <button type="button" className="vates-icon-button" onClick={() => setSelectedPath(null)} aria-label="Закрыть структуру пути">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <div className="vates-learning-path-steps">
                            {selectedPath.routes.map((item, index) => (
                                <button type="button" className="vates-learning-path-step" key={item.id} onClick={() => openLearningItem(item, 'route')}>
                                    <span>{index + 1}</span>
                                    <div><strong>{item.title || 'Тема без названия'}</strong><small>Тема</small></div>
                                    <CustomIcon name="eye" size={18} color="currentColor" accent="none" />
                                </button>
                            ))}
                            {selectedPath.tests.map((item, index) => (
                                <button type="button" className="vates-learning-path-step is-test" key={item.id} onClick={() => openLearningItem(item, 'test')}>
                                    <span>{selectedPath.routes.length + index + 1}</span>
                                    <div><strong>{item.title || 'Тест без названия'}</strong><small>Тест</small></div>
                                    <CustomIcon name="cap" size={18} color="currentColor" accent="none" />
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {assignmentPath && (
                <div className="vates-learning-paths-overlay" role="presentation" onMouseDown={closeAssignmentDialog}>
                    <section className="vates-learning-paths-dialog vates-learning-paths-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-path-assignment-title" onMouseDown={(event) => event.stopPropagation()}>
                        <header>
                            <div>
                                <span className="vates-eyebrow">Назначение</span>
                                <h2 id="learning-path-assignment-title">Назначить учебный путь</h2>
                                <p>Выберите сотрудника и опубликованный путь. Предыдущие результаты обучения сохраняются.</p>
                            </div>
                            <button type="button" className="vates-icon-button" onClick={closeAssignmentDialog} aria-label="Закрыть назначение">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <label className="vates-learning-path-field">
                            <span>Сотрудник</span>
                            <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} disabled={employees.length === 0}>
                                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.login || 'Сотрудник'}</option>)}
                            </select>
                        </label>
                        <label className="vates-learning-path-field">
                            <span>Опубликованный путь</span>
                            <strong>{assignmentPath.title} · v{assignmentPath.version}</strong>
                        </label>
                        <section className="vates-info-banner vates-learning-paths-confirmation">
                            <CustomIcon name="alert" size={22} color="currentColor" accent="none" />
                            <div><strong>Подтверждение назначения</strong><span>Назначение действует в текущем сеансе браузера и не изменяет файлы данных.</span></div>
                        </section>
                        {errorMessage && <p className="vates-learning-path-error" role="alert">{errorMessage}</p>}
                        <footer>
                            <button type="button" className="vates-button secondary" onClick={closeAssignmentDialog}>Отмена</button>
                            <button type="button" className="vates-button primary" onClick={handleAssignPath} disabled={!selectedEmployeeId}>Назначить</button>
                        </footer>
                    </section>
                </div>
            )}

            {pathEditor && (
                <div className="vates-learning-paths-overlay" role="presentation" onMouseDown={closePathEditor}>
                    <section className="vates-learning-paths-dialog vates-learning-paths-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-path-editor-title" onMouseDown={(event) => event.stopPropagation()}>
                        <header>
                            <div>
                                <span className="vates-eyebrow">{pathEditor.isCustom ? 'Новый путь' : 'Настройка пути'}</span>
                                <h2 id="learning-path-editor-title">{pathEditor.isCustom ? 'Создать учебный путь' : 'Редактировать учебный путь'}</h2>
                                <p>Выберите темы и тесты, которые будут входить в эту программу.</p>
                            </div>
                            <button type="button" className="vates-icon-button" onClick={closePathEditor} aria-label="Закрыть редактор пути">
                                <CustomIcon name="close" size={20} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <div className="vates-learning-path-editor-fields">
                            <label className="vates-learning-path-field">
                                <span>Название пути</span>
                                <input value={pathEditor.title} onChange={(event) => setPathEditor({ ...pathEditor, title: event.target.value })} placeholder="Например: Старт в точке" />
                            </label>
                            <label className="vates-learning-path-field">
                                <span>Версия</span>
                                <input value={pathEditor.version} onChange={(event) => setPathEditor({ ...pathEditor, version: event.target.value })} placeholder="Например: 1.0" />
                            </label>
                            <label className="vates-learning-path-field vates-learning-path-field-wide">
                                <span>Описание</span>
                                <input value={pathEditor.description} onChange={(event) => setPathEditor({ ...pathEditor, description: event.target.value })} placeholder="Кратко опишите назначение программы" />
                            </label>
                            <label className="vates-learning-path-field vates-learning-path-field-wide">
                                <span>Статус</span>
                                <select value={pathEditor.status} onChange={(event) => setPathEditor({ ...pathEditor, status: event.target.value === 'published' ? 'published' : 'draft' })}>
                                    <option value="draft">На подготовке</option>
                                    <option value="published">Проверен и готов к назначению</option>
                                </select>
                            </label>
                        </div>

                        <section className="vates-learning-path-editor-selection">
                            <div className="vates-learning-path-editor-selection-heading">
                                <div><span className="vates-eyebrow">Состав пути</span><h3>Темы и тесты</h3></div>
                                <span>{pathEditor.routeIds.length + pathEditor.testIds.length} выбрано</span>
                            </div>
                            <label className="vates-learning-path-material-search">
                                <span>Поиск материалов</span>
                                <input
                                    type="search"
                                    value={materialSearchQuery}
                                    onChange={(event) => setMaterialSearchQuery(event.target.value)}
                                    placeholder="Найти тему или тест"
                                    aria-label="Поиск тем и тестов"
                                />
                            </label>
                            <div className="vates-learning-path-editor-group">
                                <strong>Темы <span>{filteredRoutes.length}</span></strong>
                                {visibleRoutes.length === 0 ? <p>Тем пока нет.</p> : filteredRoutes.length === 0 ? <p>По этому запросу тем не найдено.</p> : filteredRoutes.map((item) => {
                                    const isSelected = pathEditor.routeIds.includes(item.id);

                                    return (
                                    <label className={`vates-learning-path-check ${isSelected ? 'is-selected' : ''}`} key={item.id}>
                                        <input type="checkbox" checked={pathEditor.routeIds.includes(item.id)} onChange={() => togglePathItem('route', item.id)} />
                                        <span className="vates-learning-path-check-icon"><CustomIcon name="book" size={20} color="currentColor" accent="none" /></span>
                                        <span className="vates-learning-path-check-copy"><b>{item.title || 'Тема без названия'}</b><small>{normalizeSectionName(item.section)}</small></span>
                                        <span className="vates-learning-path-check-state"><CustomIcon name="check" size={17} color="currentColor" accent="none" /></span>
                                    </label>
                                    );
                                })}
                            </div>
                            <div className="vates-learning-path-editor-group">
                                <strong>Тесты <span>{filteredTests.length}</span></strong>
                                {visibleTests.length === 0 ? <p>Тестов пока нет.</p> : filteredTests.length === 0 ? <p>По этому запросу тестов не найдено.</p> : filteredTests.map((item) => {
                                    const isSelected = pathEditor.testIds.includes(item.id);

                                    return (
                                    <label className={`vates-learning-path-check is-test ${isSelected ? 'is-selected' : ''}`} key={item.id}>
                                        <input type="checkbox" checked={pathEditor.testIds.includes(item.id)} onChange={() => togglePathItem('test', item.id)} />
                                        <span className="vates-learning-path-check-icon"><CustomIcon name="cap" size={20} color="currentColor" accent="none" /></span>
                                        <span className="vates-learning-path-check-copy"><b>{item.title || 'Тест без названия'}</b><small>{normalizeSectionName(item.section)}</small></span>
                                        <span className="vates-learning-path-check-state"><CustomIcon name="check" size={17} color="currentColor" accent="none" /></span>
                                    </label>
                                    );
                                })}
                            </div>
                        </section>
                        {pathEditorError && <p className="vates-learning-path-error" role="alert">{pathEditorError}</p>}
                        <footer>
                            <button type="button" className="vates-button secondary" onClick={closePathEditor}>Отмена</button>
                            <button type="button" className="vates-button primary" onClick={handleSavePath}>{pathEditor.isCustom ? 'Создать путь' : 'Сохранить изменения'}</button>
                        </footer>
                    </section>
                </div>
            )}
        </section>
    );
}
