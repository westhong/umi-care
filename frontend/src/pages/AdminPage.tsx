import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, del, get, post } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { CatProfile, Checkin, Settings, Task } from '../store/useAppStore';

type AdminTab = 'overview' | 'periodic' | 'records' | 'weights' | 'tasks' | 'cat';
type TimelineStatus = 'pending' | 'done' | 'skip';

interface WeightRecord {
  id: string;
  personWeight: number;
  carryWeight: number;
  catWeight: number;
  note?: string;
  measuredAt: string;
}

interface AdhocTask {
  id: string;
  icon: string;
  name: string;
  note?: string;
  createdAt: string;
  done: boolean;
  doneAt?: string;
  doneNote?: string;
}

interface SelfReportRow {
  id: string;
  type: string;
  title: string;
  icon?: string;
  quantity?: number;
  unit?: string;
  note?: string;
  reportedAt: string;
}

interface IncidentRow {
  id: string;
  type: string;
  note?: string;
  hasPhoto?: boolean;
  reportedAt: string;
  resolved?: boolean;
  resolvedAt?: string;
}

interface SpecialPreset {
  id: string;
  icon: string;
  name: string;
  note?: string;
}

interface TimelineRow {
  task: Task;
  checkin?: Checkin;
  status: TimelineStatus;
  scheduledAt?: string;
}

const DEFAULT_PRESETS: SpecialPreset[] = [
  { id: 'litter', icon: '🧹', name: '換貓砂' },
  { id: 'water', icon: '🚰', name: '換水 / 洗水碗' },
  { id: 'feeder', icon: '🤖', name: '檢查飼料機' },
  { id: 'med', icon: '💊', name: '餵藥 / 保健品' },
];

const scheduleLabel: Record<string, string> = {
  daily: '每日',
  weekly: '每週指定日',
  weekdays: '平日',
  weekends: '週末',
};

const weekDayLabels = ['日', '一', '二', '三', '四', '五', '六'];
const resultPresetMap: Record<string, { label: string; value: string }[]> = {
  feed: [
    { label: '乾乾', value: '乾乾' },
    { label: '主食罐', value: '主食罐' },
    { label: '副食罐', value: '副食罐' },
  ],
  treat: [
    { label: '貓條', value: '貓條' },
    { label: '零食', value: '零食' },
    { label: '貓泥', value: '貓泥' },
  ],
  weight: [],
};

function todayLocal() {
  return new Date().toISOString().slice(0, 10);
}

function toClock(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

function toDateTime(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('zh-HK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

function isTaskVisible(task: Task, date = new Date()) {
  const type = task.scheduleType || 'daily';
  const day = date.getDay();
  if (type === 'daily') return true;
  if (type === 'weekly') return task.weekDays?.includes(day) ?? true;
  if (type === 'weekdays') return day >= 1 && day <= 5;
  if (type === 'weekends') return day === 0 || day === 6;
  return true;
}

function taskTitle(task: Task) {
  return `${task.icon || '📋'} ${task.name}`;
}

function formatCountLabel(done: number, total: number) {
  if (!total) return '今天尚無排程';
  if (done >= total) return '今日排程已完成';
  return `還有 ${Math.max(total - done, 0)} 項待處理`;
}

function badgeStyle(tone: 'neutral' | 'danger' | 'warning' | 'success' | 'purple'): React.CSSProperties {
  const tones: Record<string, React.CSSProperties> = {
    neutral: { color: 'var(--text-secondary)', background: 'rgba(61,44,53,0.08)', border: '1px solid rgba(61,44,53,0.08)' },
    danger: { color: '#b91c1c', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)' },
    warning: { color: '#b45309', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.24)' },
    success: { color: '#15803d', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.24)' },
    purple: { color: '#7c3aed', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)' },
  };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    ...tones[tone],
  };
}

const sectionCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius)',
  padding: '16px',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  background: 'var(--bg-card2)',
  border: '1px solid var(--glass-border)',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
  fontFamily: 'var(--font)',
};

const buttonBase: React.CSSProperties = {
  border: '1px solid var(--glass-border)',
  borderRadius: '999px',
  padding: '9px 14px',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
};

const subtleButton: React.CSSProperties = {
  ...buttonBase,
  background: 'var(--glass)',
  color: 'var(--text-secondary)',
};

function ActionButton({
  children,
  tone = 'default',
  onClick,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'danger' | 'success';
  onClick: () => void;
}) {
  const toneStyle: Record<string, React.CSSProperties> = {
    default: subtleButton,
    danger: { ...buttonBase, background: 'rgba(248,113,113,0.08)', color: '#dc2626', border: '1px solid rgba(248,113,113,0.22)' },
    success: { ...buttonBase, background: 'rgba(74,222,128,0.12)', color: '#15803d', border: '1px solid rgba(74,222,128,0.22)' },
  };
  return <button onClick={onClick} style={toneStyle[tone]}>{children}</button>;
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '18px 12px', borderRadius: '16px', background: 'rgba(61,44,53,0.03)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.84rem' }}>
      <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: subtitle ? '4px' : 0 }}>{title}</div>
      {subtitle && <div>{subtitle}</div>}
    </div>
  );
}

function RecordCard({
  title,
  meta,
  chips,
  tone = 'default',
  actions,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  chips?: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  actions?: React.ReactNode;
}) {
  const toneStyle: Record<string, React.CSSProperties> = {
    default: { border: '1px solid rgba(15,23,42,0.06)', background: 'rgba(255,255,255,0.65)' },
    danger: { border: '1px solid rgba(248,113,113,0.22)', background: 'rgba(248,113,113,0.05)' },
    warning: { border: '1px solid rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.05)' },
    success: { border: '1px solid rgba(74,222,128,0.22)', background: 'rgba(74,222,128,0.05)' },
  };

  return (
    <div style={{ borderRadius: '16px', padding: '14px', display: 'grid', gap: '10px', ...toneStyle[tone] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ fontWeight: 700, lineHeight: 1.4 }}>{title}</div>
          {meta && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>{meta}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
      {chips && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{chips}</div>}
    </div>
  );
}

export function AdminPage() {
  const {
    setAdminMode,
    cat,
    settings,
    tasks,
    setTasks,
    setCat,
    setSettings,
  } = useAppStore();

  const catName = cat?.name || settings?.catName || '屋咪';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordsDate, setRecordsDate] = useState(todayLocal());

  const [todayCheckins, setTodayCheckins] = useState<Checkin[]>([]);
  const [recordCheckins, setRecordCheckins] = useState<Checkin[]>([]);
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [adhoc, setAdhoc] = useState<AdhocTask[]>([]);
  const [selfReports, setSelfReports] = useState<SelfReportRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [specialPresets, setSpecialPresets] = useState<SpecialPreset[]>(DEFAULT_PRESETS);

  const [specialForm, setSpecialForm] = useState({ icon: '📌', name: '', note: '' });
  const [catForm, setCatForm] = useState<CatProfile>({ name: catName, breed: '', birthdate: '', notes: '' });
  const [pinForm, setPinForm] = useState({ oldPin: '', newPin: '' });
  const [taskForm, setTaskForm] = useState<{
    id: string;
    name: string;
    icon: string;
    type: string;
    scheduleType: string;
    scheduledTimes: string[];
    newTime: string;
    weekDays: number[];
    requireNote: boolean;
    resultPreset: string;
  }>({
    id: '',
    name: '',
    icon: '📋',
    type: 'other',
    scheduleType: 'daily',
    scheduledTimes: [],
    newTime: '',
    weekDays: [],
    requireNote: false,
    resultPreset: 'none',
  });

  useEffect(() => {
    setCatForm({
      name: cat?.name || settings?.catName || '屋咪',
      breed: cat?.breed || '',
      birthdate: cat?.birthdate || '',
      notes: cat?.notes || '',
    });
  }, [cat, settings?.catName]);

  const loadBaseData = useCallback(async () => {
    const [taskData, catData, settingsData] = await Promise.all([
      get<Task[]>('/api/tasks').catch(() => []),
      get<CatProfile>('/api/cat').catch(() => null),
      get<Settings>('/api/settings').catch(() => null),
    ]);
    setTasks(taskData);
    if (catData) setCat(catData);
    if (settingsData) setSettings(settingsData);
  }, [setCat, setSettings, setTasks]);

  const loadOverview = useCallback(async () => {
    const [checkinsData, adhocData, selfReportData, incidentData] = await Promise.all([
      get<Checkin[]>(`/api/checkins?date=${todayLocal()}`).catch(() => []),
      get<AdhocTask[]>('/api/adhoc').catch(() => []),
      get<SelfReportRow[]>(`/api/selfreports?date=${todayLocal()}`).catch(() => []),
      get<IncidentRow[]>(`/api/incidents?date=${todayLocal()}`).catch(() => []),
    ]);
    setTodayCheckins(checkinsData);
    setAdhoc(adhocData);
    setSelfReports(selfReportData);
    setIncidents(incidentData);
  }, []);

  const loadRecords = useCallback(async (date: string) => {
    const [checkinsData, selfReportData, incidentData, adhocData] = await Promise.all([
      get<Checkin[]>(`/api/checkins?date=${date}`).catch(() => []),
      get<SelfReportRow[]>(`/api/selfreports?date=${date}`).catch(() => []),
      get<IncidentRow[]>(`/api/incidents?date=${date}`).catch(() => []),
      get<AdhocTask[]>('/api/adhoc').catch(() => []),
    ]);
    setRecordCheckins(checkinsData);
    setSelfReports(selfReportData);
    setIncidents(incidentData);
    setAdhoc(adhocData);
  }, []);

  const loadWeights = useCallback(async () => {
    const weightData = await get<WeightRecord[]>('/api/weights').catch(() => []);
    setWeights(weightData);
  }, []);

  const loadSpecialPresets = useCallback(async () => {
    const presetData = await get<SpecialPreset[]>('/api/adhoc/presets').catch(() => DEFAULT_PRESETS);
    setSpecialPresets(Array.isArray(presetData) && presetData.length ? presetData : DEFAULT_PRESETS);
  }, []);

  useEffect(() => {
    Promise.all([loadBaseData(), loadOverview(), loadWeights(), loadSpecialPresets()]).catch(() => undefined);
  }, [loadBaseData, loadOverview, loadWeights, loadSpecialPresets, refreshKey]);

  useEffect(() => {
    if (activeTab === 'records') {
      loadRecords(recordsDate).catch(() => undefined);
    }
    if (activeTab === 'weights') {
      loadWeights().catch(() => undefined);
    }
    if (activeTab === 'periodic') {
      Promise.all([loadSpecialPresets(), loadOverview()]).catch(() => undefined);
    }
  }, [activeTab, recordsDate, loadRecords, loadSpecialPresets, loadOverview, loadWeights, refreshKey]);

  const visibleTasks = useMemo(() => tasks.filter((task) => isTaskVisible(task)), [tasks]);
  const visibleIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks]);
  const todayCheckinMap = useMemo(() => new Map(todayCheckins.map((row) => [row.taskId, row])), [todayCheckins]);
  const doneCount = todayCheckins.filter((row) => row.isDone && visibleIds.has(row.taskId)).length;
  const skipCount = todayCheckins.filter((row) => !row.isDone && visibleIds.has(row.taskId)).length;
  const totalCount = visibleTasks.length;
  const pendingCount = Math.max(totalCount - doneCount - skipCount, 0);
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const latestWeight = weights.length ? weights[weights.length - 1] : null;
  const todayDoneSpecial = adhoc.filter((row) => row.done && row.doneAt?.slice(0, 10) === todayLocal());
  const pendingSpecial = adhoc.filter((row) => !row.done);
  const selectedDateSpecial = adhoc.filter((row) => row.done && row.doneAt?.slice(0, 10) === recordsDate);
  const taskMap = useMemo(() => Object.fromEntries(tasks.map((task) => [task.id, task])), [tasks]);
  const unresolvedIncidents = incidents.filter((row) => !row.resolved);
  const resolvedIncidents = incidents.filter((row) => row.resolved);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows = visibleTasks.map((task) => {
      const checkin = todayCheckinMap.get(task.id);
      const scheduledAt = task.scheduledTimes?.[0] || '';
      const status: TimelineStatus = checkin ? (checkin.isDone ? 'done' : 'skip') : 'pending';
      return { task, checkin, scheduledAt, status };
    });
    const order = { pending: 0, skip: 1, done: 2 };
    return rows.sort((a, b) => {
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return (a.scheduledAt || '').localeCompare(b.scheduledAt || '');
    });
  }, [todayCheckinMap, visibleTasks]);

  const completionSummary = useMemo(() => {
    if (!totalCount) return '今天沒有排程任務';
    if (!pendingCount && !skipCount) return '所有排程任務已完成';
    if (!pendingCount && skipCount) return `所有任務都已處理，其中 ${skipCount} 項為略過`;
    return `${pendingCount} 項待處理${skipCount ? `，${skipCount} 項已略過` : ''}`;
  }, [pendingCount, skipCount, totalCount]);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2600);
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const resetTaskForm = () => {
    setTaskForm({
      id: '',
      name: '',
      icon: '📋',
      type: 'other',
      scheduleType: 'daily',
      scheduledTimes: [],
      newTime: '',
      weekDays: [],
      requireNote: false,
      resultPreset: 'none',
    });
  };

  const editTask = (task: Task) => {
    setTaskForm({
      id: task.id,
      name: task.name,
      icon: task.icon || '📋',
      type: task.type || 'other',
      scheduleType: task.scheduleType || 'daily',
      scheduledTimes: [...(task.scheduledTimes || [])],
      newTime: '',
      weekDays: [...(task.weekDays || [])],
      requireNote: !!task.requireNote,
      resultPreset: task.type && resultPresetMap[task.type] ? task.type : 'none',
    });
    setActiveTab('tasks');
  };

  const saveTask = async () => {
    if (!taskForm.name.trim()) {
      flash('請先輸入任務名稱');
      return;
    }

    const times = [...taskForm.scheduledTimes];
    if (taskForm.newTime && !times.includes(taskForm.newTime)) times.push(taskForm.newTime);
    times.sort();
    if (!times.length) {
      flash('請至少加入一個時間');
      return;
    }

    if (taskForm.scheduleType === 'weekly' && !taskForm.weekDays.length) {
      flash('每週任務請選擇星期');
      return;
    }

    const resultOptions = taskForm.resultPreset !== 'none' ? (resultPresetMap[taskForm.resultPreset] || []) : [];

    const nextTask: Task = {
      id: taskForm.id || `t${Date.now()}`,
      name: taskForm.name.trim(),
      icon: taskForm.icon.trim() || '📋',
      type: taskForm.type,
      scheduleType: taskForm.scheduleType,
      scheduledTimes: times,
      weekDays: taskForm.scheduleType === 'weekly'
        ? [...taskForm.weekDays].sort((a, b) => a - b)
        : taskForm.scheduleType === 'weekdays'
          ? [1, 2, 3, 4, 5]
          : taskForm.scheduleType === 'weekends'
            ? [0, 6]
            : undefined,
      resultOptions,
      requireNote: taskForm.requireNote,
    };

    const nextTasks = taskForm.id
      ? tasks.map((task) => (task.id === taskForm.id ? nextTask : task))
      : [...tasks, nextTask];

    await withBusy(async () => {
      await post('/api/tasks', nextTasks);
      setTasks(nextTasks);
      flash(taskForm.id ? '任務已更新' : '任務已新增');
      resetTaskForm();
      setRefreshKey((value) => value + 1);
    });
  };

  const removeTask = async (taskId: string) => {
    const task = tasks.find((row) => row.id === taskId);
    if (!task || !window.confirm(`刪除任務：${task.name}？`)) return;
    const nextTasks = tasks.filter((row) => row.id !== taskId);
    await withBusy(async () => {
      await post('/api/tasks', nextTasks);
      setTasks(nextTasks);
      if (taskForm.id === taskId) resetTaskForm();
      flash('任務已刪除');
      setRefreshKey((value) => value + 1);
    });
  };

  const deleteCheckin = async (taskId: string) => {
    if (!window.confirm('確定刪除此打卡紀錄？')) return;
    await withBusy(async () => {
      await del(`/api/checkins?date=${recordsDate}&taskId=${encodeURIComponent(taskId)}`);
      flash('已刪除紀錄');
      await Promise.all([loadRecords(recordsDate), loadOverview()]);
    });
  };

  const deleteSelfReport = async (id: string) => {
    if (!window.confirm('刪除此主動回報？')) return;
    await withBusy(async () => {
      await del(`/api/selfreports/${id}`);
      flash('已刪除主動回報');
      await Promise.all([loadRecords(recordsDate), loadOverview()]);
    });
  };

  const resolveIncident = async (id: string) => {
    await withBusy(async () => {
      await post(`/api/incidents/${id}/resolve`, {});
      flash('已標記為處理完成');
      await Promise.all([loadRecords(recordsDate), loadOverview()]);
    });
  };

  const deleteIncident = async (id: string) => {
    if (!window.confirm('刪除此異常回報？')) return;
    await withBusy(async () => {
      await del(`/api/incidents/${id}`);
      flash('已刪除異常回報');
      await Promise.all([loadRecords(recordsDate), loadOverview()]);
    });
  };

  const dispatchSpecialTask = async () => {
    if (!specialForm.name.trim()) {
      flash('請輸入特殊任務名稱');
      return;
    }
    await withBusy(async () => {
      await post('/api/adhoc', {
        icon: specialForm.icon.trim() || '📌',
        name: specialForm.name.trim(),
        note: specialForm.note.trim(),
      });
      setSpecialForm({ icon: '📌', name: '', note: '' });
      flash('特殊任務已派發');
      await loadOverview();
    });
  };

  const deleteSpecialTask = async (id: string) => {
    if (!window.confirm('刪除此特殊任務？')) return;
    await withBusy(async () => {
      await del(`/api/adhoc/${id}`);
      flash('特殊任務已刪除');
      await loadOverview();
      if (activeTab === 'records') await loadRecords(recordsDate);
    });
  };

  const saveCatProfile = async () => {
    if (!catForm.name?.trim()) {
      flash('請輸入貓咪名稱');
      return;
    }
    await withBusy(async () => {
      const payload = {
        name: catForm.name.trim(),
        breed: catForm.breed?.trim() || '',
        birthdate: catForm.birthdate || '',
        notes: catForm.notes?.trim() || '',
      };
      await post('/api/cat', payload);
      setCat(payload);
      flash('貓咪資料已儲存');
      setRefreshKey((value) => value + 1);
    });
  };

  const saveQuickSettings = async () => {
    await withBusy(async () => {
      const nextSettings = {
        ...settings,
        catName: catForm.name.trim() || catName,
      } as Settings;
      await post('/api/settings', nextSettings);
      setSettings(nextSettings);
      flash('設定已更新');
    });
  };

  const changePin = async () => {
    if (!pinForm.oldPin || !pinForm.newPin) {
      flash('請輸入舊 PIN 與新 PIN');
      return;
    }
    await withBusy(async () => {
      const res = await api<{ ok?: boolean; error?: string }>('/api/pin/change', {
        method: 'POST',
        body: JSON.stringify(pinForm),
      });
      if (!res.ok) throw new Error(res.error || 'PIN 變更失敗');
      setPinForm({ oldPin: '', newPin: '' });
      flash('PIN 已更新');
    });
  };

  const savePresets = async (nextPresets: SpecialPreset[]) => {
    setSpecialPresets(nextPresets);
    try {
      await post('/api/adhoc/presets', nextPresets);
    } catch {
      flash('預設快捷任務暫時未能儲存');
    }
  };

  const addCurrentAsPreset = async () => {
    if (!specialForm.name.trim()) {
      flash('先輸入任務名稱才可存成快捷');
      return;
    }
    const nextPresets = [
      ...specialPresets,
      {
        id: `preset_${Date.now()}`,
        icon: specialForm.icon.trim() || '📌',
        name: specialForm.name.trim(),
        note: specialForm.note.trim(),
      },
    ];
    await savePresets(nextPresets);
    flash('已加入快捷任務');
  };

  const openIncidentPhoto = (id: string) => {
    window.open(`/api/incidents/${id}/photo`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ paddingBottom: '28px' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, #c084fc 100%)',
        padding: '22px 20px 18px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>🛠️ 管理員模式</div>
            <div style={{ fontSize: '0.82rem', opacity: 0.92, marginTop: '4px', lineHeight: 1.5 }}>
              {todayLocal()} · {catName} · {formatCountLabel(doneCount, totalCount)}
            </div>
          </div>
          <button
            onClick={() => setAdminMode(false)}
            style={{
              background: 'rgba(255,255,255,0.22)', border: 'none', color: '#fff',
              borderRadius: '20px', padding: '8px 16px', fontSize: '0.82rem',
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            🚪 登出
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: '8px' }}>
          {[
            { label: '完成', value: `${doneCount}/${totalCount || 0}`, sub: `${pct}%`, color: '#4ade80' },
            { label: '待做', value: pendingCount, sub: pendingCount ? '需要跟進' : '已清空', color: '#fde68a' },
            { label: '異常 / 回報', value: `${unresolvedIncidents.length}/${selfReports.length}`, sub: '未解 / 今日回報', color: unresolvedIncidents.length ? '#fecaca' : '#f5f5f5' },
            { label: '最新體重', value: latestWeight ? `${latestWeight.catWeight}kg` : '—', sub: latestWeight ? toDateTime(latestWeight.measuredAt) : '尚未記錄', color: '#f5f5f5' },
          ].map((item) => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.16)', borderRadius: '14px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.7rem', opacity: 0.82 }}>{item.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: item.color, marginTop: '4px' }}>{item.value}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.74, marginTop: '2px' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '16px' }}>
          {[
            ['overview', '📊 今日概覽'],
            ['periodic', '✨ 特殊任務'],
            ['records', '📋 歷史紀錄'],
            ['weights', '⚖️ 體重'],
            ['tasks', '✏️ 任務排程'],
            ['cat', '🐾 貓咪&設定'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as AdminTab)}
              style={{
                ...buttonBase,
                background: activeTab === key ? 'linear-gradient(135deg, var(--primary), #c084fc)' : 'var(--glass)',
                color: activeTab === key ? '#fff' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {message && (
          <div style={{
            marginBottom: '12px',
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.28)',
            color: '#15803d',
            borderRadius: '12px',
            padding: '10px 12px',
            fontSize: '0.82rem',
          }}>
            {message}
          </div>
        )}

        {busy && (
          <div style={{ marginBottom: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>⏳ 儲存中…</div>
        )}

        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {(unresolvedIncidents.length > 0 || selfReports.length > 0) && (
              <div style={{ display: 'grid', gap: '12px' }}>
                {!!unresolvedIncidents.length && (
                  <div style={{ ...sectionCard, borderColor: 'rgba(248,113,113,0.38)', background: 'linear-gradient(135deg, rgba(248,113,113,0.09), rgba(248,113,113,0.03))', borderTop: '4px solid #ef4444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#b91c1c' }}>🆘 異常案件置頂</div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(153,27,27,0.78)' }}>未處理案件會優先顯示，避免被一般記錄淹沒。</div>
                      </div>
                      <span style={badgeStyle('danger')}>{unresolvedIncidents.length} 則待處理</span>
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {unresolvedIncidents.map((row) => (
                        <RecordCard
                          key={row.id}
                          tone="danger"
                          title={<>{row.hasPhoto ? '📷 ' : ''}{row.type}</>}
                          meta={<>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</>}
                          chips={
                            <>
                              <span style={badgeStyle('danger')}>待處理</span>
                              {row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}
                            </>
                          }
                          actions={
                            <>
                              {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                              <ActionButton tone="success" onClick={() => resolveIncident(row.id)}>✅ 標記完成</ActionButton>
                            </>
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!!selfReports.length && (
                  <div style={{ ...sectionCard, borderColor: 'rgba(245,158,11,0.34)', background: 'linear-gradient(135deg, rgba(245,158,11,0.09), rgba(251,191,36,0.03))', borderTop: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#92400e' }}>📝 今日主動回報</div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(146,64,14,0.78)' }}>沿用舊版 pinned 提醒感，先看回報再看一般流水帳。</div>
                      </div>
                      <span style={badgeStyle('warning')}>{selfReports.length} 則回報</span>
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {selfReports.map((row) => (
                        <RecordCard
                          key={row.id}
                          tone="warning"
                          title={<>{row.icon || '📝'} {row.title}{row.quantity ? ` ×${row.quantity}${row.unit || ''}` : ''}</>}
                          meta={<>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</>}
                          chips={<span style={badgeStyle('warning')}>{row.type || 'self-report'}</span>}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ ...sectionCard, display: 'grid', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800 }}>今日照護總覽</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{completionSummary}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={badgeStyle('success')}>完成 {doneCount}</span>
                  <span style={badgeStyle('warning')}>待處理 {pendingCount}</span>
                  {skipCount > 0 && <span style={badgeStyle('neutral')}>略過 {skipCount}</span>}
                  <button onClick={() => setRefreshKey((value) => value + 1)} style={subtleButton}>🔄 重新整理</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {[
                  { label: '完成率', value: `${pct}%`, tone: 'success' as const },
                  { label: '待處理', value: pendingCount, tone: 'warning' as const },
                  { label: '今日特殊任務完成', value: todayDoneSpecial.length, tone: 'purple' as const },
                  { label: '未完成特殊任務', value: pendingSpecial.length, tone: 'neutral' as const },
                ].map((item) => (
                  <div key={item.label} style={{ borderRadius: '16px', padding: '12px', background: 'rgba(61,44,53,0.03)', border: '1px solid rgba(61,44,53,0.04)' }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.label}</div>
                    <div style={{ fontSize: '1.18rem', fontWeight: 800, marginTop: '4px' }}>{item.value}</div>
                    <div style={{ marginTop: '8px' }}><span style={badgeStyle(item.tone)}>{item.label}</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...sectionCard, display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>⏱️ 任務時間線</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>待處理會置頂，已完成與略過往下收斂，資訊層級更接近舊版 admin 的掃描感。</div>
                </div>
                <span style={badgeStyle(pendingCount ? 'warning' : 'success')}>
                  {pendingCount ? `${pendingCount} 項優先處理` : '全部已處理'}
                </span>
              </div>

              {timelineRows.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {timelineRows.map((row) => {
                    const isPending = row.status === 'pending';
                    const isSkip = row.status === 'skip';
                    const statusLabel = isPending ? '待處理' : isSkip ? '已略過' : '已完成';
                    const tone = isPending ? 'warning' : isSkip ? 'neutral' : 'success';
                    return (
                      <div
                        key={row.task.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr auto',
                          gap: '12px',
                          alignItems: 'flex-start',
                          padding: '14px',
                          borderRadius: '18px',
                          border: isPending
                            ? '1px solid rgba(245,158,11,0.24)'
                            : isSkip
                              ? '1px solid rgba(61,44,53,0.10)'
                              : '1px solid rgba(74,222,128,0.22)',
                          background: isPending
                            ? 'rgba(245,158,11,0.06)'
                            : isSkip
                              ? 'rgba(61,44,53,0.03)'
                              : 'rgba(74,222,128,0.05)',
                        }}
                      >
                        <div style={{ width: '36px', height: '36px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,0.08)', fontSize: '1.1rem' }}>
                          {row.task.icon || '📋'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700 }}>{row.task.name}</div>
                            <span style={badgeStyle(tone)}>{statusLabel}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                            預定 {(row.task.scheduledTimes || []).join(' / ') || '—'}
                            {row.checkin?.time ? ` · ${row.checkin.isDone ? '完成' : '略過'}時間 ${toClock(row.checkin.time)}` : ''}
                            {row.checkin?.result ? ` · ${row.checkin.result}` : ''}
                            {row.checkin?.note ? ` · ${row.checkin.note}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {row.scheduledAt || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="今天沒有可顯示的排程任務" subtitle="如果剛更新任務排程，重新整理後會同步顯示。" />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              <div style={{ ...sectionCard, display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800 }}>✨ 今日完成的特殊任務</div>
                  <span style={badgeStyle('purple')}>{todayDoneSpecial.length} 筆</span>
                </div>
                {todayDoneSpecial.length ? todayDoneSpecial.map((row) => (
                  <RecordCard
                    key={row.id}
                    tone="default"
                    title={<>{row.icon} {row.name}</>}
                    meta={<>{toDateTime(row.doneAt)}{row.doneNote ? ` · ${row.doneNote}` : row.note ? ` · 派發備註：${row.note}` : ''}</>}
                    chips={<span style={badgeStyle('success')}>已完成</span>}
                  />
                )) : <EmptyState title="今天還沒有特殊任務完成紀錄" subtitle="派發後由照護者完成，就會出現在這裡。" />}
              </div>

              <div style={{ ...sectionCard, display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800 }}>📌 仍在等待的特殊任務</div>
                  <span style={badgeStyle(pendingSpecial.length ? 'warning' : 'neutral')}>{pendingSpecial.length} 筆</span>
                </div>
                {pendingSpecial.length ? pendingSpecial.map((row) => (
                  <RecordCard
                    key={row.id}
                    tone="warning"
                    title={<>{row.icon} {row.name}</>}
                    meta={<>{toDateTime(row.createdAt)}{row.note ? ` · ${row.note}` : ''}</>}
                    chips={<span style={badgeStyle('warning')}>待完成</span>}
                    actions={<ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑 刪除</ActionButton>}
                  />
                )) : <EmptyState title="目前沒有待完成的特殊任務" subtitle="這區塊會凸顯尚未被照護者完成的派發項目。" />}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ ...sectionCard, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>選擇日期</label>
                <input type="date" value={recordsDate} onChange={(e) => setRecordsDate(e.target.value)} style={{ ...inputStyle, maxWidth: '220px' }} />
                <button onClick={() => loadRecords(recordsDate)} style={subtleButton}>🔄 刷新</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={badgeStyle('neutral')}>打卡 {recordCheckins.length}</span>
                <span style={badgeStyle('warning')}>回報 {selfReports.length}</span>
                <span style={badgeStyle(unresolvedIncidents.length ? 'danger' : 'neutral')}>異常 {incidents.length}</span>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>📋 任務打卡紀錄</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>把狀態、時間、結果與備註拆開顯示，閱讀比單行文字更清楚。</div>
                </div>
                <span style={badgeStyle('neutral')}>{recordCheckins.length} 筆</span>
              </div>
              {recordCheckins.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {recordCheckins.map((row) => {
                    const task = taskMap[row.taskId] || { id: row.taskId, name: row.taskId, icon: '📋', type: 'other', scheduleType: 'daily', scheduledTimes: [] };
                    return (
                      <RecordCard
                        key={`${row.taskId}-${row.time}`}
                        tone={row.isDone ? 'success' : 'default'}
                        title={<>{task.icon || '📋'} {task.name}</>}
                        meta={<>{toClock(row.time)}{row.note ? ` · ${row.note}` : ''}</>}
                        chips={
                          <>
                            <span style={badgeStyle(row.isDone ? 'success' : 'neutral')}>{row.isDone ? '完成' : '略過'}</span>
                            {row.result && <span style={badgeStyle('purple')}>{row.result}</span>}
                            {!!task.scheduledTimes?.length && <span style={badgeStyle('neutral')}>預定 {(task.scheduledTimes || []).join(' / ')}</span>}
                          </>
                        }
                        actions={<ActionButton tone="danger" onClick={() => deleteCheckin(row.taskId)}>🗑 刪除</ActionButton>}
                      />
                    );
                  })}
                </div>
              ) : <EmptyState title="這天沒有打卡紀錄" subtitle="照護者一旦完成或略過任務，就會出現在這裡。" />}
            </div>

            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>📝 主動回報</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>加上類型 tag 與數量資訊，接近舊版 records 的辨識方式。</div>
                </div>
                <span style={badgeStyle('warning')}>{selfReports.length} 筆</span>
              </div>
              {selfReports.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {selfReports.map((row) => (
                    <RecordCard
                      key={row.id}
                      tone="warning"
                      title={<>{row.icon || '📝'} {row.title}{row.quantity ? ` ×${row.quantity}${row.unit || ''}` : ''}</>}
                      meta={<>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</>}
                      chips={<span style={badgeStyle('warning')}>{row.type || 'self-report'}</span>}
                      actions={<ActionButton tone="danger" onClick={() => deleteSelfReport(row.id)}>🗑 刪除</ActionButton>}
                    />
                  ))}
                </div>
              ) : <EmptyState title="這天沒有主動回報" subtitle="餵食、零食或其他自動回報會統一整理在這裡。" />}
            </div>

            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>✨ 特殊任務紀錄</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>把派發備註與完成備註分開標示，方便快速確認執行結果。</div>
                </div>
                <span style={badgeStyle('purple')}>{selectedDateSpecial.length} 筆</span>
              </div>
              {selectedDateSpecial.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {selectedDateSpecial.map((row) => (
                    <RecordCard
                      key={row.id}
                      tone="default"
                      title={<>{row.icon} {row.name}</>}
                      meta={<>{toDateTime(row.doneAt)}</>}
                      chips={
                        <>
                          {row.note && <span style={badgeStyle('neutral')}>派發：{row.note}</span>}
                          {row.doneNote && <span style={badgeStyle('success')}>完成：{row.doneNote}</span>}
                        </>
                      }
                      actions={<ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑 刪除</ActionButton>}
                    />
                  ))}
                </div>
              ) : <EmptyState title="這天沒有特殊任務完成紀錄" subtitle="派發但未完成的任務仍會留在今日概覽與特殊任務頁。" />}
            </div>

            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>🆘 異常回報</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>未處理與已處理狀態以明確 badge 區分，操作按鈕靠右集中。</div>
                </div>
                <span style={badgeStyle(unresolvedIncidents.length ? 'danger' : 'neutral')}>
                  未處理 {unresolvedIncidents.length} / 全部 {incidents.length}
                </span>
              </div>
              {incidents.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {[...unresolvedIncidents, ...resolvedIncidents].map((row) => (
                    <RecordCard
                      key={row.id}
                      tone={row.resolved ? 'success' : 'danger'}
                      title={<>{row.resolved ? '✅' : '🆘'} {row.type}</>}
                      meta={<>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}{row.resolvedAt ? ` · 已於 ${toDateTime(row.resolvedAt)} 處理` : ''}</>}
                      chips={
                        <>
                          <span style={badgeStyle(row.resolved ? 'success' : 'danger')}>{row.resolved ? '已處理' : '待處理'}</span>
                          {row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}
                        </>
                      }
                      actions={
                        <>
                          {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                          {!row.resolved && <ActionButton tone="success" onClick={() => resolveIncident(row.id)}>✅ 處理</ActionButton>}
                          <ActionButton tone="danger" onClick={() => deleteIncident(row.id)}>🗑 刪除</ActionButton>
                        </>
                      }
                    />
                  ))}
                </div>
              ) : <EmptyState title="這天沒有異常回報" subtitle="若照護者提交嘔吐／異常狀況，會出現在這裡並可直接處理。" />}
            </div>
          </div>
        )}

        {activeTab === 'weights' && (
          <div style={sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: 800 }}>⚖️ 體重紀錄</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>沿用既有 /api/weights 資料</div>
              </div>
              <button onClick={() => loadWeights()} style={subtleButton}>🔄 刷新</button>
            </div>
            {weights.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 6px' }}>日期</th>
                      <th style={{ padding: '8px 6px' }}>人重</th>
                      <th style={{ padding: '8px 6px' }}>抱貓重</th>
                      <th style={{ padding: '8px 6px' }}>{catName} 體重</th>
                      <th style={{ padding: '8px 6px' }}>備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...weights].reverse().map((row) => (
                      <tr key={row.id || row.measuredAt} style={{ borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                        <td style={{ padding: '8px 6px' }}>{toDateTime(row.measuredAt)}</td>
                        <td style={{ padding: '8px 6px' }}>{row.personWeight} kg</td>
                        <td style={{ padding: '8px 6px' }}>{row.carryWeight} kg</td>
                        <td style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--primary)' }}>{row.catWeight} kg</td>
                        <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{row.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="目前沒有體重紀錄" subtitle="照護者完成體重任務後，這裡會自動累積記錄。" />
            )}
          </div>
        )}

        {activeTab === 'tasks' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>{taskForm.id ? '✏️ 編輯任務' : '＋ 新增任務'}</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '10px' }}>
                  <input value={taskForm.icon} onChange={(e) => setTaskForm((s) => ({ ...s, icon: e.target.value }))} style={inputStyle} placeholder="圖示" />
                  <input value={taskForm.name} onChange={(e) => setTaskForm((s) => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="任務名稱" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <select value={taskForm.type} onChange={(e) => setTaskForm((s) => ({ ...s, type: e.target.value }))} style={inputStyle}>
                    <option value="other">一般</option>
                    <option value="feed">餵食</option>
                    <option value="treat">零食</option>
                    <option value="weight">量體重</option>
                    <option value="clean">清潔</option>
                  </select>
                  <select value={taskForm.scheduleType} onChange={(e) => setTaskForm((s) => ({ ...s, scheduleType: e.target.value }))} style={inputStyle}>
                    <option value="daily">每日</option>
                    <option value="weekly">每週指定日</option>
                    <option value="weekdays">平日</option>
                    <option value="weekends">週末</option>
                  </select>
                </div>
                {taskForm.scheduleType === 'weekly' && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {weekDayLabels.map((label, index) => {
                      const active = taskForm.weekDays.includes(index);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setTaskForm((s) => ({
                            ...s,
                            weekDays: active ? s.weekDays.filter((day) => day !== index) : [...s.weekDays, index],
                          }))}
                          style={{
                            ...buttonBase,
                            padding: '8px 12px',
                            background: active ? 'linear-gradient(135deg, var(--primary), #c084fc)' : 'var(--glass)',
                            color: active ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input type="time" value={taskForm.newTime} onChange={(e) => setTaskForm((s) => ({ ...s, newTime: e.target.value }))} style={{ ...inputStyle, maxWidth: '160px' }} />
                  <button
                    type="button"
                    onClick={() => {
                      if (!taskForm.newTime || taskForm.scheduledTimes.includes(taskForm.newTime)) return;
                      setTaskForm((s) => ({ ...s, scheduledTimes: [...s.scheduledTimes, s.newTime].sort(), newTime: '' }));
                    }}
                    style={subtleButton}
                  >
                    ＋ 加入時間
                  </button>
                </div>
                {!!taskForm.scheduledTimes.length && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {taskForm.scheduledTimes.map((time) => (
                      <span key={time} style={{ background: 'rgba(255,133,161,0.12)', border: '1px solid rgba(255,133,161,0.24)', color: 'var(--primary)', borderRadius: '999px', padding: '6px 10px', fontSize: '0.78rem' }}>
                        {time}
                        <button type="button" onClick={() => setTaskForm((s) => ({ ...s, scheduledTimes: s.scheduledTimes.filter((item) => item !== time) }))} style={{ marginLeft: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
                  <select value={taskForm.resultPreset} onChange={(e) => setTaskForm((s) => ({ ...s, resultPreset: e.target.value }))} style={inputStyle}>
                    <option value="none">不需要結果選項</option>
                    <option value="feed">餵食結果</option>
                    <option value="treat">零食結果</option>
                    <option value="weight">量體重</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={taskForm.requireNote} onChange={(e) => setTaskForm((s) => ({ ...s, requireNote: e.target.checked }))} />
                    需要備註
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={saveTask} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>💾 儲存任務</button>
                  <button onClick={resetTaskForm} style={subtleButton}>↺ 清空表單</button>
                </div>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>現有任務</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>把排程與星期資訊直接壓成 tag，比原本純文字更容易掃描。</div>
                </div>
                <span style={badgeStyle('neutral')}>{tasks.length} 項</span>
              </div>
              {tasks.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {tasks.map((task) => (
                    <RecordCard
                      key={task.id}
                      title={<>{taskTitle(task)}</>}
                      meta={<>{scheduleLabel[task.scheduleType || 'daily'] || '每日'}{task.weekDays?.length ? ` · ${task.weekDays.map((day) => weekDayLabels[day]).join('、')}` : ''}</>}
                      chips={
                        <>
                          {(task.scheduledTimes || []).map((time) => <span key={time} style={badgeStyle('purple')}>{time}</span>)}
                          {task.requireNote && <span style={badgeStyle('warning')}>需備註</span>}
                          {task.type && <span style={badgeStyle('neutral')}>{task.type}</span>}
                        </>
                      }
                      actions={
                        <>
                          <ActionButton onClick={() => editTask(task)}>✏️ 編輯</ActionButton>
                          <ActionButton tone="danger" onClick={() => removeTask(task.id)}>🗑 刪除</ActionButton>
                        </>
                      }
                    />
                  ))}
                </div>
              ) : <EmptyState title="目前沒有任務" subtitle="新增後會同步到照護者今日任務與 admin 概覽。" />}
            </div>
          </div>
        )}

        {activeTab === 'periodic' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>✨ 派發特殊任務</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {specialPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSpecialForm({ icon: preset.icon, name: preset.name, note: preset.note || '' })}
                    style={subtleButton}
                  >
                    {preset.icon} {preset.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '10px' }}>
                  <input value={specialForm.icon} onChange={(e) => setSpecialForm((s) => ({ ...s, icon: e.target.value }))} style={inputStyle} placeholder="圖示" />
                  <input value={specialForm.name} onChange={(e) => setSpecialForm((s) => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="任務名稱（例：換貓砂）" />
                </div>
                <textarea value={specialForm.note} onChange={(e) => setSpecialForm((s) => ({ ...s, note: e.target.value }))} rows={3} style={inputStyle} placeholder="備註（選填）" />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={dispatchSpecialTask} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>🚀 立即派發</button>
                  <button onClick={addCurrentAsPreset} style={subtleButton}>💾 存成快捷</button>
                </div>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>目前待處理特殊任務</div>
              {pendingSpecial.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {pendingSpecial.map((row) => (
                    <RecordCard
                      key={row.id}
                      tone="warning"
                      title={<>{row.icon} {row.name}</>}
                      meta={<>{toDateTime(row.createdAt)}{row.note ? ` · ${row.note}` : ''}</>}
                      chips={<span style={badgeStyle('warning')}>待完成</span>}
                      actions={<ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑 刪除</ActionButton>}
                    />
                  ))}
                </div>
              ) : <EmptyState title="目前沒有待完成的特殊任務" subtitle="派發後會留在這裡，直到完成或刪除。" />}
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>快捷任務管理</div>
              {specialPresets.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {specialPresets.map((preset) => (
                    <RecordCard
                      key={preset.id}
                      title={<>{preset.icon} {preset.name}</>}
                      meta={<>{preset.note || '—'}</>}
                      actions={<ActionButton tone="danger" onClick={() => savePresets(specialPresets.filter((row) => row.id !== preset.id))}>✕ 移除</ActionButton>}
                    />
                  ))}
                </div>
              ) : <EmptyState title="尚未建立快捷任務" subtitle="把常用的特殊任務存成快捷，下次派發會快很多。" />}
            </div>
          </div>
        )}

        {activeTab === 'cat' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>🐾 貓咪資料</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <input value={catForm.name || ''} onChange={(e) => setCatForm((s) => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="名字" />
                <input value={catForm.breed || ''} onChange={(e) => setCatForm((s) => ({ ...s, breed: e.target.value }))} style={inputStyle} placeholder="品種" />
                <input type="date" value={catForm.birthdate || ''} onChange={(e) => setCatForm((s) => ({ ...s, birthdate: e.target.value }))} style={inputStyle} />
                <textarea value={catForm.notes || ''} onChange={(e) => setCatForm((s) => ({ ...s, notes: e.target.value }))} rows={4} style={inputStyle} placeholder="備註" />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={saveCatProfile} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>💾 儲存貓咪資料</button>
                  <button onClick={saveQuickSettings} style={subtleButton}>⚙️ 同步系統設定</button>
                </div>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>🔐 變更管理員 PIN</div>
              <div style={{ display: 'grid', gap: '10px', maxWidth: '360px' }}>
                <input type="password" value={pinForm.oldPin} onChange={(e) => setPinForm((s) => ({ ...s, oldPin: e.target.value }))} style={inputStyle} placeholder="舊 PIN" />
                <input type="password" value={pinForm.newPin} onChange={(e) => setPinForm((s) => ({ ...s, newPin: e.target.value }))} style={inputStyle} placeholder="新 PIN（至少 4 位）" />
                <button onClick={changePin} style={{ ...subtleButton, width: 'fit-content' }}>🔄 更新 PIN</button>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '8px' }}>系統摘要</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <div>App 版本：{settings?.appVersion || '5.x'}</div>
                <div>預設貓名：{settings?.catName || catName}</div>
                <div>上次記錄人重：{settings?.lastPersonWeight ?? '—'} kg</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
