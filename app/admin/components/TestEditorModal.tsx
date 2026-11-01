"use client";
import React from 'react';
import { modalOverlay, adminIn, delIconStyle, adminActionBtn, saveBtn } from './adminStyles';

const modalContentMedium: React.CSSProperties = { background: '#161816', padding: '40px 30px', borderRadius: '35px', width: '100%', maxWidth: '760px', border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' };
const cancelLink: React.CSSProperties = { textAlign: 'center', marginTop: '18px', color: '#666', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' };
const fieldLabel: React.CSSProperties = { fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '8px', marginLeft: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' };
const timerBox: React.CSSProperties = { background: '#0d0f0d', border: '1px solid #222', borderRadius: '22px', padding: '18px', display: 'grid', gap: '16px' };
const timerInputWrap: React.CSSProperties = { display: 'grid', gap: '8px', minWidth: '0' };
const timerInputStyle: React.CSSProperties = { width: '100%', padding: '12px 12px', background: '#111', border: '1px solid #333', borderRadius: '14px', color: '#0abab5', fontSize: '20px', fontWeight: '900', textAlign: 'center', outline: 'none' };
const timerUnitStyle: React.CSSProperties = { fontSize: '10px', color: '#666', fontWeight: '900', textAlign: 'center', letterSpacing: '1px' };
const presetBtn = (active: boolean): React.CSSProperties => ({ padding: '10px 14px', background: active ? '#0abab5' : '#111', color: active ? '#000' : '#a1a1a1', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', fontWeight: '900', transition: '0.2s', border: `1px solid ${active ? '#0abab5' : '#333'}`, textAlign: 'center' });
const questionCardStyle: React.CSSProperties = { background: '#0d0f0d', padding: '20px', borderRadius: '20px', border: '1px solid #222', marginBottom: '16px' };
const optionRow = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '12px', background: active ? 'rgba(10,186,181,0.08)' : '#111', border: `1px solid ${active ? 'rgba(10,186,181,0.35)' : '#222'}`, borderRadius: '14px', padding: '10px 12px' });
const optionPick = (active: boolean): React.CSSProperties => ({ width: '20px', height: '20px', borderRadius: '50%', border: active ? '6px solid #0abab5' : '2px solid #555', cursor: 'pointer', flexShrink: 0 });

export default function TestEditorModal({
    testFormData, setTestFormData, updateTestQuestion,
    removeTestQuestion, addTestQuestion, handleSendTest, isProcessing, setShowTestEditor
}: any) {

    // --- ЛОГИКА КОНВЕРТАЦИИ ТАЙМЕРА (Из долей минут в ММ:СС) ---
    const currentMins = Math.floor(testFormData.timeLimit || 0);
    const currentSecs = Math.round(((testFormData.timeLimit || 0) - currentMins) * 60);

    const handleTimeChange = (type: 'm' | 's', val: string) => {
        let num = parseInt(val.replace(/\D/g, ''), 10);
        if (isNaN(num)) num = 0;
        
        // Защита от ввода 60+ секунд
        if (type === 's' && num > 59) num = 59;
        
        let newMins = type === 'm' ? num : currentMins;
        let newSecs = type === 's' ? num : currentSecs;
        
        // Конвертируем обратно в десятичную дробь для сервера
        setTestFormData({...testFormData, timeLimit: newMins + (newSecs / 60)});
    };

    return (
        <div style={{...modalOverlay, alignItems: 'flex-start'} as any} onClick={() => setShowTestEditor(false)}>
            <div className="admin-modal-content custom-scroll" style={{...modalContentMedium, margin: '40px auto', maxHeight: '85vh', overflowY: 'auto'} as any} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '25px' }}>
                    <div>
                        <div style={{ fontSize: '12px', color: '#0abab5', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Аттестация
                        </div>
                        <h2 style={{ margin: 0, color: '#fff', fontWeight: '900', fontSize: '26px' }}>
                            Редактор аттестации
                        </h2>
                    </div>
                    <div className="hover-unified" onClick={() => setShowTestEditor(false)} style={{ ...delIconStyle, width: '40px', height: '40px', fontSize: '18px' } as any}>X</div>
                </div>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px'}}>
                    <div>
                        <div style={fieldLabel}>Название аттестации</div>
                        <input autoComplete="new-password" style={{...adminIn, color: '#fff', fontWeight: '900', marginBottom: 0} as any} placeholder="Например: Итоговая аттестация" value={testFormData.title} onChange={e => setTestFormData({...testFormData, title: e.target.value})} />
                    </div>
                    
                    <div>
                        <div style={fieldLabel}>Лимит времени</div>
                        <div style={timerBox}>
                            <div className="timer-layout">
                                <div className="timer-fields">
                                <div style={timerInputWrap} className="timer-input-wrap">
                                    <div style={{ fontSize: '12px', color: '#a1a1a1', fontWeight: '800' }}>Минуты</div>
                                    <input 
                                        type="text"
                                        value={currentMins === 0 && currentSecs === 0 ? '' : currentMins}
                                        onChange={(e) => handleTimeChange('m', e.target.value)}
                                        placeholder="00"
                                        style={timerInputStyle}
                                    />
                                    <span style={timerUnitStyle}>ММ</span>
                                </div>
                                <span className="timer-colon" style={{ fontSize: '24px', color: '#3f4641', fontWeight: '900', paddingBottom: '12px' }}>:</span>
                                <div style={timerInputWrap} className="timer-input-wrap">
                                    <div style={{ fontSize: '12px', color: '#a1a1a1', fontWeight: '800' }}>Секунды</div>
                                    <input 
                                        type="text"
                                        value={currentMins === 0 && currentSecs === 0 ? '' : currentSecs}
                                        onChange={(e) => handleTimeChange('s', e.target.value)}
                                        placeholder="00"
                                        style={timerInputStyle}
                                    />
                                    <span style={timerUnitStyle}>СС</span>
                                </div>
                                </div>
                            </div>
                            <div className="timer-presets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '8px' }}>
                                {[0, 1, 5, 10, 15, 30].map((t) => (
                                    <div 
                                        className="hover-unified"
                                        key={t}
                                        onClick={() => setTestFormData({...testFormData, timeLimit: t})} 
                                        style={presetBtn(testFormData.timeLimit === t)}
                                    >
                                        {t === 0 ? 'Без лимита' : `${t} мин`}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{borderTop: '1px solid #222', paddingTop: '22px', marginTop: '4px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap'}}>
                        <h3 style={{fontSize: '16px', color: '#0abab5', margin: 0, fontWeight: '900'}}>Вопросы ({testFormData.quiz.length})</h3>
                        <button className="hover-unified" onClick={addTestQuestion} disabled={isProcessing} style={adminActionBtn as any}>+ ДОБАВИТЬ ВОПРОС</button>
                    </div>
                    {testFormData.quiz.map((q: any, qIdx: number) => (
                        <div key={qIdx} style={questionCardStyle}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '15px'}}>
                                <div style={{color: '#0abab5', fontWeight: '900'}}>Вопрос {qIdx + 1}</div>
                                {testFormData.quiz.length > 1 && (
                                    <div onClick={() => removeTestQuestion(qIdx)} style={{color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Удалить
                                    </div>
                                )}
                            </div>
                            <input autoComplete="new-password" style={{...adminIn, fontWeight: 'bold', marginBottom: '15px'} as any} placeholder="Текст вопроса..." value={q.q} onChange={e => updateTestQuestion(qIdx, 'q', e.target.value)} />
                            
                            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                                {[0, 1, 2, 3].map((i: number) => (
                                    <div key={i} style={optionRow(q.c === i)}>
                                        <div onClick={() => updateTestQuestion(qIdx, 'c', i)} style={optionPick(q.c === i)} />
                                        <input autoComplete="new-password" style={{...adminIn, padding: '10px', marginBottom: 0, border: 'none', background: 'transparent', width: '100%'} as any} placeholder={`Вариант ${i+1}`} value={q.o[i] || ''} onChange={e => updateTestQuestion(qIdx, `o${i}`, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                <button className="hover-unified" onClick={handleSendTest} disabled={isProcessing} style={{...saveBtn, marginTop: '30px', cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1} as any}>
                    {isProcessing ? 'ОТПРАВКА...' : 'ОТПРАВИТЬ'}
                </button>
                
                <div className="hover-unified hover-link-like" onClick={() => setShowTestEditor(false)} style={cancelLink as any}>ЗАКРЫТЬ</div>

                <style jsx>{`
                    .hover-unified {
                        transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
                    }

                    .hover-unified:hover:not(:disabled) {
                        transform: translateY(1px) scale(0.985);
                        box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(10, 186, 181, 0.24);
                        border-color: rgba(10, 186, 181, 0.45) !important;
                    }

                    .hover-unified:active:not(:disabled) {
                        transform: translateY(2px) scale(0.97);
                        box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.24);
                    }

                    .hover-link-like:hover {
                        color: #0abab5 !important;
                    }

                    .timer-layout {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr) auto;
                        gap: 18px;
                        align-items: end;
                    }

                    .timer-fields {
                        display: grid;
                        grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
                        align-items: end;
                        gap: 14px;
                    }

                    .timer-input-wrap {
                        min-width: 0;
                    }

                    .timer-colon {
                        align-self: center;
                        padding-bottom: 28px !important;
                    }

                    .timer-presets {
                        align-self: stretch;
                        min-width: 250px;
                    }

                    @media (max-width: 768px) {
                        .admin-modal-content {
                            padding: 28px 18px !important;
                            border-radius: 28px !important;
                            margin: 20px auto !important;
                            max-height: calc(100vh - 40px) !important;
                        }
                        .admin-modal-content h2 {
                            font-size: 22px !important;
                        }
                        .timer-layout {
                            grid-template-columns: 1fr;
                            gap: 12px;
                        }
                        .timer-fields {
                            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
                            gap: 10px;
                        }
                        .timer-colon {
                            padding-bottom: 12px !important;
                        }
                        .timer-presets {
                            min-width: 0;
                        }
                    }

                    @media (max-width: 560px) {
                        .timer-fields {
                            grid-template-columns: 1fr;
                        }
                        .timer-colon {
                            display: none;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}
