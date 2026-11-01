"use client";
import { createInAppNotification } from '@/app/lib/inAppNotifications';
import React, { useState } from 'react';
import { uploadZoneStyle, actionBtn, adminIn, saveBtn, modalOverlay, modalContentSmall } from './adminStyles';
import CustomIcon from '@/app/components/CustomIcon';

const saveDataToServer = (key: string, data: any) => {
    return fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data })
    }).catch(err => console.error("Ошибка сохранения на сервер:", err));
};

const docBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 10px',
    borderRadius: '10px',
    border: '1px solid rgba(10,186,181,0.35)',
    color: '#0abab5',
    background: 'rgba(10,186,181,0.08)',
    fontSize: '12px',
    fontWeight: '900',
    letterSpacing: '1px',
    marginBottom: '10px'
};

const miniDocBadgeStyle = {
    display: 'inline-flex',
    padding: '3px 6px',
    borderRadius: '6px',
    border: '1px solid rgba(10,186,181,0.25)',
    color: '#0abab5',
    fontSize: '10px',
    fontWeight: '900',
    marginRight: '6px'
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

export default function FileManager({
    urgentFiles, setUrgentFiles,
    isProcessing, setIsProcessing,
    
    setShowSuccessModal, setErrorModal
}: any) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadSection, setUploadSection] = useState('Основной раздел');
    const [isCreatingNewUploadSection, setIsCreatingNewUploadSection] = useState(false);
    const [newUploadSectionName, setNewUploadSectionName] = useState('');
    const [showFilesList, setShowFilesList] = useState(false);
    const [previewFile, setPreviewFile] = useState<any>(null);
    const [confirmModal, setConfirmModal] = useState({ show: false, id: '', name: '' });

    const uploadedMaterials = urgentFiles.filter((f: any) => !f.isTest && !f.id.startsWith('deadline_') && !f.isDocPlaceholder);
    const existingDocSections = Array.from(new Set(
        urgentFiles.filter((f: any) => !f.isTest && !f.id?.startsWith('deadline_')).map((f: any) => f.section?.trim() || 'Основной раздел')
    ));

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
            const res = await fetch(`/api/storage?t=${Date.now()}&key=tea_hub_urgent_files_v1`);
            let currentFiles = await res.json().catch(() => []);
            if (!Array.isArray(currentFiles)) currentFiles = [];

            const newFilesData: any[] = [];
            const fileNames: string[] = [];

            for (const file of selectedFiles) {
                const fileData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result);
                    reader.readAsDataURL(file);
                });

                const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                await saveDataToServer(`file_data_${fileId}`, fileData);

                newFilesData.push({
                    id: fileId, name: file.name, size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                    date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                    section: finalSection, hasSeparateData: true 
                });
                fileNames.push(file.name);
            }

            const updatedFiles = [...newFilesData, ...currentFiles];
            setUrgentFiles(updatedFiles);
            await saveDataToServer('tea_hub_urgent_files_v1', updatedFiles);
            
            const namesStr = fileNames.join(', ');
            try {
                await createInAppNotification({ target: 'Все', title: 'Новые документы', text: `Администратор добавил новые документы: ${namesStr}` });
            } catch (error) {
                console.error('Не удалось сохранить уведомление о документах:', error);
            }
            

            setShowSuccessModal({ show: true, title: 'ДОКУМЕНТЫ ОТПРАВЛЕНЫ', text: `Файлы (${selectedFiles.length} шт.) загружены в раздел "${finalSection}".` });
            setSelectedFiles([]); setUploadSection('Основной раздел'); setIsCreatingNewUploadSection(false); setNewUploadSectionName('');
        } catch(e) {
            setErrorModal({ show: true, text: "Произошла ошибка при пакетной загрузке файлов." });
        } finally { setIsProcessing(false); }
    };

    const executeDeleteFile = () => {
        const updatedFiles = urgentFiles.filter((f: any) => f.id !== confirmModal.id);
        setUrgentFiles(updatedFiles);
        saveDataToServer('tea_hub_urgent_files_v1', updatedFiles);
        saveDataToServer(`file_data_${confirmModal.id}`, null);
        setConfirmModal({ show: false, id: '', name: '' });
    };

    const handleDownloadFile = async (file: any) => {
        setIsProcessing(true);
        try {
            let fileBase64 = file.data;
            if (file.hasSeparateData || !file.data) {
                const res = await fetch(`/api/storage?t=${Date.now()}&key=file_data_${file.id}`);
                if (res.ok) fileBase64 = await res.json();
            }
            if (!fileBase64) { setErrorModal({ show: true, text: "Данные не найдены на сервере." }); return; }
            const link = document.createElement('a');
            link.href = fileBase64; link.download = file.name;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } finally { setIsProcessing(false); }
    };

    const handleOpenPreview = async (file: any) => {
        if (!file.hasSeparateData && !file.data) { setErrorModal({ show: true, text: "Этот файл загружен в старой версии и недоступен." }); return; }
        setIsProcessing(true);
        try {
            let fileBase64 = file.data;
            if (file.hasSeparateData) {
                const res = await fetch(`/api/storage?t=${Date.now()}&key=file_data_${file.id}`);
                if (res.ok) fileBase64 = await res.json();
            }
            if (!fileBase64) { setErrorModal({ show: true, text: "Данные не найдены." }); return; }
            setPreviewFile({ ...file, data: fileBase64 });
        } finally { setIsProcessing(false); }
    };

    return (
        <>
            <div 
              style={{ ...uploadZoneStyle, borderColor: isDragging ? '#0abab5' : '#333', opacity: isProcessing ? 0.5 : 1 } as any}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
            >
               <div style={docBadgeStyle as any}><CustomIcon name="file" size={24} color="#0abab5" /></div>
               <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#fff', marginBottom: '5px' }}>Загрузка документов</h3>
               
               {(!selectedFiles || selectedFiles.length === 0) ? (
                   <>
                       <p style={{ color: '#888', fontSize: '13px', marginBottom: '15px', maxWidth: '500px', margin: '0 auto 15px auto', lineHeight: '1.4' }}>Перетащите сюда документы (PDF, DOCX, TXT) или нажмите кнопку.</p>
                       <input type="file" multiple id="file-upload-admin" style={{ display: 'none' }} disabled={isProcessing} onChange={(e) => { if (e.target.files?.length) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]); }} />
                       <button onClick={() => document.getElementById('file-upload-admin')?.click()} disabled={isProcessing} style={{ ...actionBtn, background: '#0abab5', color: '#000', border: 'none', padding: '10px 25px' } as any}>ВЫБРАТЬ ФАЙЛЫ</button>
                       {uploadedMaterials.length > 0 && <div onClick={() => setShowFilesList(true)} style={{ marginTop: '15px', color: '#0abab5', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Загруженные документы ({uploadedMaterials.length})</div>}
                   </>
               ) : (
                   <div style={{ background: '#000', padding: '15px', borderRadius: '20px', display: 'inline-block', border: '1px solid #333', maxWidth: '100%', textAlign: 'left' }}>
                       <div style={{ color: '#0abab5', fontWeight: '900', fontSize: '14px', marginBottom: '10px', textAlign: 'center' }}>ВЫБРАНО ФАЙЛОВ: {selectedFiles.length}</div>
                       <div className="custom-scroll" style={{ maxHeight: '100px', overflowY: 'auto', marginBottom: '15px' }}>
                           {selectedFiles.map((f, i) => <div key={i} style={{fontSize: '12px', color: '#aaa', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px'}}><CustomIcon name="attachment" size={13} color="#aaa" /> {f.name}</div>)}
                       </div>
                       <div style={{ textAlign: 'left', marginTop: '15px', marginBottom: '20px' }}>
                           <div style={{ fontSize: '11px', color: '#0abab5', fontWeight: 'bold', marginBottom: '8px' }}>ВЫБЕРИТЕ ПАПКУ ДЛЯ ДОКУМЕНТОВ:</div>
                           {!isCreatingNewUploadSection ? (
                               <select style={{ width: '100%', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '10px', color: '#fff', outline: 'none', fontSize: '13px' }} value={uploadSection} onChange={e => { if (e.target.value === '__NEW__') { setIsCreatingNewUploadSection(true); setNewUploadSectionName(''); } else setUploadSection(e.target.value); }}>
                                   {Array.from(new Set(['Основной раздел', ...existingDocSections])).map(sec => <option key={sec as string} value={sec as string}>{sec as string}</option>)}
                                   <option value="__NEW__" style={{background: '#1a1a1a', color: '#0abab5'}}>+ Создать новую папку...</option>
                               </select>
                           ) : (
                               <div style={{ display: 'flex', gap: '8px' }}>
                                   <input autoFocus style={{ flex: 1, padding: '12px', background: '#000', border: '1px solid #0abab5', borderRadius: '10px', color: '#fff', outline: 'none', fontSize: '13px' }} placeholder="Название..." value={newUploadSectionName} onChange={e => setNewUploadSectionName(e.target.value)} />
                                   <button onClick={() => { setUploadSection(newUploadSectionName.trim() || 'Основной раздел'); setIsCreatingNewUploadSection(false); }} style={{ background: '#0abab5', color: '#000', border: 'none', borderRadius: '10px', padding: '0 15px', fontWeight: '900', cursor: 'pointer' }}>ОК</button>
                                   <button onClick={() => { setIsCreatingNewUploadSection(false); setUploadSection('Основной раздел'); }} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '10px', padding: '0 15px', fontWeight: '900', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><CustomIcon name="close" size={14} color="#fff" /></button>
                               </div>
                           )}
                       </div>
                       <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                           <button onClick={handleSaveFile} disabled={isProcessing} style={{ ...saveBtn, padding: '10px 20px', width: 'auto', fontSize: '12px', borderRadius: '10px' } as any}>{isProcessing ? 'ЗАГРУЗКА...' : 'ЗАГРУЗИТЬ ВСЕ'}</button>
                           <button onClick={() => { setSelectedFiles([]); setUploadSection('Основной раздел'); setIsCreatingNewUploadSection(false); }} disabled={isProcessing} style={{ ...saveBtn, background: 'transparent', color: '#ff4d4d', border: '1px solid #ff4d4d', padding: '10px 20px', width: 'auto', fontSize: '12px', borderRadius: '10px' } as any}>ОТМЕНИТЬ</button>
                       </div>
                   </div>
               )}
            </div>

            {/* Модалки файлов */}
            {showFilesList && (
              <div style={modalOverlay as any}>
                  <div className="admin-modal-content" style={{ ...modalContentSmall, maxWidth: '550px' } as any}>
                      <h2 style={{ color: '#0abab5', fontWeight: '900', marginBottom: '25px', textAlign: 'center' }}>ЗАГРУЖЕННЫЕ МАТЕРИАЛЫ</h2>
                      <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '25px', paddingRight: '10px' }} className="custom-scroll">
                          {uploadedMaterials.length === 0 ? <p style={{ textAlign: 'center', color: '#666' }}>Список пуст</p> : uploadedMaterials.map((file: any) => (
                              <div key={file.id} style={{ background: '#000', border: '1px solid #222', padding: '15px', borderRadius: '15px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ overflow: 'hidden', flex: 1 }}><div style={{ fontWeight: 'bold', fontSize: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={miniDocBadgeStyle as any}><CustomIcon name="file" size={14} color="#0abab5" /></span> {file.name}</div></div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                      <button onClick={() => handleOpenPreview(file)} style={{ background: 'transparent', border: 'none', color: '#0abab5', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>ОТКРЫТЬ</button>
                                      <button onClick={() => setConfirmModal({ show: true, id: file.id, name: file.name })} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', display: 'inline-flex' }}><CustomIcon name="close" size={18} color="#ff4d4d" /></button>
                                  </div>
                              </div>
                          ))}
                      </div>
                      <button onClick={() => setShowFilesList(false)} style={saveBtn as any}>← НАЗАД К ПАНЕЛИ</button>
                  </div>
              </div>
            )}

            {confirmModal.show && (
                <div style={modalOverlay as any} onClick={() => setConfirmModal({ show: false, id: '', name: '' })}>
                    <div style={{ ...modalContentSmall, maxWidth: '400px', padding: '35px', textAlign: 'center' } as any} onClick={e => e.stopPropagation()}>
                        <div style={warningBadgeStyle as any}><CustomIcon name="alert" size={34} color="#ff4d4d" /></div>
                        <h2 style={{ color: '#ff4d4d', fontWeight: '900', marginBottom: '15px' }}>УДАЛИТЬ?</h2>
                        <p style={{ color: '#ccc', fontSize: '15px', marginBottom: '25px' }}>Вы действительно хотите удалить этот документ?</p>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button onClick={() => setConfirmModal({ show: false, id: '', name: '' })} style={{ ...saveBtn, background: '#222', color: '#fff', flex: 1 } as any}>ОТМЕНА</button>
                            <button onClick={executeDeleteFile} style={{ ...saveBtn, background: '#ff4d4d', color: '#fff', flex: 1 } as any}>УДАЛИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {previewFile && (
                <div style={modalOverlay as any} onClick={() => setPreviewFile(null)}>
                    <div style={{ ...modalContentSmall, maxWidth: '80%', height: '85vh', padding: '25px', display: 'flex', flexDirection: 'column' } as any} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ color: '#0abab5', fontWeight: '900', fontSize: '18px', margin: 0 }}>{previewFile.name}</h2>
                            <div onClick={() => setPreviewFile(null)} style={{ cursor: 'pointer', fontSize: '24px', color: '#ff4d4d', fontWeight: 'bold' }}>X</div>
                        </div>
                        <div style={{ flex: 1, width: '100%', background: '#fff', borderRadius: '15px', overflow: 'hidden' }}>
                            {previewFile.data ? <iframe src={previewFile.data} style={{ width: '100%', height: '100%', border: 'none' }} /> : <div style={{ color: '#000', textAlign: 'center', padding: '20px' }}>Загрузка...</div>}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
