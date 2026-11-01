"use client";

import React, { useState } from 'react';
import CustomIcon from '@/app/components/CustomIcon';

const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTH_NAMES_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const CALENDAR_HEADINGS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function CalendarArrow({ direction }: { direction: 'left' | 'right' }) {
    const path = direction === 'left' ? 'M14.5 5L8 12L14.5 19' : 'M9.5 5L16 12L9.5 19';

    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function CalendarWidget({
    eventTab, setEventTab, filteredEvents, currentDate, handlePrevMonth, handleNextMonth,
    daysInMonth, shiftStartDay, isToday, openNotePanel, notes
}: any) {
    const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const [selectedEvent, setSelectedEvent] = useState<any>(null);

    const getEventDateLabel = (event: any) => {
        const eventDate = event.dateObj as Date;
        return `${eventDate.getDate()} ${MONTH_NAMES_GENITIVE[eventDate.getMonth()]} ${eventDate.getFullYear()}, ${WEEKDAY_NAMES[eventDate.getDay()]}`;
    };

    return (
        <>
            <aside className="vates-calendar-card" aria-labelledby="vates-calendar-title">
                <header className="vates-calendar-header">
                    <div className="vates-calendar-title-wrap">
                        <span className="vates-eyebrow">Планирование</span>
                        <h3 id="vates-calendar-title">Календарь команды</h3>
                    </div>
                    <div className="vates-calendar-navigation">
                        <button type="button" onClick={handlePrevMonth} aria-label="Предыдущий месяц" title="Предыдущий месяц">
                            <CalendarArrow direction="left" />
                        </button>
                        <strong>{monthLabel}</strong>
                        <button type="button" onClick={handleNextMonth} aria-label="Следующий месяц" title="Следующий месяц">
                            <CalendarArrow direction="right" />
                        </button>
                    </div>
                </header>

                <div className="vates-calendar-grid" aria-label={monthLabel}>
                    {CALENDAR_HEADINGS.map(day => <div key={day} className="vates-calendar-weekday">{day}</div>)}
                    {Array.from({ length: shiftStartDay }).map((_, index) => <div key={`empty-${index}`} aria-hidden="true" />)}

                    {Array.from({ length: daysInMonth }).map((_, index) => {
                        const dayNumber = index + 1;
                        const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${dayNumber}`;
                        const noteText = notes[dateKey];
                        const hasNote = Boolean(noteText);
                        const isDeadlineNote = hasNote && noteText.startsWith('[Дедлайн:');
                        const isCurrentDay = isToday(dayNumber);

                        return (
                            <button
                                type="button"
                                key={dayNumber}
                                className={`cal-day ${isCurrentDay ? 'today' : ''} ${hasNote ? 'has-note' : ''}`}
                                onClick={() => openNotePanel(dayNumber)}
                                aria-label={`${dayNumber} ${MONTH_NAMES[currentDate.getMonth()]}`}
                            >
                                <span>{dayNumber}</span>
                                {hasNote && <i className={`note-dot ${isDeadlineNote ? 'deadline-dot' : ''}`} aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>
            </aside>

            <section className="vates-calendar-events vates-events-panel" aria-labelledby="vates-events-title">
                <div className="vates-events-heading">
                    <div>
                        <span className="vates-eyebrow">На контроле</span>
                        <h4 id="vates-events-title">Ближайшие события</h4>
                    </div>
                    <div className="vates-events-tabs" role="tablist" aria-label="Тип событий">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={eventTab === 'personal'}
                            className={eventTab === 'personal' ? 'active' : ''}
                            onClick={() => setEventTab('personal')}
                        >
                            Заметки
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={eventTab === 'deadline'}
                            className={eventTab === 'deadline' ? 'active deadline' : ''}
                            onClick={() => setEventTab('deadline')}
                        >
                            Дедлайны
                        </button>
                    </div>
                </div>

                <div className="vates-events-list custom-scroll" role="tabpanel">
                    {filteredEvents.length === 0 ? (
                        <div className="vates-events-empty">
                            <strong>Событий пока нет</strong>
                            <span>Выберите дату в календаре, чтобы добавить запись.</span>
                        </div>
                    ) : (
                        filteredEvents.slice(0, 10).map((event: any) => (
                            <button
                                type="button"
                                key={event.key}
                                className={`vates-event-item ${event.isDeadline ? 'deadline' : ''}`}
                                onClick={() => setSelectedEvent(event)}
                                aria-label={`Открыть событие: ${event.title}. ${getEventDateLabel(event)}`}
                                title="Открыть запись полностью"
                            >
                                <time className="vates-event-date" dateTime={event.dateObj.toISOString().slice(0, 10)}>
                                    <strong>{event.d}</strong>
                                    <span>{MONTH_NAMES_GENITIVE[event.dateObj.getMonth()]}</span>
                                    <small>{event.dateObj.getFullYear()}</small>
                                </time>
                                <div className="vates-event-copy">
                                    <strong>{event.title}</strong>
                                    {event.isDeadline ? (
                                        <span>Получатель: {event.target}</span>
                                    ) : (
                                        event.desc && <span>{event.desc}</span>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </section>

            {selectedEvent && (
                <div className="vates-event-modal-backdrop" role="presentation" onClick={() => setSelectedEvent(null)}>
                    <section
                        className="vates-event-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="vates-event-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="vates-event-modal-header">
                            <div>
                                <span className="vates-eyebrow">{selectedEvent.isDeadline ? 'Дедлайн' : 'Заметка'}</span>
                                <h3 id="vates-event-modal-title">{selectedEvent.title}</h3>
                            </div>
                            <button
                                type="button"
                                className="vates-icon-button vates-event-modal-close"
                                onClick={() => setSelectedEvent(null)}
                                aria-label="Закрыть запись"
                                title="Закрыть"
                            >
                                <CustomIcon name="close" size={18} color="currentColor" accent="none" />
                            </button>
                        </header>

                        <time className="vates-event-modal-date" dateTime={selectedEvent.dateObj.toISOString().slice(0, 10)}>
                            {getEventDateLabel(selectedEvent)}
                        </time>

                        {selectedEvent.isDeadline && selectedEvent.target && (
                            <p className="vates-event-modal-target">Получатель: {selectedEvent.target}</p>
                        )}

                        <p className="vates-event-modal-copy">
                            {selectedEvent.desc || 'Дополнительное описание для этой записи не добавлено.'}
                        </p>
                    </section>
                </div>
            )}
        </>
    );
}
