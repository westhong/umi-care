import { useState, useEffect, useCallback } from 'react';
import { useT } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { get } from '../api/client';

interface DayData {
  date: string;
  checkins: Array<{ taskId: string; isDone: boolean; result: string | null; note: string; time: string }>;
  summary: { done: number; skipped: number; total: number };
  incidents: Array<{ id: string; type: string; severity: string; note: string; reportedAt: string }>;
  selfReports: Array<{ id: string; type: string; title: string; quantity: number; unit: string; reportedAt: string }>;
  weights: Array<{ id: string; catWeight: number; measuredAt: string }>;
}

const MONTHS_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS_ZH = ['日','一','二','三','四','五','六'];
const WEEKDAYS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function CalendarPage() {
  const lang = useAppStore((s) => s.lang);
  const currentDate = useAppStore((s) => s.currentDate);
  const t = useT(lang);

  const today = currentDate || new Date().toISOString().slice(0, 10);
  const months = lang === 'zh' ? MONTHS_ZH : MONTHS_EN;
  const weekdays = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN;

  const [viewMonth, setViewMonth] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayData, setDayData] = useState<Map<string, DayData>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchDayData = useCallback(async (date: string) => {
    try {
      const response = await get<DayData>(`/api/calendar/day?date=${date}`);
      setDayData(prev => {
        const next = new Map(prev);
        next.set(date, response);
        return next;
      });
      return response;
    } catch {
      return null;
    }
  }, []);

  const handleDateClick = useCallback(async (date: string) => {
    if (selectedDate === date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(date);
    if (!dayData.has(date)) {
      setLoading(true);
      await fetchDayData(date);
      setLoading(false);
    }
  }, [selectedDate, dayData, fetchDayData]);

  const handlePrevMonth = useCallback(() => {
    const [year, month] = viewMonth.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDate(null);
  }, [viewMonth]);

  const handleNextMonth = useCallback(() => {
    const [year, month] = viewMonth.split('-').map(Number);
    const d = new Date(year, month, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDate(null);
  }, [viewMonth]);

  const generateCalendarDays = useCallback((): Array<Date | null> => {
    const [year, month] = viewMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const totalDays = new Date(year, month, 0).getDate();
    const startDow = firstDay.getDay();
    const days: Array<Date | null> = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month - 1, d));
    const rem = 7 - (days.length % 7);
    if (rem < 7) for (let i = 0; i < rem; i++) days.push(null);
    return days;
  }, [viewMonth]);

  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const getRate = (data: DayData) => {
    if (!data.summary || data.summary.total === 0) return null;
    return Math.round((data.summary.done / data.summary.total) * 100);
  };

  const renderBadges = (data: DayData) => {
    const els = [];
    const rate = getRate(data);
    if (rate !== null) {
      els.push(
        <span key="r" style={{
          fontSize: '9px', padding: '1px 3px', borderRadius: '3px',
          backgroundColor: rate === 100 ? '#22c55e' : rate >= 50 ? '#eab308' : '#ef4444',
          color: '#fff', fontWeight: 700, lineHeight: 1.4,
        }}>{rate}%</span>
      );
    }
    if (data.incidents?.length > 0) els.push(<span key="i" style={{ fontSize: '10px' }}>🔴</span>);
    if (data.selfReports?.length > 0) els.push(<span key="s" style={{ fontSize: '10px' }}>🍽️</span>);
    return els;
  };

  // Pre-fetch visible month on mount / month change
  useEffect(() => {
    const days = generateCalendarDays().filter((d): d is Date => d !== null);
    days.forEach(d => {
      const ds = formatDate(d);
      if (!dayData.has(ds)) fetchDayData(ds);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  const calendarDays = generateCalendarDays();
  const [vmYear, vmMonth] = viewMonth.split('-').map(Number);

  const selectedData = selectedDate ? dayData.get(selectedDate) : null;
  const hasNoRecords = selectedData && (
    !selectedData.checkins?.length &&
    !selectedData.incidents?.length &&
    !selectedData.selfReports?.length &&
    !selectedData.weights?.length
  );

  return (
    <div style={{ padding: '20px', paddingBottom: '80px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button onClick={handlePrevMonth} style={btnStyle}>‹</button>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
          {months[vmMonth - 1]} {vmYear}
        </h2>
        <button onClick={handleNextMonth} style={btnStyle}>›</button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {weekdays.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {calendarDays.map((date, idx) => {
          if (!date) return <div key={idx} style={{ minHeight: '60px' }} />;
          const ds = formatDate(date);
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          const data = dayData.get(ds);

          return (
            <div
              key={idx}
              onClick={() => handleDateClick(ds)}
              style={{
                minHeight: '60px',
                padding: '6px 4px',
                borderRadius: 'var(--radius)',
                border: isToday ? '2px solid #f97316' : '1px solid var(--glass-border)',
                backgroundColor: isSelected ? 'rgba(var(--accent-rgb, 99,102,241),0.15)' : 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: isToday ? 700 : 400, color: isToday ? '#f97316' : undefined, textAlign: 'center' }}>
                {date.getDate()}
              </div>
              {data && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                  {renderBadges(data)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Loading */}
      {loading && selectedDate && (
        <div style={{ marginTop: '20px', padding: '20px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)' }}>
          ⏳ 載入中…
        </div>
      )}

      {/* Day detail */}
      {!loading && selectedDate && selectedData && (
        <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>{selectedDate}</h3>

          {hasNoRecords && (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>{t('calendarNoRecords')}</p>
          )}

          {selectedData.summary?.total > 0 && (
            <section style={{ marginBottom: '14px' }}>
              <h4 style={sectionTitle}>{t('calendarSectionCheckins')}</h4>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                ✅ {selectedData.summary.done} &nbsp;⏭️ {selectedData.summary.skipped} &nbsp;/ {selectedData.summary.total}
                {selectedData.summary.total > 0 && (
                  <span style={{ marginLeft: '8px', color: getRate(selectedData) === 100 ? '#22c55e' : '#eab308', fontWeight: 700 }}>
                    {getRate(selectedData)}%
                  </span>
                )}
              </p>
            </section>
          )}

          {selectedData.selfReports?.length > 0 && (
            <section style={{ marginBottom: '14px' }}>
              <h4 style={sectionTitle}>{t('calendarSectionFeeding')}</h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', color: 'var(--text-muted)' }}>
                {selectedData.selfReports.map(r => (
                  <li key={r.id}>{r.title} × {r.quantity} {r.unit}</li>
                ))}
              </ul>
            </section>
          )}

          {selectedData.incidents?.length > 0 && (
            <section style={{ marginBottom: '14px' }}>
              <h4 style={sectionTitle}>{t('calendarSectionIncidents')}</h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', color: 'var(--text-muted)' }}>
                {selectedData.incidents.map(inc => (
                  <li key={inc.id}>🔴 {inc.type}（{inc.severity}）{inc.note ? `— ${inc.note}` : ''}</li>
                ))}
              </ul>
            </section>
          )}

          {selectedData.weights?.length > 0 && (
            <section>
              <h4 style={sectionTitle}>{t('calendarSectionWeight')}</h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', color: 'var(--text-muted)' }}>
                {selectedData.weights.map(w => (
                  <li key={w.id}>🐱 {w.catWeight} kg</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-card)',
  cursor: 'pointer',
  fontSize: '18px',
  lineHeight: 1,
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
