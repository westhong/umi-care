import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { get, post } from '../api/client';
import { ProgressRing } from '../components/ProgressRing';
import { TaskCard } from '../components/TaskCard';
import { useT } from '../i18n';
import type { Task, Checkin, SelfReport } from '../store/useAppStore';
import { getTaskStatus } from '../utils/taskStatus';
import { requestPushPermission, unsubscribePush, isSubscribed, listenPushSound } from '../utils/pushNotify';
import { LitterCounter, encodeLitterResult, formatLitterSummary } from '../components/LitterCounter';
import type { LitterCounts } from '../components/LitterCounter';

interface TasksPageProps {
  onAdminOpen: () => void;
}

type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
type SelfReportType = 'treat' | 'dry' | 'canned' | 'other';

const weekdayLabels = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

const selfReportTypeConfig: Record<SelfReportType, { icon: string; severity: 'low' | 'medium'; defaultTitle: Record<'zh' | 'en', string>; unit: Record<'zh' | 'en', string>; quickQuantities: number[] }> = {
  treat: {
    icon: '🦴',
    severity: 'low',
    defaultTitle: { zh: '吃了零食 / 貓條', en: 'Had treats / Churu' },
    unit: { zh: '條', en: 'pcs' },
    quickQuantities: [1, 2, 3, 4],
  },
  dry: {
    icon: '🍚',
    severity: 'low',
    defaultTitle: { zh: '吃了乾糧', en: 'Had dry food / kibble' },
    unit: { zh: '份', en: 'servings' },
    quickQuantities: [0.5, 1, 1.5, 2],
  },
  canned: {
    icon: '🥫',
    severity: 'low',
    defaultTitle: { zh: '吃了主食罐 / 濕食', en: 'Had wet food / canned food' },
    unit: { zh: '份', en: 'servings' },
    quickQuantities: [0.5, 1, 1.5, 2],
  },
  other: {
    icon: '📝',
    severity: 'medium',
    defaultTitle: { zh: '其他主動回報', en: 'Other caregiver report' },
    unit: { zh: '次', en: 'times' },
    quickQuantities: [1, 2, 3],
  },
};

export function TasksPage({ onAdminOpen }: TasksPageProps) {
  const { tasks, checkins, cat, catName, settings, currentDate, setTasks, setCheckins, lang, setLang } = useAppStore();
  const t = useT(lang);

  const [loading, setLoading] = useState(true);
  const [todayDate, setTodayDate] = useState('');
  const [pushStatus, setPushStatus] = useState<'unknown' | 'subscribed' | 'denied' | 'unsupported'>('unknown');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showSelfReportModal, setShowSelfReportModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ type: '', severity: 'medium' as IncidentSeverity, note: '', photo: '' });
  const [selfReports, setSelfReports] = useState<SelfReport[]>([]);
  const [submittingSelfReport, setSubmittingSelfReport] = useState(false);
  const [showLitterModal, setShowLitterModal] = useState(false);
  const [litterCounts, setLitterCounts] = useState<LitterCounts>({ poop: 0, pee: 0 });
  const [submittingLitter, setSubmittingLitter] = useState(false);
  const [disablingPush, setDisablingPush] = useState(false);
  const [selfReportForm, setSelfReportForm] = useState({
    type: 'treat' as SelfReportType,
    title: '',
    quantity: '1',
    note: '',
  });

  const applySelfReportPreset = useCallback((type: SelfReportType) => {
    const preset = selfReportTypeConfig[type];
    setSelfReportForm((prev) => ({
      ...prev,
      type,
      title: preset.defaultTitle[lang],
      quantity: String(preset.quickQuantities[0] ?? 1),
      note: type === 'canned'
        ? (lang === 'zh' ? '可補充口味 / 吃了多少' : 'You can add flavor / how much was eaten')
        : '',
    }));
  }, [lang]);

  useEffect(() => {
    const now = new Date();
    setTodayDate(
      t(
        'todayDateWeekday',
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        weekdayLabels[lang][now.getDay()],
      ),
    );

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      isSubscribed().then((ok) => setPushStatus(ok ? 'subscribed' : 'unknown'));
    } else {
      setPushStatus('unsupported');
    }

    listenPushSound();
  }, [lang, t]);

  useEffect(() => {
    setSelfReportForm((prev) => {
      const preset = selfReportTypeConfig[prev.type];
      const prevPresetTitles = Object.values(preset.defaultTitle);
      const title = prev.title && !prevPresetTitles.includes(prev.title)
        ? prev.title
        : preset.defaultTitle[lang];
      return { ...prev, title };
    });
  }, [lang]);

  const handlePushEnable = async () => {
    if (!('Notification' in window)) { setPushStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setPushStatus('denied'); return; }
    const ok = await requestPushPermission();
    setPushStatus(ok ? 'subscribed' : 'denied');
  };

  const handlePushDisable = async () => {
    setDisablingPush(true);
    await unsubscribePush();
    setDisablingPush(false);
    setPushStatus('unknown');
  };

  const submitLitterReport = async () => {
    setSubmittingLitter(true);
    const encoded = encodeLitterResult(litterCounts);
    const titleParts: string[] = [];
    if (litterCounts.poop > 0) titleParts.push(`💩×${litterCounts.poop}`);
    if (litterCounts.pee > 0) titleParts.push(`💦×${litterCounts.pee}`);
    const summary = titleParts.length > 0 ? titleParts.join(' ') : t('litterClean');
    try {
      await post('/api/selfreports', {
        type: 'litter',
        severity: 'low',
        title: `🪣 ${lang === 'en' ? 'Litter scooped' : '已鏟貓砂'} — ${summary}`,
        icon: '🪣',
        quantity: 1,
        unit: '',
        note: encoded,
        reportedAt: new Date().toISOString(),
      });
      setShowLitterModal(false);
      setLitterCounts({ poop: 0, pee: 0 });
      await loadData();
    } catch {
      alert(t('selfReportSubmitFailed'));
    } finally {
      setSubmittingLitter(false);
    }
  };

  const submitIncident = async () => {
    if (!incidentForm.type.trim()) {
      alert(t('incidentTypeRequired'));
      return;
    }
    try {
      await post('/api/incidents', {
        type: incidentForm.type.trim(),
        severity: incidentForm.severity,
        note: incidentForm.note.trim(),
        photo: incidentForm.photo || undefined,
        reportedAt: new Date().toISOString(),
      });
      setShowIncidentModal(false);
      setIncidentForm({ type: '', severity: 'medium', note: '', photo: '' });
      alert(t('incidentSubmitted'));
    } catch {
      alert(t('incidentSubmitFailed'));
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksData, checkinsData, selfReportData] = await Promise.all([
        get<Task[]>('/api/tasks'),
        get<Checkin[]>(`/api/checkins?date=${currentDate}`),
        get<SelfReport[]>(`/api/selfreports?date=${currentDate}`).catch(() => []),
      ]);
      setTasks(tasksData);
      setCheckins(checkinsData);
      setSelfReports(selfReportData);
    } finally {
      setLoading(false);
    }
  }, [currentDate, setTasks, setCheckins]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const timer = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadData]);

  const visibleTasks = tasks.filter((task) => {
    const scheduleType = task.scheduleType || 'daily';
    const day = new Date().getDay();
    if (scheduleType === 'daily') return true;
    if (scheduleType === 'weekly') return task.weekDays?.includes(day) ?? true;
    if (scheduleType === 'weekdays') return day >= 1 && day <= 5;
    if (scheduleType === 'weekends') return day === 0 || day === 6;
    return true;
  });

  const visibleIds = new Set(visibleTasks.map((task) => task.id));
  const total = visibleTasks.length;
  const done = checkins.filter((checkin) => checkin.isDone && visibleIds.has(checkin.taskId)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const msgs = [t('progressMsg0'), t('progressMsg1'), t('progressMsg2'), t('progressMsg3'), t('progressMsg4')];
  const idx = pct === 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct > 0 ? 1 : 0;

  const getCheckin = (task: Task) => checkins.find((checkin) => checkin.taskId === task.id);
  const pendingTasks = visibleTasks.filter((task) => getTaskStatus(getCheckin(task), task.scheduledTimes) === 'pending');
  const overdueTasks = visibleTasks.filter((task) => getTaskStatus(getCheckin(task), task.scheduledTimes) === 'overdue');
  const doneTasks = visibleTasks.filter((task) => {
    const status = getTaskStatus(getCheckin(task), task.scheduledTimes);
    return status === 'done' || status === 'skip';
  });

  const recentSelfReports = useMemo(() => selfReports.slice(0, 4), [selfReports]);
  const activeSelfReportPreset = selfReportTypeConfig[selfReportForm.type];

  const submitSelfReport = async () => {
    const type = selfReportForm.type;
    const title = selfReportForm.title.trim();
    const quantity = Number(selfReportForm.quantity);
    if (!type) {
      alert(t('selfReportTypeRequired'));
      return;
    }
    if (!title) {
      alert(t('selfReportTitleRequired'));
      return;
    }

    setSubmittingSelfReport(true);
    try {
      await post('/api/selfreports', {
        type,
        severity: activeSelfReportPreset.severity,
        title,
        icon: activeSelfReportPreset.icon,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: activeSelfReportPreset.unit[lang],
        note: selfReportForm.note.trim(),
        reportedAt: new Date().toISOString(),
      });
      setShowSelfReportModal(false);
      applySelfReportPreset(type);
      setSelfReportForm((prev) => ({ ...prev, note: '' }));
      await loadData();
      alert(t('selfReportSubmitted'));
    } catch {
      alert(t('selfReportSubmitFailed'));
    } finally {
      setSubmittingSelfReport(false);
    }
  };

  return (
    <div style={{ paddingBottom: '80px' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(135deg, #ff85a1 0%, #c8a8e9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('appTitle')}
          </h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{todayDate}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,133,161,0.2)', borderRadius: '999px' }} aria-label={t('caregiverLanguageHint')}>
            <button
              type="button"
              onClick={() => setLang('zh')}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '7px 10px',
                background: lang === 'zh' ? 'linear-gradient(135deg, #ff85a1, #c8a8e9)' : 'transparent',
                color: lang === 'zh' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              中
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '7px 10px',
                background: lang === 'en' ? 'linear-gradient(135deg, #ff85a1, #c8a8e9)' : 'transparent',
                color: lang === 'en' ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              EN
            </button>
          </div>
          <span style={{ fontSize: '0.6rem', fontFamily: 'var(--mono)', background: 'rgba(255,133,161,0.15)', color: 'var(--text-muted)', border: '1px solid rgba(255,133,161,0.25)', borderRadius: '10px', padding: '2px 7px' }}>
            v{settings?.appVersion || '5.x'}
          </span>
          <div
            onClick={onAdminOpen}
            style={{ width: '40px', height: '40px', background: 'rgba(255,133,161,0.12)', border: '1px solid rgba(255,133,161,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.1rem' }}
            title={t('adminTitle')}
          >
            🔐
          </div>
        </div>
      </div>

      {pushStatus === 'unknown' && (
        <div style={{ margin: '14px 16px 0', background: 'rgba(102,126,234,0.1)', border: '1px solid rgba(102,126,234,0.3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('pushEnableHint')}</span>
          <button onClick={handlePushEnable} style={{ padding: '7px 14px', borderRadius: '20px', border: 'none', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}>
            {t('pushEnableBtn')}
          </button>
        </div>
      )}
      {pushStatus === 'subscribed' && (
        <div style={{ margin: '14px 16px 0', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.78rem', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span>{t('pushEnabled')}</span>
          <button onClick={handlePushDisable} disabled={disablingPush} style={{ padding: '5px 12px', borderRadius: '20px', border: '1px solid rgba(74,222,128,0.4)', background: 'transparent', color: '#4ade80', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
            {disablingPush ? t('pushDisabling') : t('pushDisableBtn')}
          </button>
        </div>
      )}
      {pushStatus === 'denied' && <div style={{ margin: '14px 16px 0', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.78rem', color: '#f87171' }}>{t('pushDenied')}</div>}

      <ProgressRing pct={pct} done={done} total={total} catName={cat?.name || catName} sub={msgs[idx]} />

      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary)', fontWeight: 700, marginBottom: '10px' }}>
          {t('quickReportTitle')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {/* Incident */}
          <button
            onClick={() => setShowIncidentModal(true)}
            style={{ padding: '14px 6px', border: '1.5px solid rgba(239,68,68,0.35)', borderRadius: '14px', background: 'rgba(239,68,68,0.07)', color: '#ef4444', fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', lineHeight: 1.3 }}
          >
            <span style={{ fontSize: '1.5rem' }}>🆘</span>
            <span>{lang === 'en' ? 'Incident' : '異常上報'}</span>
          </button>
          {/* Feed */}
          <button
            onClick={() => { applySelfReportPreset('treat'); setShowSelfReportModal(true); }}
            style={{ padding: '14px 6px', border: '1.5px solid rgba(251,146,60,0.35)', borderRadius: '14px', background: 'rgba(251,146,60,0.07)', color: '#f97316', fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', lineHeight: 1.3 }}
          >
            <span style={{ fontSize: '1.5rem' }}>🍽️</span>
            <span>{lang === 'en' ? 'Fed cat' : '餵食紀錄'}</span>
          </button>
          {/* Litter */}
          <button
            onClick={() => { setLitterCounts({ poop: 0, pee: 0 }); setShowLitterModal(true); }}
            style={{ padding: '14px 6px', border: '1.5px solid rgba(161,161,170,0.35)', borderRadius: '14px', background: 'rgba(161,161,170,0.07)', color: '#71717a', fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', lineHeight: 1.3 }}
          >
            <span style={{ fontSize: '1.5rem' }}>🪣</span>
            <span>{lang === 'en' ? 'Litter' : '清貓砂'}</span>
          </button>
        </div>
        <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(255,133,161,0.14)', borderRadius: '16px', padding: '12px 12px 10px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>{t('selfReportRecentTitle')}</div>
          {recentSelfReports.length ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {recentSelfReports.map((report) => (
                <div key={report.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,133,161,0.06)', borderRadius: '12px', padding: '10px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {(() => {
                        if (report.type === 'litter') {
                          const summary = formatLitterSummary(report.note, t('litterClean'));
                          return `🪣 ${lang === 'en' ? 'Litter scooped' : '已鏟貓砂'} — ${summary}`;
                        }
                        const preset = selfReportTypeConfig[report.type as SelfReportType];
                        const title = preset ? preset.defaultTitle[lang] : report.title;
                        const unit = preset ? preset.unit[lang] : (report.unit || '');
                        return `${report.icon} ${title}${report.quantity ? ` ×${report.quantity}${unit}` : ''}`;
                      })()}
                    </div>
                    {report.note && (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>{report.note}</div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                    {new Date(report.reportedAt).toLocaleTimeString(lang === 'zh' ? 'zh-HK' : 'en-CA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('selfReportRecentEmpty')}</div>
          )}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : (
          <>
            {overdueTasks.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 10px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t('overdueSection', overdueTasks.length)}</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(245,158,11,0.35)' }} />
                </div>
                {overdueTasks.map((task) => <TaskCard key={task.id} task={task} checkin={getCheckin(task)} caregiverDate={currentDate} onCheckinUpdate={loadData} />)}
              </>
            )}

            {pendingTasks.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: `${overdueTasks.length > 0 ? '16px' : '0'} 0 10px` }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--primary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t('pendingSection', pendingTasks.length)}</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,133,161,0.25)' }} />
                </div>
                {pendingTasks.map((task) => <TaskCard key={task.id} task={task} checkin={getCheckin(task)} caregiverDate={currentDate} onCheckinUpdate={loadData} />)}
              </>
            )}

            {pendingTasks.length === 0 && overdueTasks.length === 0 && doneTasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('noTasks')}</div>
            )}

            {doneTasks.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0 10px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#4ade80', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t('doneSection', doneTasks.length)}</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(74,222,128,0.25)' }} />
                </div>
                {doneTasks.map((task) => <TaskCard key={task.id} task={task} checkin={getCheckin(task)} caregiverDate={currentDate} onCheckinUpdate={loadData} />)}
              </>
            )}
          </>
        )}
      </div>

      {showLitterModal && (
        <div onClick={() => setShowLitterModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(29, 19, 28, 0.48)', backdropFilter: 'blur(10px)', display: 'grid', alignItems: 'end', zIndex: 999 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '18px 16px 32px', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gap: '16px' }}>
            <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'rgba(61,44,53,0.14)', margin: '0 auto' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('litterReportBtn')}</div>
            <LitterCounter
              counts={litterCounts}
              onChange={setLitterCounts}
              poopLabel={t('litterPoopLabel')}
              peeLabel={t('litterPeeLabel')}
              cleanLabel={t('litterClean')}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={submitLitterReport} disabled={submittingLitter} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '16px', background: 'linear-gradient(135deg, #ff85a1, #c8a8e9)', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', opacity: submittingLitter ? 0.7 : 1 }}>
                {submittingLitter ? t('submitting') : t('litterDoneBtn')}
              </button>
              <button onClick={() => setShowLitterModal(false)} style={{ padding: '13px 18px', border: '1px solid var(--glass-border)', borderRadius: '16px', background: 'var(--glass)', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {t('cancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelfReportModal && (
        <div onClick={() => setShowSelfReportModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(29, 19, 28, 0.48)', backdropFilter: 'blur(10px)', display: 'grid', alignItems: 'end', zIndex: 999 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '18px 16px 28px', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gap: '14px' }}>
            <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'rgba(61,44,53,0.14)', margin: '0 auto' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('selfReportModalTitle')}</div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>{t('selfReportTypeLabel')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {([
                    { value: 'treat', label: t('selfReportTypeTreat'), icon: '🦴' },
                    { value: 'dry', label: t('selfReportTypeDry'), icon: '🍚' },
                    { value: 'canned', label: t('selfReportTypeCanned'), icon: '🥫' },
                    { value: 'other', label: t('selfReportTypeOther'), icon: '📝' },
                  ] as const).map((type) => {
                    const active = selfReportForm.type === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => applySelfReportPreset(type.value)}
                        style={{
                          padding: '11px 10px',
                          border: active ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          background: active ? 'rgba(255,133,161,0.12)' : 'var(--glass)',
                          color: active ? 'var(--primary)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font)',
                          fontSize: '0.82rem',
                          fontWeight: active ? 700 : 600,
                          cursor: 'pointer',
                        }}
                      >
                        {type.icon} {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>{t('selfReportQuickAmount')}</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {activeSelfReportPreset.quickQuantities.map((qty) => {
                    const active = selfReportForm.quantity === String(qty);
                    return (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setSelfReportForm((prev) => ({ ...prev, quantity: String(qty) }))}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '999px',
                          border: active ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                          background: active ? 'rgba(255,133,161,0.12)' : 'var(--glass)',
                          color: active ? 'var(--primary)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font)',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {qty}{activeSelfReportPreset.unit[lang]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('selfReportQtyLabel')}</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={selfReportForm.quantity}
                    onChange={(e) => setSelfReportForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    style={{ width: '100%', padding: '11px 12px', background: 'var(--bg-card2)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'var(--font)', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('selfReportTitleLabel')}</label>
                  <input
                    type="text"
                    value={selfReportForm.title}
                    onChange={(e) => setSelfReportForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder={t('selfReportTitlePlaceholder')}
                    style={{ width: '100%', padding: '11px 12px', background: 'var(--bg-card2)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'var(--font)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('selfReportNoteLabel')}</label>
                <textarea
                  value={selfReportForm.note}
                  onChange={(e) => setSelfReportForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={3}
                  placeholder={t('selfReportNotePlaceholder')}
                  style={{ width: '100%', padding: '11px 12px', background: 'var(--bg-card2)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'var(--font)', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button onClick={submitSelfReport} disabled={submittingSelfReport} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '16px', background: 'linear-gradient(135deg, #ff85a1, #c8a8e9)', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', opacity: submittingSelfReport ? 0.7 : 1 }}>
                {submittingSelfReport ? t('submitting') : t('selfReportSubmitBtn')}
              </button>
              <button onClick={() => setShowSelfReportModal(false)} style={{ padding: '13px 18px', border: '1px solid var(--glass-border)', borderRadius: '16px', background: 'var(--glass)', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {t('cancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIncidentModal && (
        <div onClick={() => setShowIncidentModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(29, 19, 28, 0.48)', backdropFilter: 'blur(10px)', display: 'grid', alignItems: 'end', zIndex: 999 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '18px 16px 28px', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gap: '14px' }}>
            <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'rgba(61,44,53,0.14)', margin: '0 auto' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('incidentModalTitle')}</div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('incidentTypeLabel')}</label>
                <input
                  type="text"
                  value={incidentForm.type}
                  onChange={(e) => setIncidentForm((s) => ({ ...s, type: e.target.value }))}
                  placeholder={t('incidentTypePlaceholder')}
                  style={{ width: '100%', padding: '11px 12px', background: 'var(--bg-card2)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'var(--font)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>{t('incidentSeverityLabel')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { value: 'low', label: t('incidentSeverityLow'), color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
                    { value: 'medium', label: t('incidentSeverityMedium'), color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    { value: 'high', label: t('incidentSeverityHigh'), color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                    { value: 'critical', label: t('incidentSeverityCritical'), color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
                  ].map((sev) => (
                    <button
                      key={sev.value}
                      type="button"
                      onClick={() => setIncidentForm((s) => ({ ...s, severity: sev.value as IncidentSeverity }))}
                      style={{
                        padding: '10px', border: incidentForm.severity === sev.value ? `2px solid ${sev.color}` : '1px solid var(--glass-border)',
                        borderRadius: '12px', background: incidentForm.severity === sev.value ? sev.bg : 'var(--glass)', color: incidentForm.severity === sev.value ? sev.color : 'var(--text-secondary)',
                        fontFamily: 'var(--font)', fontSize: '0.88rem', fontWeight: incidentForm.severity === sev.value ? 700 : 600, cursor: 'pointer', transition: 'all 0.2s',
                      }}
                    >
                      🚨 {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('incidentNoteLabel')}</label>
                <textarea
                  value={incidentForm.note}
                  onChange={(e) => setIncidentForm((s) => ({ ...s, note: e.target.value }))}
                  rows={3}
                  placeholder={t('incidentNotePlaceholder')}
                  style={{ width: '100%', padding: '11px 12px', background: 'var(--bg-card2)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'var(--font)', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>

              <div>
                <label
                  htmlFor="incident-photo-input"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '12px', border: incidentForm.photo ? '2px solid #f59e0b' : '1px solid var(--glass-border)', background: incidentForm.photo ? 'rgba(245,158,11,0.1)' : 'var(--glass)', color: incidentForm.photo ? '#f59e0b' : 'var(--text-secondary)', fontFamily: 'var(--font)', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {incidentForm.photo ? t('incidentPhotoAdded') : t('incidentAddPhoto')}
                </label>
                <input
                  id="incident-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setIncidentForm((s) => ({ ...s, photo: reader.result as string }));
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                {incidentForm.photo && (
                  <div style={{ marginTop: '8px', position: 'relative', display: 'inline-block' }}>
                    <img src={incidentForm.photo} alt="preview" style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '10px', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => setIncidentForm((s) => ({ ...s, photo: '' }))}
                      style={{ position: 'absolute', top: '4px', right: '4px', border: 'none', borderRadius: '999px', background: 'rgba(0,0,0,0.55)', color: '#fff', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.75rem' }}
                    >✕</button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button onClick={submitIncident} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '16px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {t('incidentSubmitBtn')}
              </button>
              <button onClick={() => { setShowIncidentModal(false); setIncidentForm({ type: '', severity: 'medium', note: '', photo: '' }); }} style={{ padding: '13px 18px', border: '1px solid var(--glass-border)', borderRadius: '16px', background: 'var(--glass)', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {t('cancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
