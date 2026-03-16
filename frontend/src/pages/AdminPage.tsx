import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, del, get, post } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { CatProfile, Checkin, Settings, Task } from '../store/useAppStore';

type AdminTab = 'overview' | 'periodic' | 'records' | 'weights' | 'tasks' | 'cat';

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
    if (taskData.length) setTasks(taskData);
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

  return (
    <div style={{ paddingBottom: '28px' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, #c084fc 100%)',
        padding: '20px 20px 16px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>🛠️ 管理員模式</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.92 }}>
              {todayLocal()} · {catName} · {doneCount}/{totalCount} 完成 ({pct}%)
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
          {[
            { label: '完成', value: doneCount, color: '#4ade80' },
            { label: '待做', value: pendingCount, color: '#fbbf24' },
            { label: '特殊任務', value: pendingSpecial.length, color: '#f472b6' },
            { label: '最新體重', value: latestWeight ? `${latestWeight.catWeight}kg` : '—', color: '#f5f5f5' },
          ].map((item) => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.16)', borderRadius: '14px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{item.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: item.color }}>{item.value}</div>
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
            {!!incidents.some((row) => !row.resolved) && (
              <div style={{ ...sectionCard, borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.05)' }}>
                <div style={{ fontWeight: 800, color: '#dc2626', marginBottom: '10px' }}>🆘 今日異常回報</div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {incidents.filter((row) => !row.resolved).map((row) => (
                    <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{row.type}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</div>
                      </div>
                      <button onClick={() => resolveIncident(row.id)} style={{ ...buttonBase, background: '#fff' }}>✅ 已處理</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ ...sectionCard, paddingBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>今日任務概覽</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{catName} 的照護摘要</div>
                </div>
                <button onClick={() => setRefreshKey((value) => value + 1)} style={buttonBase}>🔄 重新整理</button>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {visibleTasks.map((task) => {
                  const checkin = todayCheckins.find((row) => row.taskId === task.id);
                  const status = checkin ? (checkin.isDone ? 'done' : 'skip') : 'pending';
                  const statusText = status === 'done' ? '✅ 已完成' : status === 'skip' ? '⏭️ 略過' : '🕘 待處理';
                  const statusColor = status === 'done' ? '#16a34a' : status === 'skip' ? '#ea580c' : '#6b7280';
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{taskTitle(task)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {(task.scheduledTimes || []).join(' / ') || '—'}
                          {checkin?.time ? ` · ${toClock(checkin.time)}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: statusColor }}>{statusText}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
              <div style={sectionCard}>
                <div style={{ fontWeight: 800, marginBottom: '8px' }}>✨ 今日完成的特殊任務</div>
                {todayDoneSpecial.length ? todayDoneSpecial.map((row) => (
                  <div key={row.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                    <div style={{ fontWeight: 600 }}>{row.icon} {row.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{toDateTime(row.doneAt)}{row.doneNote ? ` · ${row.doneNote}` : ''}</div>
                  </div>
                )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>今天還沒有完成的特殊任務。</div>}
              </div>
              <div style={sectionCard}>
                <div style={{ fontWeight: 800, marginBottom: '8px' }}>🍽️ / 📝 主動回報</div>
                {selfReports.length ? selfReports.map((row) => (
                  <div key={row.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                    <div style={{ fontWeight: 600 }}>{row.icon || '📝'} {row.title}{row.quantity ? ` ×${row.quantity}${row.unit || ''}` : ''}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</div>
                  </div>
                )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>今日尚無主動回報。</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ ...sectionCard, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>選擇日期</label>
              <input type="date" value={recordsDate} onChange={(e) => setRecordsDate(e.target.value)} style={{ ...inputStyle, maxWidth: '220px' }} />
              <button onClick={() => loadRecords(recordsDate)} style={buttonBase}>🔄 刷新</button>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '10px' }}>📋 任務打卡紀錄</div>
              {recordCheckins.length ? recordCheckins.map((row) => (
                <div key={`${row.taskId}-${row.time}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{taskTitle(taskMap[row.taskId] || { id: row.taskId, name: row.taskId, icon: '📋', type: 'other', scheduleType: 'daily', scheduledTimes: [] })}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {row.isDone ? '✅ 完成' : '⏭️ 略過'} · {toClock(row.time)}
                      {row.result ? ` · ${row.result}` : ''}
                      {row.note ? ` · ${row.note}` : ''}
                    </div>
                  </div>
                  <button onClick={() => deleteCheckin(row.taskId)} style={buttonBase}>🗑 刪除</button>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>這天沒有打卡紀錄。</div>}
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '10px' }}>📝 主動回報</div>
              {selfReports.length ? selfReports.map((row) => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.icon || '📝'} {row.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</div>
                  </div>
                  <button onClick={() => deleteSelfReport(row.id)} style={buttonBase}>🗑 刪除</button>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>這天沒有主動回報。</div>}
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '10px' }}>✨ 特殊任務紀錄</div>
              {selectedDateSpecial.length ? selectedDateSpecial.map((row) => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.icon} {row.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{toDateTime(row.doneAt)}{row.note ? ` · 派發備註：${row.note}` : ''}{row.doneNote ? ` · 完成備註：${row.doneNote}` : ''}</div>
                  </div>
                  <button onClick={() => deleteSpecialTask(row.id)} style={buttonBase}>🗑 刪除</button>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>這天沒有特殊任務完成紀錄。</div>}
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '10px' }}>🆘 異常回報</div>
              {incidents.length ? incidents.map((row) => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.resolved ? '✅' : '🆘'} {row.type}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}{row.hasPhoto ? ' · 有照片' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!row.resolved && <button onClick={() => resolveIncident(row.id)} style={buttonBase}>✅ 處理</button>}
                    <button onClick={() => deleteIncident(row.id)} style={buttonBase}>🗑 刪除</button>
                  </div>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>這天沒有異常回報。</div>}
            </div>
          </div>
        )}

        {activeTab === 'weights' && (
          <div style={sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 800 }}>⚖️ 體重紀錄</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>沿用既有 /api/weights 資料</div>
              </div>
              <button onClick={() => loadWeights()} style={buttonBase}>🔄 刷新</button>
            </div>
            {weights.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
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
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>目前沒有體重紀錄。</div>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="time" value={taskForm.newTime} onChange={(e) => setTaskForm((s) => ({ ...s, newTime: e.target.value }))} style={{ ...inputStyle, maxWidth: '160px' }} />
                  <button
                    type="button"
                    onClick={() => {
                      if (!taskForm.newTime || taskForm.scheduledTimes.includes(taskForm.newTime)) return;
                      setTaskForm((s) => ({ ...s, scheduledTimes: [...s.scheduledTimes, s.newTime].sort(), newTime: '' }));
                    }}
                    style={buttonBase}
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
                  <button onClick={resetTaskForm} style={buttonBase}>↺ 清空表單</button>
                </div>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>現有任務</div>
              {tasks.length ? tasks.map((task) => (
                <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{taskTitle(task)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {scheduleLabel[task.scheduleType || 'daily'] || '每日'}
                      {task.weekDays?.length ? ` · ${task.weekDays.map((day) => weekDayLabels[day]).join('、')}` : ''}
                      {' · '}
                      {(task.scheduledTimes || []).join(' / ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => editTask(task)} style={buttonBase}>✏️ 編輯</button>
                    <button onClick={() => removeTask(task.id)} style={buttonBase}>🗑 刪除</button>
                  </div>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>目前沒有任務。</div>}
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
                    style={buttonBase}
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
                  <button onClick={addCurrentAsPreset} style={buttonBase}>💾 存成快捷</button>
                </div>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>目前待處理特殊任務</div>
              {pendingSpecial.length ? pendingSpecial.map((row) => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.icon} {row.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{toDateTime(row.createdAt)}{row.note ? ` · ${row.note}` : ''}</div>
                  </div>
                  <button onClick={() => deleteSpecialTask(row.id)} style={buttonBase}>🗑 刪除</button>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>目前沒有待完成的特殊任務。</div>}
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>快捷任務管理</div>
              {specialPresets.length ? specialPresets.map((preset) => (
                <div key={preset.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid rgba(15,23,42,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{preset.icon} {preset.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{preset.note || '—'}</div>
                  </div>
                  <button onClick={() => savePresets(specialPresets.filter((row) => row.id !== preset.id))} style={buttonBase}>✕ 移除</button>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>尚未建立快捷任務。</div>}
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
                  <button onClick={saveQuickSettings} style={buttonBase}>⚙️ 同步系統設定</button>
                </div>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>🔐 變更管理員 PIN</div>
              <div style={{ display: 'grid', gap: '10px', maxWidth: '360px' }}>
                <input type="password" value={pinForm.oldPin} onChange={(e) => setPinForm((s) => ({ ...s, oldPin: e.target.value }))} style={inputStyle} placeholder="舊 PIN" />
                <input type="password" value={pinForm.newPin} onChange={(e) => setPinForm((s) => ({ ...s, newPin: e.target.value }))} style={inputStyle} placeholder="新 PIN（至少 4 位）" />
                <button onClick={changePin} style={{ ...buttonBase, width: 'fit-content' }}>🔄 更新 PIN</button>
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
