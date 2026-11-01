"use client";
import { createInAppNotification } from '@/app/lib/inAppNotifications';
import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import CustomIcon from '@/app/components/CustomIcon';
import SectionCollapseButton from '@/app/components/SectionCollapseButton';
import useCollapsedSections from '@/app/hooks/useCollapsedSections';
import {
    dataUrlToBlobUrl,
    decodeTextDataUrl,
    getDocumentPreviewKind,
    type DocumentPreviewKind,
} from '@/app/lib/documentPreview';
import { fetchStorageBatch, saveDataToServer } from '@/app/lib/storageClient';

// --- КЛЮЧИ ПАМЯТИ ---
const STORAGE_KEYS = {
    URGENT_FILES: 'tea_hub_urgent_files_v1'        
};
const AI_SITE_CONTEXT_CACHE_KEY = 'th_ai_site_context_v2';
const base64ToBlobUrl = dataUrlToBlobUrl;
const getPreviewKind = getDocumentPreviewKind;
const escapePreviewHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

type LinkedDocumentPreview = {
    file: any;
    objectUrl: string;
    text: string;
    kind: DocumentPreviewKind;
    loading: boolean;
    error: string;
};

type AiDocumentRequest = {
    id?: unknown;
    name?: unknown;
    section?: unknown;
};

export default function Documents({ isAdmin, userId, urgentFiles, setUrgentFiles, linkedDocumentId, onCloseLinkedDocument }: any) {
    const { isSectionCollapsed, toggleSection } = useCollapsedSections('tea_hub_document_collapsed_sections_v1');
    // --- СОСТОЯНИЯ ДЛЯ УПРАВЛЕНИЯ ПАПКАМИ ---
    const [promptSection, setPromptSection] = useState<{isOpen: boolean, name: string}>({ isOpen: false, name: '' });
    const [renameSectionPrompt, setRenameSectionPrompt] = useState<{isOpen: boolean, oldName: string, newName: string}>({ isOpen: false, oldName: '', newName: '' });
    const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, type: 'section'|'file', targetId: string, name: string}>({ isOpen: false, type: 'file', targetId: '', name: '' });
    
    // --- СОСТОЯНИЯ ДЛЯ ПЕРЕМЕЩЕНИЯ ФАЙЛОВ ---
    const [movingItem, setMovingItem] = useState<string | null>(null);
    const [copyingItem, setCopyingItem] = useState<string | null>(null);

    // --- СОСТОЯНИЯ ДЛЯ ЗАГРУЗКИ ---
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadSection, setUploadSection] = useState('Основной раздел');
    const [isCreatingNewUploadSection, setIsCreatingNewUploadSection] = useState(false);
    const [newUploadSectionName, setNewUploadSectionName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [documentSearchQuery, setDocumentSearchQuery] = useState('');
    const [documentSectionFilter, setDocumentSectionFilter] = useState('all');
    const deferredDocumentSearchQuery = useDeferredValue(documentSearchQuery);

    const [successModal, setSuccessModal] = useState({ show: false, title: '', text: '' });
    const [errorModal, setErrorModal] = useState({ show: false, text: '' });
    const [linkedPreview, setLinkedPreview] = useState<LinkedDocumentPreview | null>(null);
    const linkedPreviewIdRef = useRef<string | null>(null);
    const linkedPreviewObjectUrlRef = useRef<string>('');

    // Фильтруем ТОЛЬКО нормативные документы (исключаем дедлайны и тесты)
    const allDocs = (urgentFiles || []).filter((f: any) => {
        if (f.isDocPlaceholder) return true;
        if (f.id?.startsWith('deadline_') || f.isTest) return false;
        return true;
    });

    const existingDocSections = Array.from(new Set(
        allDocs.map((f: any) => f.section?.trim() || 'Основной раздел')
    ));

    const releaseLinkedPreviewObjectUrl = () => {
        if (linkedPreviewObjectUrlRef.current) {
            URL.revokeObjectURL(linkedPreviewObjectUrlRef.current);
            linkedPreviewObjectUrlRef.current = '';
        }
    };

    const closeLinkedPreview = () => {
        releaseLinkedPreviewObjectUrl();
        linkedPreviewIdRef.current = null;
        setLinkedPreview(null);
        if (typeof onCloseLinkedDocument === 'function') {
            onCloseLinkedDocument();
        }
    };

    useEffect(() => {
        if (!linkedPreview) {
            return;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const handlePreviewKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeLinkedPreview();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handlePreviewKeyDown);

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            window.removeEventListener('keydown', handlePreviewKeyDown);
        };
    }, [linkedPreview]);

    const loadFileData = async (file: any): Promise<string> => {
        if (typeof file.data === 'string' && file.data) {
            return file.data;
        }

        if (!file.hasSeparateData) {
            throw new Error('Данные документа не найдены на сервере');
        }

        const response = await fetch(`/api/storage?t=${Date.now()}&key=file_data_${file.id}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Сервер не вернул данные документа');
        }

        const fileData = await response.json();
        if (typeof fileData !== 'string' || !fileData) {
            throw new Error('Данные документа не найдены на сервере');
        }

        return fileData;
    };

    const loadExtractedText = async (file: any): Promise<string> => {
        const requestBody = file.hasSeparateData && !file.data
            ? { fileId: file.id, fileName: file.name }
            : { fileId: file.id, fileName: file.name, dataUrl: file.data };
        const response = await fetch('/api/document-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.text !== 'string') {
            throw new Error(payload.error || 'Не удалось прочитать документ');
        }
        return payload.text;
    };

    const prepareDocumentPreview = async (file: any): Promise<LinkedDocumentPreview> => {
        const detectedKind = getDocumentPreviewKind(file.name || '');
        if (detectedKind === 'office' || detectedKind === 'docx') {
            const extractedText = await loadExtractedText(file);
            return { file, objectUrl: '', text: extractedText, kind: 'office', loading: false, error: '' };
        }

        const fileData = await loadFileData(file);
        if (detectedKind === 'text' || detectedKind === 'unknown') {
            const decodedText = decodeTextDataUrl(fileData);
            if (decodedText !== null) {
                return { file, objectUrl: '', text: decodedText, kind: 'text', loading: false, error: '' };
            }
            if (detectedKind === 'text') {
                throw new Error('Файл имеет текстовое расширение, но содержит бинарные данные');
            }
        }

        const objectUrl = dataUrlToBlobUrl(fileData);
        return {
            file,
            objectUrl,
            text: '',
            kind: detectedKind === 'unknown' ? 'unsupported' : detectedKind,
            loading: false,
            error: '',
        };
    };

    const loadLinkedPreview = async (file: any, scrollToCard: boolean) => {
        releaseLinkedPreviewObjectUrl();
        setLinkedPreview({
            file,
            objectUrl: '',
            text: '',
            kind: getDocumentPreviewKind(file.name || ''),
            loading: true,
            error: '',
        });

        try {
            const preview = await prepareDocumentPreview(file);
            if (preview.objectUrl) {
                linkedPreviewObjectUrlRef.current = preview.objectUrl;
            }
            setLinkedPreview(preview);

            if (scrollToCard) {
                window.setTimeout(() => {
                    document.getElementById(`document-card-${file.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 150);
            }
        } catch (error) {
            console.error('Ошибка открытия связанного документа:', error);
            setLinkedPreview({
                file,
                objectUrl: '',
                text: '',
                kind: getDocumentPreviewKind(file.name || ''),
                loading: false,
                error: error instanceof Error ? error.message : 'Не удалось открыть документ',
            });
        }
    };

    useEffect(() => {
        if (!linkedDocumentId || linkedPreviewIdRef.current === linkedDocumentId) {
            return;
        }

        const targetDocument = allDocs.find((file: any) => file.id === linkedDocumentId && !file.isDocPlaceholder);
        if (!targetDocument) {
            return;
        }

        linkedPreviewIdRef.current = linkedDocumentId;
        const targetSection = targetDocument.section?.trim() || 'Основной раздел';
        if (isSectionCollapsed(targetSection)) {
            toggleSection(targetSection);
        }

        const previewTimer = window.setTimeout(() => {
            void loadLinkedPreview(targetDocument, true);
        }, 0);

        return () => window.clearTimeout(previewTimer);
    }, [linkedDocumentId, urgentFiles]);

    useEffect(() => {
        return () => {
            releaseLinkedPreviewObjectUrl();
        };
    }, []);

    const updateFilesState = async (newFiles: any[]) => {
        setUrgentFiles(newFiles);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(AI_SITE_CONTEXT_CACHE_KEY);
        }
        await saveDataToServer(STORAGE_KEYS.URGENT_FILES, newFiles);
    };

    const ensureDocPlaceholderForSection = (items: any[], sectionName: string) => {
        const normalizedSection = sectionName.trim() || 'Основной раздел';
        const hasDocument = items.some((file: any) => {
            const isDoc = file.isDocPlaceholder || !(file.id?.startsWith('deadline_') || file.isTest);
            return isDoc && (file.section?.trim() || 'Основной раздел') === normalizedSection;
        });

        if (hasDocument || normalizedSection === 'Основной раздел') {
            return items;
        }

        return [...items, { id: 'doc_placeholder_' + Date.now(), section: normalizedSection, isDocPlaceholder: true }];
    };

    // --- ФУНКЦИИ ОТПРАВКИ УВЕДОМЛЕНИЙ ---
    

    

    // --- ЛОГИКА ЗАГРУЗКИ ФАЙЛОВ ---
    const handleSaveFile = async () => {
        if (selectedFiles.length === 0 || isProcessing) return;
        setIsProcessing(true);
        
        let finalSection = uploadSection.trim();
        if (isCreatingNewUploadSection && newUploadSectionName.trim()) {
            finalSection = newUploadSectionName.trim();
        } else if (!finalSection || finalSection === '__NEW__') {
            finalSection = 'Основной раздел';
        }

        try {
            const fileNames = selectedFiles.map((file) => file.name);
            const newFilesData = [];

            for (let index = 0; index < selectedFiles.length; index += 1) {
                const file = selectedFiles[index];
                const fileData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result);
                    reader.readAsDataURL(file);
                });

                const fileId = 'file_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 5);
                await saveDataToServer(`file_data_${fileId}`, fileData);

                newFilesData.push({
                    id: fileId,
                    name: file.name,
                    size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                    date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                    section: finalSection,
                    hasSeparateData: true,
                });
            }

            const updatedFiles = [...newFilesData, ...(urgentFiles || [])];
            await updateFilesState(updatedFiles);
            
            const namesStr = fileNames.join(', ');
            setSuccessModal({ show: true, title: 'ДОКУМЕНТЫ ОТПРАВЛЕНЫ', text: `Файлы (${selectedFiles.length} шт.) загружены в раздел "${finalSection}".` });
            setSelectedFiles([]); setUploadSection('Основной раздел'); setIsCreatingNewUploadSection(false); setNewUploadSectionName('');

            try {
                await createInAppNotification({ target: 'Все', title: 'Новые документы', text: `Администратор добавил новые документы: ${namesStr}` });
            } catch (error) {
                console.error('Не удалось сохранить уведомление о документах:', error);
            }
        } catch(e) {
            setErrorModal({ show: true, text: "Произошла ошибка при пакетной загрузке файлов. Возможно, файлы слишком большие." });
        } finally { setIsProcessing(false); }
    };

    const handleDownloadFile = async (file: any) => {
        if (!file.data && !file.hasSeparateData) {
            alert("Этот файл был загружен в старой версии платформы и недоступен.");
            return;
        }
        
        try {
            let fileBase64 = file.data;
            if (!fileBase64 && file.hasSeparateData) {
                const res = await fetch(`/api/storage?t=${Date.now()}&key=file_data_${file.id}`);
                fileBase64 = await res.json();
            }

            if (!fileBase64) {
                alert("Файл не найден на сервере.");
                return;
            }

            const objectUrl = base64ToBlobUrl(fileBase64);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            alert("Ошибка при скачивании файла.");
        }
    };

    const handleAskAiAboutDocument = (file: AiDocumentRequest) => {
        const documentId = String(file.id || '').trim();
        if (!documentId) {
            setErrorModal({ show: true, text: 'Не удалось определить документ для AI-чата.' });
            return;
        }

        const documentSection = typeof file.section === 'string' && file.section.trim()
            ? file.section.trim()
            : 'Основной раздел';
        const params = new URLSearchParams({
            tab: 'standards',
            askDocumentId: documentId,
            askDocumentTitle: String(file.name || 'Документ'),
            askDocumentSection: documentSection,
            askDocumentRequest: String(Date.now()),
        });

        window.location.assign(`/tasks?${params.toString()}`);
    };

    const shouldUseInPagePreview = () => (
        typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
    );

    // Интеллектуальный предпросмотр
    const handleLegacyPreview = async (file: any) => {
        if (shouldUseInPagePreview()) {
            await loadLinkedPreview(file, false);
            return;
        }

        if (!file.data && !file.hasSeparateData) {
            alert("Этот файл был загружен в старой версии и недоступен для просмотра.");
            return;
        }

        const newWindow = window.open('', '_blank');
        if (!newWindow) {
            alert("Пожалуйста, разрешите всплывающие окна в браузере для предпросмотра документов.");
            return;
        }
        newWindow.opener = null;

        newWindow.document.write('<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#0abab5;font-weight:bold;font-size:20px;">Подготовка документа...</div>');

        try {
            let fileBase64 = file.data;
            if (!fileBase64 && file.hasSeparateData) {
                const res = await fetch(`/api/storage?t=${Date.now()}&key=file_data_${file.id}`);
                fileBase64 = await res.json();
            }

            if (!fileBase64) {
                newWindow.document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#ff4d4d;font-weight:bold;font-size:20px;">Данные файла не найден на сервере.</div>';
                return;
            }

            const objectUrl = base64ToBlobUrl(fileBase64);
            const previewKind = getPreviewKind(file.name || '');
            const isUnsupported = previewKind === 'unsupported';
            const safeFileName = escapePreviewHtml(file.name || 'Документ');
            const safeObjectUrl = escapePreviewHtml(objectUrl);
            const fileExt = escapePreviewHtml(file.name.split('.').pop()?.toUpperCase() || 'ФАЙЛ');

            newWindow.document.open();
            newWindow.document.write(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Предпросмотр: ${safeFileName}</title>
                    <style>
                        * { box-sizing: border-box; }
                        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
                        body { padding: 0; background: #0d0f0d; height: 100vh; height: 100dvh; display: flex; flex-direction: column; color: #fff; font-family: Arial, sans-serif; }
                        .preview-toolbar { position: relative; z-index: 20; min-height: 64px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: max(10px, env(safe-area-inset-top)) 14px 10px; border-bottom: 1px solid #29312e; background: #111513; box-shadow: 0 8px 24px rgba(0,0,0,.24); }
                        .preview-toolbar-copy { min-width: 0; display: grid; gap: 3px; }
                        .preview-toolbar-copy strong { overflow: hidden; color: #f4f7f6; font-size: 15px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
                        .preview-toolbar-copy span { color: #65c8c2; font-size: 11px; font-weight: 800; }
                        .preview-close { min-height: 42px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border: 1px solid rgba(101,200,194,.36); border-radius: 11px; background: #1b2421; color: #f4f7f6; font: 800 12px/1 Arial, sans-serif; cursor: pointer; }
                        .preview-close svg { width: 17px; height: 17px; }
                        .preview-content { min-width: 0; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; -webkit-overflow-scrolling: touch; }
                        iframe, object, embed { width: 100%; min-width: 0; min-height: 0; height: auto; border: none; flex: 1 1 auto; background: #fff; }
                        .unsupported { display: flex; flex: 1 1 auto; flex-direction: column; align-items: center; justify-content: center; min-height: 0; color: #fff; font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                        .btn { background: #0abab5; color: #000; padding: 15px 35px; border-radius: 14px; text-decoration: none; font-weight: 900; margin-top: 30px; font-size: 16px; transition: 0.2s; cursor: pointer; border: none; display: inline-block; }
                        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(10,186,181,0.3); }
                        @media (max-width: 700px) {
                            .preview-toolbar { min-height: 58px; }
                            .preview-toolbar-copy strong { font-size: 13px; }
                        }
                    </style>
                </head>
                <body>
                    <header class="preview-toolbar">
                        <div class="preview-toolbar-copy">
                            <strong>${safeFileName}</strong>
                            <span>Предпросмотр документа</span>
                        </div>
                        <button type="button" class="preview-close" onclick="window.close(); window.setTimeout(function () { if (!window.closed) { window.location.href = '/tasks?tab=docs'; } }, 100);" aria-label="Закрыть документ">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <span>Закрыть</span>
                        </button>
                    </header>
                    <main class="preview-content">
                    ${previewKind === 'text' ? `
                        <iframe src="${safeObjectUrl}" sandbox="" referrerpolicy="no-referrer" style="background:#fff;"></iframe>
                    ` : previewKind === 'image' ? `
                        <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:20px;box-sizing:border-box;background:#0d0f0d;">
                            <img src="${safeObjectUrl}" alt="${safeFileName}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,0.45);" />
                        </div>
                    ` : previewKind === 'video' ? `
                        <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:20px;box-sizing:border-box;background:#0d0f0d;">
                            <video controls style="width:100%;max-width:1100px;max-height:100%;border-radius:18px;background:#000;">
                                <source src="${safeObjectUrl}" />
                            </video>
                        </div>
                    ` : previewKind === 'audio' ? `
                        <div class="unsupported">
                            <h2 style="margin:0 0 15px 0;font-size:26px;">Аудиофайл ${fileExt}</h2>
                            <p style="color:#aaa; margin: 0 0 25px 0; max-width:500px; line-height:1.6; font-size:15px;">Аудио можно прослушать прямо здесь или скачать на устройство.</p>
                            <audio controls style="width:min(100%, 720px); margin-bottom:24px;">
                                <source src="${safeObjectUrl}" />
                            </audio>
                            <a href="${safeObjectUrl}" download="${safeFileName}" class="btn">СКАЧАТЬ ФАЙЛ</a>
                        </div>
                    ` : isUnsupported ? `
                        <div class="unsupported">
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 20px;">
                                <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="rgba(10,186,181,0.1)" stroke="#0abab5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M14 2V8H20" stroke="#0abab5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <h2 style="margin: 0 0 15px 0; font-size: 26px;">Формат ${fileExt} не поддерживается браузером</h2>
                            <p style="color: #aaa; margin: 0; max-width: 500px; line-height: 1.6; font-size: 15px;">
                                К сожалению, этот формат пока нельзя открыть прямо во вкладке.
                                <br/><br/>Но вы можете безопасно скачать этот файл на своё устройство и открыть его в соответствующей программе.
                            </p>
                            <a href="${safeObjectUrl}" download="${safeFileName}" class="btn">СКАЧАТЬ ФАЙЛ </a>
                        </div>
                    ` : `
                        <iframe src="${safeObjectUrl}" sandbox="" referrerpolicy="no-referrer"></iframe>
                    `}
                    </main>
                </body>
                </html>
            `);
            newWindow.document.close();
        } catch (e) {
            newWindow.document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#ff4d4d;font-weight:bold;font-size:20px;">Произошла ошибка при загрузке документа.</div>';
        }
    };

    const handleOpenPreview = async (file: any) => {
        if (shouldUseInPagePreview()) {
            await loadLinkedPreview(file, false);
            return;
        }

        const previewKind = getDocumentPreviewKind(file.name || '');
        if (!['docx', 'text', 'office', 'unknown'].includes(previewKind)) {
            await handleLegacyPreview(file);
            return;
        }

        if (!file.data && !file.hasSeparateData) {
            alert('Этот файл был загружен в старой версии и недоступен для просмотра.');
            return;
        }

        const newWindow = window.open('', '_blank');
        if (!newWindow) {
            alert('Пожалуйста, разрешите всплывающие окна в браузере для предпросмотра документов.');
            return;
        }
        newWindow.opener = null;

        const writeWindowShell = () => {
            newWindow.document.open();
            newWindow.document.write(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <style>
                        * { box-sizing: border-box; }
                        body { margin: 0; min-height: 100vh; background: #0d0f0d; color: #f4f6f5; font-family: Arial, sans-serif; }
                        main { width: min(1100px, 100%); min-height: 100vh; margin: 0 auto; padding: 28px; }
                        pre { min-height: calc(100vh - 56px); margin: 0; padding: 28px; overflow: auto; border: 1px solid #26302d; border-radius: 16px; background: #151917; color: #f4f6f5; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; font: 15px/1.65 Consolas, monospace; }
                        .message { min-height: calc(100vh - 56px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #c4cbc8; }
                        .message strong { color: #f4f6f5; font-size: 24px; }
                        .message a { margin-top: 24px; padding: 13px 24px; border-radius: 12px; background: #0abab5; color: #07100f; text-decoration: none; font-weight: 900; }
                        @media (max-width: 700px) { main { padding: 10px; } pre { min-height: calc(100vh - 20px); padding: 18px; border-radius: 12px; font-size: 13px; } }
                    </style>
                </head>
                <body><main id="preview-root"><div class="message">Подготовка документа...</div></main></body>
                </html>
            `);
            newWindow.document.close();
            newWindow.document.title = `Предпросмотр: ${file.name || 'Документ'}`;
            return newWindow.document.getElementById('preview-root');
        };

        const loadingRoot = writeWindowShell();
        try {
            const preview = await prepareDocumentPreview(file);
            const root = newWindow.document.getElementById('preview-root') || loadingRoot;
            if (!root) {
                throw new Error('Не удалось создать окно предпросмотра');
            }
            root.replaceChildren();

            if (preview.kind === 'text' || preview.kind === 'office') {
                const textElement = newWindow.document.createElement('pre');
                textElement.textContent = preview.text || 'Файл пуст.';
                root.appendChild(textElement);
            } else {
                const message = newWindow.document.createElement('div');
                message.className = 'message';
                const title = newWindow.document.createElement('strong');
                title.textContent = 'Файл не является текстовым';
                const description = newWindow.document.createElement('p');
                description.textContent = 'Этот бинарный формат нельзя безопасно показать как текст. Файл можно скачать и открыть в подходящей программе.';
                const downloadLink = newWindow.document.createElement('a');
                downloadLink.href = preview.objectUrl;
                downloadLink.download = file.name || 'document';
                downloadLink.textContent = 'СКАЧАТЬ ФАЙЛ';
                message.append(title, description, downloadLink);
                root.appendChild(message);
            }

            if (preview.objectUrl) {
                newWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(preview.objectUrl), { once: true });
            }
        } catch (error) {
            console.error('Ошибка текстового предпросмотра:', error);
            const root = newWindow.document.getElementById('preview-root') || loadingRoot;
            if (root) {
                root.replaceChildren();
                const message = newWindow.document.createElement('div');
                message.className = 'message';
                message.textContent = error instanceof Error ? error.message : 'Не удалось открыть документ';
                root.appendChild(message);
            }
        }
    };

    // --- ЛОГИКА УПРАВЛЕНИЯ РАЗДЕЛАМИ ---
    const confirmPromptSection = () => {
        if (!promptSection.name.trim()) return;
        const newSecName = promptSection.name.trim();
        const placeholder = { id: 'doc_placeholder_' + Date.now(), section: newSecName, isDocPlaceholder: true };
        const updated = [...(urgentFiles || []), placeholder];
        void updateFilesState(updated);
        setPromptSection({ isOpen: false, name: '' });
    };

    const confirmRenameSection = () => {
        if (!renameSectionPrompt.newName.trim()) return;
        const newName = renameSectionPrompt.newName.trim();
        const oldName = renameSectionPrompt.oldName;

        const updated = (urgentFiles || []).map((f: any) => {
            const isDoc = f.isDocPlaceholder || !(f.id?.startsWith('deadline_') || f.isTest);
            if (isDoc && (f.section?.trim() || 'Основной раздел') === oldName) {
                return { ...f, section: newName };
            }
            return f;
        });
        
        void updateFilesState(updated);
        setRenameSectionPrompt({ isOpen: false, oldName: '', newName: '' });
    };

    const executeDelete = () => {
        let updated = [];
        if (confirmDelete.type === 'section') {
            updated = (urgentFiles || []).filter((f: any) => {
                const isDoc = f.isDocPlaceholder || !(f.id?.startsWith('deadline_') || f.isTest);
                if (isDoc && (f.section?.trim() || 'Основной раздел') === confirmDelete.name) return false;
                return true;
            });
        } else {
            const itemToDelete = (urgentFiles || []).find((f: any) => f.id === confirmDelete.targetId);
            const sourceSection = itemToDelete?.section?.trim() || 'Основной раздел';
            
            updated = (urgentFiles || []).filter((f: any) => f.id !== confirmDelete.targetId);
            saveDataToServer(`file_data_${confirmDelete.targetId}`, null);

            const sourceHasItems = updated.some((f: any) => {
                const isDoc = f.isDocPlaceholder || !(f.id?.startsWith('deadline_') || f.isTest);
                return isDoc && (f.section?.trim() || 'Основной раздел') === sourceSection;
            });
            
            if (!sourceHasItems && sourceSection !== 'Основной раздел') {
                updated.push({ id: 'doc_placeholder_' + Date.now(), section: sourceSection, isDocPlaceholder: true });
            }
        }
        void updateFilesState(updated);
        setConfirmDelete({ isOpen: false, type: 'file', targetId: '', name: '' });
    };

    const handleMoveItem = (targetSection: string) => {
        if (!movingItem) return;
        
        const itemToMove = (urgentFiles || []).find((f: any) => f.id === movingItem);
        const sourceSection = itemToMove?.section?.trim() || 'Основной раздел';

        let updated = (urgentFiles || []).map((f: any) => f.id === movingItem ? { ...f, section: targetSection } : f);
        
        const sourceHasItems = updated.some((f: any) => {
            const isDoc = f.isDocPlaceholder || !(f.id?.startsWith('deadline_') || f.isTest);
            return isDoc && (f.section?.trim() || 'Основной раздел') === sourceSection;
        });
        
        if (!sourceHasItems && sourceSection !== 'Основной раздел') {
            updated.push({ id: 'doc_placeholder_' + Date.now(), section: sourceSection, isDocPlaceholder: true });
        }

        void updateFilesState(updated);
        setMovingItem(null);
    };

    const handleCopyItem = (targetSection: string) => {
        if (!copyingItem) return;

        const itemToCopy = (urgentFiles || []).find((file: any) => file.id === copyingItem);
        if (!itemToCopy) {
            setCopyingItem(null);
            return;
        }

        const newId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const copiedItem = {
            ...itemToCopy,
            id: newId,
            section: targetSection,
            date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
            copiedFromId: itemToCopy.id,
        };

        let updated = [...(urgentFiles || []), copiedItem];
        updated = ensureDocPlaceholderForSection(updated, targetSection);
        void updateFilesState(updated);

        if (itemToCopy.hasSeparateData) {
            fetch(`/api/storage?t=${Date.now()}&key=file_data_${itemToCopy.id}`, { cache: 'no-store' })
                .then((response) => response.json())
                .then((rawData) => saveDataToServer(`file_data_${newId}`, rawData))
                .catch((error) => console.error('Ошибка копирования данных файла', error));
        } else if (itemToCopy.data) {
            saveDataToServer(`file_data_${newId}`, itemToCopy.data).catch((error) => console.error('Ошибка копирования встроенных данных файла', error));
        }

        setCopyingItem(null);
        setSuccessModal({ show: true, title: 'Документ продублирован', text: `Файл добавлен ещё и в раздел "${targetSection}".` });
    };

    // --- ГРУППИРОВКА ФАЙЛОВ ПО РАЗДЕЛАМ ---
    const groupItems = (items: any[]) => {
        const groups: Record<string, any[]> = {};
        items.forEach((item: any) => {
            const sec = item.section?.trim() || 'Основной раздел';
            if (!groups[sec]) groups[sec] = [];
            if (!item.isDocPlaceholder) {
                groups[sec].push(item);
            }
        });
        return groups;
    };

    const normalizedDocumentSearch = deferredDocumentSearchQuery.trim().toLocaleLowerCase('ru-RU');
    const filteredDocuments = allDocs.filter((file: any) => {
        const sectionName = file.section?.trim() || 'Основной раздел';
        const matchesSection = documentSectionFilter === 'all' || sectionName === documentSectionFilter;
        if (!matchesSection) return false;
        if (!normalizedDocumentSearch) return true;

        return [file.name, sectionName, file.date, file.size]
            .some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(normalizedDocumentSearch));
    });
    const docGroups = groupItems(filteredDocuments);

    const renderLinkedPreviewContent = () => {
        if (!linkedPreview) {
            return null;
        }

        if (linkedPreview.loading) {
            return <div className="linked-document-preview-message">Подготовка документа...</div>;
        }

        if (linkedPreview.error) {
            return <div className="linked-document-preview-message" style={{ color: '#ff4d4d' }}>{linkedPreview.error}</div>;
        }

        if (linkedPreview.kind === 'image') {
            return <img src={linkedPreview.objectUrl} alt={linkedPreview.file.name} />;
        }

        if (linkedPreview.kind === 'video') {
            return <video src={linkedPreview.objectUrl} controls />;
        }

        if (linkedPreview.kind === 'audio') {
            return <audio src={linkedPreview.objectUrl} controls />;
        }

        if (linkedPreview.kind === 'text' || linkedPreview.kind === 'office') {
            return <pre className="linked-document-preview-text">{linkedPreview.text || 'Файл пуст.'}</pre>;
        }

        if (linkedPreview.kind === 'unsupported') {
            return (
                <div className="linked-document-preview-message">
                    Этот формат нельзя надежно показать внутри браузера. Документ выбран и открыт, используйте кнопку скачивания ниже.
                </div>
            );
        }

        return (
            <iframe
                title={`Предпросмотр ${linkedPreview.file.name}`}
                src={linkedPreview.objectUrl}
                sandbox=""
                referrerPolicy="no-referrer"
            />
        );
    };

    const visibleDocumentsCount = filteredDocuments.filter((file: any) => !file.isDocPlaceholder).length;

    return (
        <section className="vates-documents-screen" style={{ animation: 'fadeInUp 0.6s ease', maxWidth: '100%' }}>
            <header className="vates-page-heading">
                <div>
                    <span className="vates-eyebrow">База знаний</span>
                    <h1>Документы</h1>
                    <p>Загружайте, систематизируйте и открывайте документы компании.</p>
                </div>
            </header>

            {isAdmin && (
                <section className="vates-material-studio vates-document-studio">
                    <header className="vates-material-studio-heading">
                        <span className="vates-material-studio-icon">
                            <CustomIcon name="file" size={27} color="currentColor" accent="none" />
                        </span>
                        <div>
                            <span className="vates-eyebrow">Студия документов</span>
                            <h2>Добавьте файлы в базу знаний</h2>
                            <p>Загрузите документы и сразу распределите их по понятным разделам.</p>
                        </div>
                    </header>

                    <div className="vates-documents-upload-shell">
                    {(!selectedFiles || selectedFiles.length === 0) ? (
                        <div 
                            className="documents-upload-zone"
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
                            style={{
                                border: isDragging ? '2px dashed #0abab5' : '2px dashed #222',
                                borderRadius: '24px', padding: '50px 20px', textAlign: 'center',
                                background: isDragging ? 'rgba(10,186,181,0.05)' : '#0d0f0d',
                                transition: 'all 0.3s ease', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px',
                                opacity: isProcessing ? 0.5 : 1
                            }}
                            onClick={() => document.getElementById('file-upload-admin')?.click()}
                        >
                            <CustomIcon name="folder" size={48} color="#0abab5" />
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#fff', margin: '0 0 8px 0' }}>Загрузить документы</h3>
                                <p style={{ color: '#666', fontSize: '14px', margin: 0, maxWidth: '400px', lineHeight: '1.5' }}>
                                    Перетащите сюда текстовые, офисные, PDF, изображения, аудио или видео
                                </p>
                            </div>
                            <input type="file" multiple id="file-upload-admin" style={{ display: 'none' }} disabled={isProcessing} onChange={(e) => { if (e.target.files?.length) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]); }} />
                            <div className="hover-unified-app" style={{...adminActionBtn, padding: '12px 30px', marginTop: '10px'} as any}>ВЫБРАТЬ ФАЙЛЫ</div>
                        </div>
                    ) : (
                        <div className="documents-upload-panel" style={{ background: '#111', padding: '30px', borderRadius: '24px', border: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '15px' }}>
                                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#0abab5', margin: 0 }}>Подготовка к загрузке</h3>
                                <div style={{ background: 'rgba(10,186,181,0.1)', color: '#0abab5', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>{selectedFiles.length} файлов</div>
                            </div>

                            <div className="upload-settings-grid">
                                <div style={{ background: '#0a0a0a', borderRadius: '16px', border: '1px solid #1a1a1a', padding: '15px', maxHeight: '200px', overflowY: 'auto' }} className="documents-upload-file-list custom-scroll">
                                    {selectedFiles.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i !== selectedFiles.length - 1 ? '1px dashed #222' : 'none' }}>
                                            <CustomIcon name="attachment" size={14} color="#ccc" />
                                            <span style={{ fontSize: '13px', color: '#ccc', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                                            <span style={{ fontSize: '11px', color: '#666', flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', marginBottom: '8px' }}>Папка для сохранения:</div>
                                        {!isCreatingNewUploadSection ? (
                                           <select style={adminIn as any} value={uploadSection} onChange={e => { if (e.target.value === '__NEW__') { setIsCreatingNewUploadSection(true); setNewUploadSectionName(''); } else setUploadSection(e.target.value); }}>
                                               {Array.from(new Set(['Основной раздел', ...existingDocSections])).map(sec => <option key={sec as string} value={sec as string}>{sec as string}</option>)}
                                               <option value="__NEW__" style={{background: '#1a1a1a', color: '#0abab5'}}>+ Создать новую папку...</option>
                                           </select>
                                       ) : (
                                           <div style={{ display: 'flex', gap: '8px' }}>
                                               <input autoFocus style={{ ...adminIn, flex: 1, marginBottom: 0 } as any} placeholder="Название..." value={newUploadSectionName} onChange={e => setNewUploadSectionName(e.target.value)} />
                                               <button className="hover-unified-app" onClick={() => { setUploadSection(newUploadSectionName.trim() || 'Основной раздел'); setIsCreatingNewUploadSection(false); }} style={{ background: '#0abab5', color: '#000', border: 'none', borderRadius: '10px', padding: '0 15px', fontWeight: '900', cursor: 'pointer' }}>ОК</button>
                                               <button className="hover-unified-app" onClick={() => { setIsCreatingNewUploadSection(false); setUploadSection('Основной раздел'); }} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '10px', padding: '0 15px', fontWeight: '900', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><CustomIcon name="close" size={15} color="#fff" /></button>
                                           </div>
                                       )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '10px' }}>
                                       <button className="hover-unified-app" onClick={() => { setSelectedFiles([]); setUploadSection('Основной раздел'); setIsCreatingNewUploadSection(false); }} disabled={isProcessing} style={{ ...saveBtn, marginTop: 0, background: 'transparent', color: '#ff4d4d', border: '1px solid #ff4d4d', flex: 1, padding: '14px' } as any}>ОТМЕНА</button>
                                       <button className="hover-unified-app" onClick={handleSaveFile} disabled={isProcessing} style={{ ...saveBtn, marginTop: 0, flex: 2, padding: '14px' } as any}>{isProcessing ? 'ОБРАБОТКА...' : 'ЗАГРУЗИТЬ'}</button>
                                   </div>
                                </div>
                            </div>
                        </div>
                    )}
                    </div>

                    <footer className="vates-material-studio-footer">
                        <div>
                            <span className="vates-material-studio-footer-icon"><CustomIcon name="folder" size={19} color="currentColor" accent="none" /></span>
                            <div>
                                <strong>Организуйте библиотеку</strong>
                                <span>Разделы помогают быстро находить нужные документы.</span>
                            </div>
                        </div>
                        <div className="vates-material-studio-footer-actions">
                            <button type="button" className="vates-button secondary compact" onClick={() => setPromptSection({isOpen: true, name: ''})}>
                                Добавить раздел
                            </button>
                        </div>
                    </footer>
                </section>
            )}

            <section className="vates-material-catalog-toolbar vates-documents-catalog-toolbar" aria-label="Поиск и фильтрация документов">
                <label className="vates-material-search-field">
                    <span className="vates-material-search-icon"><CustomIcon name="eye" size={18} color="currentColor" accent="none" /></span>
                    <input
                        type="search"
                        value={documentSearchQuery}
                        onChange={(event) => setDocumentSearchQuery(event.target.value)}
                        placeholder="Найти документ или раздел"
                        aria-label="Поиск документов"
                    />
                </label>
                <select value={documentSectionFilter} onChange={(event) => setDocumentSectionFilter(event.target.value)} aria-label="Раздел документов">
                    <option value="all">Все разделы</option>
                    {existingDocSections.map((sectionName) => (
                        <option key={String(sectionName)} value={String(sectionName)}>{String(sectionName)}</option>
                    ))}
                </select>
                <span className="vates-material-result-count">Найдено: <strong>{visibleDocumentsCount}</strong></span>
            </section>

            <div className="vates-material-section-heading vates-documents-library-heading">
               <div>
                   <span className="vates-eyebrow">Библиотека документов</span>
                   <h2 className="tasks-title">Документы компании</h2>
               </div>
            </div>
            
            <div className="vates-material-groups vates-documents-library" style={{ marginBottom: '60px' }}>
               {Object.keys(docGroups).length === 0 ? (
                   <div className="vates-material-empty-state documents-empty-state">
                       {documentSearchQuery || documentSectionFilter !== 'all'
                           ? 'По этому запросу документов не найдено.'
                           : isAdmin
                               ? 'Документов пока нет. Добавьте первый файл через студию документов.'
                               : 'Нет доступных документов.'}
                   </div>
               ) : (
                   Object.entries(docGroups).map(([secName, items]: any) => (
                       <section key={secName} className="vates-material-group vates-document-section">
                           <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '10px', marginBottom: isSectionCollapsed(secName) ? 0 : '20px' }}>
                               <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', color: '#0abab5', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>
                                   <CustomIcon name="folder" size={22} color="#0abab5" />
                                   {secName}
                                   <SectionCollapseButton
                                       isCollapsed={isSectionCollapsed(secName)}
                                       onToggle={() => toggleSection(secName)}
                                       sectionName={secName}
                                   />
                               </h3>
                               {isAdmin && (
                                   <div className="vates-document-section-actions" style={{display: 'flex', gap: '15px'}}>
                                       <span className="hover-link-unified-app" onClick={() => setRenameSectionPrompt({isOpen: true, oldName: secName, newName: secName})} style={{ color: '#0abab5', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><CustomIcon name="edit" size={12} color="#0abab5" /> РЕДАКТИРОВАТЬ</span>
                                       <span className="hover-link-unified-app" onClick={() => setConfirmDelete({isOpen: true, type: 'section', targetId: secName, name: secName})} style={{ color: '#ff4d4d', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '3px', marginBottom: '-2px'}}>
                                               <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                           </svg>
                                           УДАЛИТЬ
                                       </span>
                                   </div>
                               )}
                           </div>
                           
                           {!isSectionCollapsed(secName) && <div className="premium-cards-container section-collapsible-content vates-document-card-grid">
                               {items.length === 0 ? (
                                   <div className="vates-material-section-empty vates-document-section-empty">
                                       <span className="vates-material-section-empty-icon"><CustomIcon name="folder" size={19} color="currentColor" accent="none" /></span>
                                       <div>
                                           <strong>Раздел пока пуст</strong>
                                           {isAdmin && <span>Добавьте документ, когда файл будет готов.</span>}
                                       </div>
                                   </div>
                               ) : (
                                   items.map((file: any) => (
                                       <article key={file.id} id={`document-card-${file.id}`} className="premium-card linked-document-card-target vates-document-card">
                                           <header className="vates-material-card-header">
                                               <div className="vates-material-card-type">
                                                   <span className="vates-material-card-type-icon"><CustomIcon name="file" size={19} color="currentColor" accent="none" /></span>
                                                   <div>
                                                       <span>Документ</span>
                                                       <strong>{file.date || 'В библиотеке'}</strong>
                                                   </div>
                                               </div>

                                               {isAdmin && (
                                                   <div className="vates-material-card-actions" onClick={(event) => event.stopPropagation()}>
                                                       <button type="button" onClick={() => setMovingItem(file.id)} className="card-icon-btn move-btn" title="Переместить" aria-label={`Переместить документ «${file.name}»`}>
                                                           <CustomIcon name="folder" size={17} color="currentColor" accent="none" />
                                                       </button>
                                                       <button type="button" onClick={() => setCopyingItem(file.id)} className="card-icon-btn copy-btn" title="Добавить в другой раздел" aria-label={`Добавить документ «${file.name}» в другой раздел`}>
                                                           <CustomIcon name="attachment" size={17} color="currentColor" accent="none" />
                                                       </button>
                                                       <button type="button" onClick={() => setConfirmDelete({isOpen: true, type: 'file', targetId: file.id, name: file.name})} className="card-icon-btn del-btn" title="Удалить" aria-label={`Удалить документ «${file.name}»`}>
                                                           <CustomIcon name="close" size={17} color="currentColor" accent="none" />
                                                       </button>
                                                   </div>
                                               )}
                                           </header>

                                           <div className="vates-document-card-copy">
                                               <span>{secName}</span>
                                               <h4>{file.name}</h4>
                                               <p>Документ доступен для просмотра и скачивания из базы знаний.</p>
                                           </div>

                                           <div className="vates-document-card-meta">
                                               <span>{file.size || 'Размер не указан'}</span>
                                               <span>{file.name?.includes('.') ? file.name.split('.').pop()?.toUpperCase() : 'ФАЙЛ'}</span>
                                           </div>

                                           <footer className="vates-document-card-footer">
                                               <button type="button" onClick={() => handleOpenPreview(file)} className="vates-button secondary compact">Открыть</button>
                                               <button type="button" onClick={() => handleDownloadFile(file)} className="vates-button primary compact"><CustomIcon name="download" size={15} color="currentColor" accent="none" /> Скачать</button>
                                               <button type="button" onClick={() => handleAskAiAboutDocument(file)} className="vates-button secondary compact vates-document-ask-ai"><CustomIcon name="brain" size={15} color="currentColor" accent="none" /><span>Спросить AI</span></button>
                                           </footer>
                                       </article>
                                   ))
                               )}
                           </div>}
                       </section>
                   ))
               )}
            </div>

            {linkedPreview && (
                <div className="linked-document-preview-overlay" onClick={closeLinkedPreview}>
                    <div className="linked-document-preview-modal vates-document-preview-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="linked-document-preview-header">
                            <div>
                                <strong>{linkedPreview.file.name}</strong>
                                <span>{linkedPreview.file.section?.trim() || 'Основной раздел'}</span>
                            </div>
                            <button type="button" className="linked-document-preview-close" onClick={closeLinkedPreview} aria-label="Закрыть документ" title="Закрыть">
                                <CustomIcon name="close" size={20} color="#ff4d4d" />
                                <span>Закрыть</span>
                            </button>
                        </div>
                        <div className="linked-document-preview-body">
                            {renderLinkedPreviewContent()}
                        </div>
                        <div className="linked-document-preview-actions">
                            <button type="button" onClick={() => handleOpenPreview(linkedPreview.file)}>ОТКРЫТЬ ОТДЕЛЬНО</button>
                            <button type="button" onClick={() => handleDownloadFile(linkedPreview.file)}>СКАЧАТЬ</button>
                            <button type="button" className="vates-document-ask-ai" onClick={() => handleAskAiAboutDocument(linkedPreview.file)}><span>СПРОСИТЬ AI</span></button>
                        </div>
                    </div>
                </div>
            )}

            {/* МИНИ-ОКНА АДМИНА */}
            {promptSection.isOpen && (
                <div style={modalOverlay as any} onClick={() => setPromptSection({isOpen: false, name: ''})}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900'}}>НОВЫЙ РАЗДЕЛ</h2>
                        <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px', marginLeft: '5px' }}>Название раздела</div>
                        <input style={adminIn as any} autoFocus placeholder="Например: Должностные инструкции" value={promptSection.name} onChange={e => setPromptSection({...promptSection, name: e.target.value})} />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="hover-unified-app" onClick={() => setPromptSection({isOpen: false, name: ''})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={confirmPromptSection} style={{ ...saveBtn, flex: 1, marginTop: 0 } as any}>СОЗДАТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {renameSectionPrompt.isOpen && (
                <div style={modalOverlay as any} onClick={() => setRenameSectionPrompt({...renameSectionPrompt, isOpen: false})}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900', textTransform: 'uppercase'}}>ПЕРЕИМЕНОВАТЬ РАЗДЕЛ</h2>
                        <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px', marginLeft: '5px' }}>Новое название</div>
                        <input style={adminIn as any} autoFocus placeholder="Название..." value={renameSectionPrompt.newName} onChange={e => setRenameSectionPrompt({...renameSectionPrompt, newName: e.target.value})} />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="hover-unified-app" onClick={() => setRenameSectionPrompt({...renameSectionPrompt, isOpen: false})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={confirmRenameSection} style={{ ...saveBtn, flex: 1, marginTop: 0 } as any}>СОХРАНИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {movingItem && (
                <div style={modalOverlay as any} onClick={() => setMovingItem(null)}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900', textTransform: 'uppercase'}}>Переместить документ</h2>
                        
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', marginBottom: '10px'}} className="custom-scroll">
                            <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginLeft: '5px' }}>Выберите папку:</div>
                            {existingDocSections.map((sec: any) => (
                                <button key={sec} onClick={() => handleMoveItem(sec)} style={{...adminIn, textAlign: 'left', cursor: 'pointer', background: '#1a1a1a', border: '1px solid #333'} as any}>{sec}</button>
                            ))}
                        </div>

                        <button className="hover-unified-app" onClick={() => setMovingItem(null)} style={{ ...saveBtn, background: '#333', color: '#fff', marginTop: '10px' } as any}>ОТМЕНА</button>
                    </div>
                </div>
            )}

            {copyingItem && (
                <div style={modalOverlay as any} onClick={() => setCopyingItem(null)}>
                    <div style={modalContentSmall as any} onClick={e => e.stopPropagation()}>
                        <h2 style={{color: '#0abab5', textAlign: 'center', marginBottom: '20px', fontWeight: '900', textTransform: 'uppercase'}}>Добавить в другой раздел</h2>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', marginBottom: '10px'}} className="custom-scroll">
                            <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', marginLeft: '5px' }}>Выберите папку:</div>
                            {existingDocSections.map((sec: any) => (
                                <button key={`copy_${sec}`} onClick={() => handleCopyItem(sec)} style={{...adminIn, textAlign: 'left', cursor: 'pointer', background: '#1a1a1a', border: '1px solid #333'} as any}>{sec}</button>
                            ))}
                        </div>
                        <button className="hover-unified-app" onClick={() => setCopyingItem(null)} style={{ ...saveBtn, background: '#333', color: '#fff', marginTop: '10px' } as any}>ОТМЕНА</button>
                    </div>
                </div>
            )}

            {confirmDelete.isOpen && (
                <div style={modalOverlay as any} onClick={() => setConfirmDelete({isOpen: false, type: 'file', targetId: '', name: ''})}>
                    <div style={{...modalContentSmall, textAlign: 'center'} as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ff4d4d" strokeWidth="2"/>
                                <path d="M12 8V13" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="12" cy="16" r="1" fill="#ff4d4d"/>
                            </svg>
                        </div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>УДАЛИТЬ?</h2>
                        <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.5', marginBottom: '25px' }}>
                            {confirmDelete.type === 'section' 
                                ? `Вы уверены, что хотите удалить весь раздел "${confirmDelete.name}" и ВСЕ документы внутри него? Это действие необратимо.` 
                                : `Удалить документ "${confirmDelete.name}" безвозвратно?`
                            }
                        </p>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <button className="hover-unified-app" onClick={() => setConfirmDelete({isOpen: false, type: 'file', targetId: '', name: ''})} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1, minWidth: '100px', marginTop: 0 } as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={executeDelete} style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1, minWidth: '100px', marginTop: 0 } as any}>УДАЛИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {successModal.show && (
                <div style={modalOverlay as any} onClick={() => setSuccessModal({ show: false, title: '', text: '' })}>
                    <div style={{ ...modalContentSmall, textAlign: 'center' } as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px', animation: 'scaleIn 0.3s ease' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="rgba(10,186,181,0.1)" stroke="#0abab5" strokeWidth="2"/>
                                <path d="M8 12L11 15L16 9" stroke="#0abab5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h2 style={{ color: '#0abab5', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>{successModal.title}</h2>
                        <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.5', marginBottom: '25px' }}>{successModal.text}</p>
                        <button className="hover-unified-app" onClick={() => setSuccessModal({ show: false, title: '', text: '' })} style={saveBtn as any}>ПОНЯТНО</button>
                    </div>
                </div>
            )}

            {errorModal.show && (
                <div style={modalOverlay as any} onClick={() => setErrorModal({ show: false, text: '' })}>
                    <div style={{ ...modalContentSmall, textAlign: 'center' } as any} onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '20px' }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="rgba(255,77,77,0.1)" stroke="#ff4d4d" strokeWidth="2"/>
                                <path d="M15 9L9 15M9 9L15 15" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px', textTransform: 'uppercase' }}>ОШИБКА</h2>
                        <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.5', marginBottom: '25px' }}>{errorModal.text}</p>
                        <button className="hover-unified-app" onClick={() => setErrorModal({ show: false, text: '' })} style={{ ...saveBtn, background: '#333', color: '#fff' } as any}>ПОНЯТНО</button>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @media (min-width: 769px) {
                    .premium-cards-container {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); 
                        gap: 20px;
                        width: 100%;
                    }
                }

                .upload-settings-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                    align-items: start;
                }

                .premium-card {
                    background: #111;
                    border-radius: 16px; 
                    border: 1px solid #222;
                    transition: all 0.2s ease;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    min-height: 140px; 
                    padding: 20px; 
                    box-sizing: border-box; 
                    overflow: hidden;
                }

                .premium-card:hover {
                    border-color: rgba(10, 186, 181, 0.4);
                    transform: translateY(1px) scale(0.985);
                    box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.18);
                }

                /* СТИЛИ ДЛЯ НОВЫХ КНОПОК И ИКОНОК */
                .doc-action-btn {
                    background: rgba(10,186,181,0.05);
                    color: #0abab5;
                    border: 1px solid rgba(10,186,181,0.3);
                    border-radius: 10px;
                    padding: 10px 0;
                    font-size: 11px;
                    font-weight: 900;
                    cursor: pointer;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    flex: 1;
                    text-align: center;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .doc-action-btn:hover {
                    background: rgba(10,186,181,0.14);
                    border-color: rgba(10,186,181,0.45);
                    color: #fff;
                    transform: translateY(1px) scale(0.985);
                    box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2);
                }

                .card-icon-btn {
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 1px solid #333;
                    background: #1a1a1a;
                }
                .move-btn { color: #fff; }
                .move-btn:hover { background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }

                .copy-btn { color: #0abab5; }
                .copy-btn:hover { background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }

                .del-btn { color: #ff4d4d; }
                .del-btn:hover { background: rgba(10,186,181,0.14); border-color: rgba(10,186,181,0.45); color: #fff; transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.2); }

                @media (max-width: 768px) {
                    .upload-settings-grid {
                        grid-template-columns: 1fr !important;
                        gap: 20px !important;
                    }
                    .premium-cards-container { 
                        display: grid !important;
                        grid-template-columns: 1fr !important;
                        gap: 15px !important; 
                    }
                }
            `}</style>
        </section>
    );
}

// --- СТИЛИ ---
const adminActionBtn = { background: 'rgba(10,186,181,0.1)', color: '#0abab5', border: '1px solid rgba(10,186,181,0.3)', padding: '10px 18px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '12px' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(10px)', padding: '20px', boxSizing: 'border-box' };
const modalContentSmall = { background: '#111', padding: '40px 30px', borderRadius: '30px', width: '100%', maxWidth: '400px', border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' };
const adminIn = { width: '100%', padding: '16px', background: '#000', border: '1px solid #333', borderRadius: '15px', color: '#fff', marginBottom: '0', outline: 'none', fontSize: '15px', boxSizing: 'border-box' };
const saveBtn = { width: '100%', padding: '18px', background: '#0abab5', color: '#000', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', marginTop: '25px', fontSize: '15px', letterSpacing: '1px' };
