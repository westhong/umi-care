import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { del, get, post } from '../api/client';
import { getTaskStatus, type TaskStatus } from '../utils/taskStatus';
import { useAppStore } from '../store/useAppStore';
import type { CatProfile, Checkin, Settings, Task } from '../store/useAppStore';

type AdminTab = 'overview' | 'periodic' | 'records' | 'weights' | 'tasks' | 'cat';
type TimelineStatus = TaskStatus;

interface WeightRecord {
  id: string;
  personWeight: number;
  carryWeight: number;
  catWeight: number;
  note?: string;
  measuredAt: string;
}

interface PeriodicTask {
  id: string;
  icon: string;
  name: string;
  nameEn?: string;
  note?: string;
  intervalDays?: number;
  weeklyMax?: number;
  weeklyCount?: number;
  weekStart?: string | null;
  lastDoneAt: string | null;
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
  severity?: 'low' | 'medium' | 'high';
  title: string;
  icon?: string;
  quantity?: number;
  unit?: string;
  note?: string;
  reportedAt: string;
  acknowledged?: boolean;
  acknowledgedAt?: string;
  acknowledgedNote?: string;
  processingStatus?: 'pending' | 'in-progress' | 'completed';
}

interface RecordStreamItem {
  id: string;
  kind: 'checkin' | 'selfReport' | 'incident' | 'adhoc';
  timestamp: string;
  tone: 'default' | 'danger' | 'warning' | 'success';
  lane: 'attention' | 'report' | 'routine';
  title: React.ReactNode;
  meta?: React.ReactNode;
  chips?: React.ReactNode;
  detailBody?: React.ReactNode;
  actions?: React.ReactNode;
}

interface IncidentRow {
  id: string;
  type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  note?: string;
  hasPhoto?: boolean;
  reportedAt: string;
  resolved?: boolean;
  resolvedAt?: string;
  resolvedNote?: string;
  resolutionTemplate?: string | null;
}

interface SpecialPreset {
  id: string;
  icon: string;
  name: string;
  note?: string;
}

interface ResolutionTemplate {
  id: string;
  label: string;
  note: string;
}

interface TimelineRow {
  task: Task;
  checkin?: Checkin;
  status: TimelineStatus;
  scheduledAt?: string;
}

interface DetailModalState {
  title: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  meta?: React.ReactNode;
  chips?: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
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
  // Use Calgary (Mountain) time to match worker and useAppStore
  const now = new Date();
  const year = now.getUTCFullYear();
  const dstStart = (() => {
    const d = new Date(Date.UTC(year, 2, 1));
    let sundays = 0;
    while (sundays < 2) {
      if (d.getUTCDay() === 0) sundays++;
      if (sundays < 2) d.setUTCDate(d.getUTCDate() + 1);
    }
    d.setUTCHours(9, 0, 0, 0);
    return d;
  })();
  const dstEnd = (() => {
    const d = new Date(Date.UTC(year, 10, 1));
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(8, 0, 0, 0);
    return d;
  })();
  const offset = (now >= dstStart && now < dstEnd) ? -6 : -7;
  const c = new Date(now.getTime() + offset * 3600000);
  return `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, '0')}-${String(c.getUTCDate()).padStart(2, '0')}`;
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

function getTimeGroup(timestamp: string, granular = false): string {
  try {
    const hour = new Date(timestamp).getHours();
    if (granular) {
      // Hourly buckets for more granular view
      if (hour >= 0 && hour < 3) return '🌙 深夜 (00:00-02:59)';
      if (hour >= 3 && hour < 6) return '🌃 清晨 (03:00-05:59)';
      if (hour >= 6 && hour < 9) return '🌅 早晨 (06:00-08:59)';
      if (hour >= 9 && hour < 12) return '☀️ 上午 (09:00-11:59)';
      if (hour >= 12 && hour < 15) return '☀️ 中午 (12:00-14:59)';
      if (hour >= 15 && hour < 18) return '🌤️ 下午 (15:00-17:59)';
      if (hour >= 18 && hour < 21) return '🌆 傍晚 (18:00-20:59)';
      return '🌙 晚上 (21:00-23:59)';
    }
    // Default 4-period grouping
    if (hour >= 5 && hour < 12) return '🌅 早上 (05:00-11:59)';
    if (hour >= 12 && hour < 17) return '☀️ 下午 (12:00-16:59)';
    if (hour >= 17 && hour < 21) return '🌆 傍晚 (17:00-20:59)';
    return '🌙 晚上 (21:00-04:59)';
  } catch {
    return '🕐 時間未知';
  }
}

function getSeverityBadge(severity?: string) {
  const severityMap = {
    low: { label: '低', tone: 'neutral' as const },
    medium: { label: '中', tone: 'warning' as const },
    high: { label: '高', tone: 'danger' as const },
    critical: { label: '緊急', tone: 'danger' as const },
  };
  const config = severityMap[severity as keyof typeof severityMap] || severityMap.medium;
  return <span style={badgeStyle(config.tone)}>🚨 {config.label}</span>;
}

const DEFAULT_RESOLUTION_TEMPLATES: ResolutionTemplate[] = [
  { id: 'monitor', label: '持續觀察', note: '已知悉，將持續觀察狀況變化' },
  { id: 'vet_contact', label: '聯絡獸醫', note: '已聯絡獸醫諮詢，待進一步指示' },
  { id: 'med_given', label: '已給藥', note: '已按處方給予藥物' },
  { id: 'cleaned', label: '已清理', note: '已清理現場並消毒' },
  { id: 'diet_adjust', label: '調整飲食', note: '已調整飲食內容，暫停零食' },
  { id: 'resolved', label: '問題解決', note: '問題已獲解決，恢復正常' },
];

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
  onClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  chips?: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  actions?: React.ReactNode;
  onClick?: () => void;
}) {
  const toneStyle: Record<string, React.CSSProperties> = {
    default: { border: '1px solid rgba(15,23,42,0.06)', background: 'rgba(255,255,255,0.65)' },
    danger: { border: '1px solid rgba(248,113,113,0.22)', background: 'rgba(248,113,113,0.05)' },
    warning: { border: '1px solid rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.05)' },
    success: { border: '1px solid rgba(74,222,128,0.22)', background: 'rgba(74,222,128,0.05)' },
  };

  return (
    <div
      onClick={onClick}
      style={{ borderRadius: '16px', padding: '14px', display: 'grid', gap: '10px', ...toneStyle[tone], cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ fontWeight: 700, lineHeight: 1.4 }}>{title}</div>
          {meta && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>{meta}</div>}
        </div>
        {actions && <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
      {chips && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{chips}</div>}
    </div>
  );
}

export function AdminPage({ onLogout }: { onLogout?: () => void }) {
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
  const taskFormRef = useRef<HTMLDivElement>(null);
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
  const [allUnresolvedIncidents, setAllUnresolvedIncidents] = useState<IncidentRow[]>([]);
  const [specialPresets, setSpecialPresets] = useState<SpecialPreset[]>(DEFAULT_PRESETS);
  const [resolutionTemplates, setResolutionTemplates] = useState<ResolutionTemplate[]>(DEFAULT_RESOLUTION_TEMPLATES);
  const [detailModal, setDetailModal] = useState<DetailModalState | null>(null);
  const [recordsFilter, setRecordsFilter] = useState<'all' | 'attention' | 'checkins' | 'reports' | 'incidents' | 'special'>('all');
  const [granularTime, setGranularTime] = useState(false);

  const [periodicTasks, setPeriodicTasks] = useState<PeriodicTask[]>([]);
  const [weightForm, setWeightForm] = useState({ personWeight: '', carryWeight: '', note: '' });

  const [specialForm, setSpecialForm] = useState({ icon: '📌', name: '', note: '' });
  const [templateDraft, setTemplateDraft] = useState<ResolutionTemplate>({ id: '', label: '', note: '' });
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

  useEffect(() => {
    if (settings?.adminGranularTimeGrouping !== undefined) {
      setGranularTime(!!settings.adminGranularTimeGrouping);
    }
  }, [settings?.adminGranularTimeGrouping]);

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
    const [checkinsData, adhocData, selfReportData, incidentData, allIncidentData] = await Promise.all([
      get<Checkin[]>(`/api/checkins?date=${todayLocal()}`).catch(() => []),
      get<AdhocTask[]>('/api/adhoc').catch(() => []),
      get<SelfReportRow[]>(`/api/selfreports?date=${todayLocal()}`).catch(() => []),
      get<IncidentRow[]>(`/api/incidents?date=${todayLocal()}`).catch(() => []),
      get<IncidentRow[]>('/api/incidents').catch(() => []),
    ]);
    setTodayCheckins(checkinsData);
    setAdhoc(adhocData);
    setSelfReports(selfReportData);
    setIncidents(incidentData);
    setAllUnresolvedIncidents(allIncidentData.filter((inc) => !inc.resolved));
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

  const loadResolutionTemplates = useCallback(async () => {
    const templateData = await get<ResolutionTemplate[]>('/api/resolution-templates').catch(() => DEFAULT_RESOLUTION_TEMPLATES);
    setResolutionTemplates(Array.isArray(templateData) && templateData.length ? templateData : DEFAULT_RESOLUTION_TEMPLATES);
  }, []);

  const loadPeriodicTasks = useCallback(async () => {
    const data = await get<PeriodicTask[]>('/api/periodic').catch(() => []);
    setPeriodicTasks(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    Promise.all([loadBaseData(), loadOverview(), loadWeights(), loadSpecialPresets(), loadResolutionTemplates(), loadPeriodicTasks()]).catch(() => undefined);
  }, [loadBaseData, loadOverview, loadWeights, loadSpecialPresets, loadResolutionTemplates, loadPeriodicTasks, refreshKey]);

  useEffect(() => {
    if (activeTab === 'overview') {
      loadOverview().catch(() => undefined);
    }
    if (activeTab === 'records') {
      loadRecords(recordsDate).catch(() => undefined);
    }
    if (activeTab === 'weights') {
      loadWeights().catch(() => undefined);
    }
    if (activeTab === 'periodic') {
      Promise.all([loadSpecialPresets(), loadOverview(), loadPeriodicTasks()]).catch(() => undefined);
    }
  }, [activeTab, recordsDate, loadRecords, loadSpecialPresets, loadOverview, loadWeights, loadPeriodicTasks, refreshKey]);

  const visibleTasks = useMemo(() => tasks.filter((task) => isTaskVisible(task)), [tasks]);
  const visibleIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks]);
  const todayCheckinMap = useMemo(() => new Map(todayCheckins.map((row) => [row.taskId, row])), [todayCheckins]);
  const doneCount = todayCheckins.filter((row) => row.isDone && visibleIds.has(row.taskId)).length;
  const skipCount = todayCheckins.filter((row) => !row.isDone && visibleIds.has(row.taskId)).length;
  const totalCount = visibleTasks.length;
  const pendingCount = Math.max(totalCount - doneCount - skipCount, 0);
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const latestWeight = weights.length ? weights[weights.length - 1] : null;
  const previousWeight = weights.length > 1 ? weights[weights.length - 2] : null;
  const weightDelta = latestWeight && previousWeight ? Number((latestWeight.catWeight - previousWeight.catWeight).toFixed(2)) : null;
  const recentWeightAverage = weights.length ? Number((weights.slice(-5).reduce((sum, row) => sum + row.catWeight, 0) / Math.min(weights.length, 5)).toFixed(2)) : null;
  const todayDoneSpecial = adhoc.filter((row) => row.done && row.doneAt?.slice(0, 10) === todayLocal());
  const pendingSpecial = adhoc.filter((row) => !row.done);
  const selectedDateSpecial = adhoc.filter((row) => row.done && row.doneAt?.slice(0, 10) === recordsDate);
  const taskMap = useMemo(() => Object.fromEntries(tasks.map((task) => [task.id, task])), [tasks]);
  const unresolvedIncidents = incidents.filter((row) => !row.resolved);
  const resolvedIncidents = incidents.filter((row) => row.resolved);
  const unacknowledgedSelfReports = selfReports.filter((row) => !row.acknowledged);
  const acknowledgedSelfReports = selfReports.filter((row) => row.acknowledged);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows = visibleTasks.map((task) => {
      const checkin = todayCheckinMap.get(task.id);
      const scheduledAt = task.scheduledTimes?.[0] || '';
      const status = getTaskStatus(checkin, task.scheduledTimes);
      return { task, checkin, scheduledAt, status };
    });
    const order = { overdue: 0, pending: 1, skip: 2, done: 3 } satisfies Record<TimelineStatus, number>;
    return rows.sort((a, b) => {
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return (a.scheduledAt || '').localeCompare(b.scheduledAt || '');
    });
  }, [todayCheckinMap, visibleTasks]);

  const overdueCount = timelineRows.filter((row) => row.status === 'overdue').length;
  const pendingFreshCount = timelineRows.filter((row) => row.status === 'pending').length;
  const timelineGroups = useMemo(() => ({
    overdue: timelineRows.filter((row) => row.status === 'overdue'),
    pending: timelineRows.filter((row) => row.status === 'pending'),
    skip: timelineRows.filter((row) => row.status === 'skip'),
    done: timelineRows.filter((row) => row.status === 'done'),
  }), [timelineRows]);

  const completionSummary = useMemo(() => {
    if (!totalCount) return '今天沒有排程任務';
    if (!pendingCount && !skipCount && !overdueCount) return '所有排程任務已完成';
    const bits = [] as string[];
    if (overdueCount) bits.push(`${overdueCount} 項已逾時`);
    if (pendingFreshCount) bits.push(`${pendingFreshCount} 項待處理`);
    if (skipCount) bits.push(`${skipCount} 項已略過`);
    return bits.join('，');
  }, [overdueCount, pendingCount, pendingFreshCount, skipCount, totalCount]);

  const recordStream = useMemo<RecordStreamItem[]>(() => {
    const checkinItems = recordCheckins.map((row) => {
      const task = taskMap[row.taskId] || { id: row.taskId, name: row.taskId, icon: '📋', type: 'other', scheduleType: 'daily', scheduledTimes: [] };
      return {
        id: `checkin-${row.taskId}-${row.time}`,
        kind: 'checkin' as const,
        timestamp: row.time,
        tone: row.isDone ? 'success' as const : 'default' as const,
        lane: 'routine' as const,
        title: <>{task.icon || '📋'} {task.name}</>,
        meta: <>{toDateTime(row.time)}{row.note ? ` · ${row.note}` : ''}</>,
        chips: <>
          <span style={badgeStyle(row.isDone ? 'success' : 'neutral')}>{row.isDone ? '完成' : '略過'}</span>
          {row.result && <span style={badgeStyle('purple')}>{row.result}</span>}
          {!!task.scheduledTimes?.length && <span style={badgeStyle('neutral')}>預定 {(task.scheduledTimes || []).join(' / ')}</span>}
        </>,
        detailBody: <div style={{ display: 'grid', gap: '8px' }}><div>預定時間：{(task.scheduledTimes || []).join(' / ') || '—'}</div><div>備註：{row.note || '—'}</div></div>,
        actions: <ActionButton tone="danger" onClick={() => deleteCheckin(row.taskId)}>🗑 刪除</ActionButton>,
      };
    });

    const selfReportItems = selfReports.map((row) => {
      const statusLabel = row.processingStatus === 'in-progress' ? '處理中' : row.processingStatus === 'completed' ? '已完成' : row.acknowledged ? '已確認' : '待確認';
      const statusTone = row.processingStatus === 'completed' ? 'success' : row.processingStatus === 'in-progress' ? 'purple' : row.acknowledged ? 'neutral' : 'warning';
      const needsAttention = !row.acknowledged || row.severity === 'high' || row.severity === 'medium';
      const itemTone: 'default' | 'danger' | 'warning' | 'success' = row.severity === 'high' ? 'danger' : row.acknowledged ? 'default' : 'warning';
      const itemLane: 'attention' | 'report' | 'routine' = needsAttention ? 'attention' : 'report';
      return {
        id: `selfreport-${row.id}`,
        kind: 'selfReport' as const,
        timestamp: row.reportedAt,
        tone: itemTone,
        lane: itemLane,
        title: <>{row.icon || '📝'} {row.title}{row.quantity ? ` ×${row.quantity}${row.unit || ''}` : ''}</>,
        meta: <>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</>,
        chips: <>
          <span style={badgeStyle('warning')}>{row.type || 'self-report'}</span>
          {row.severity && getSeverityBadge(row.severity)}
          {row.quantity ? <span style={badgeStyle('purple')}>{row.quantity}{row.unit || ''}</span> : null}
          <span style={badgeStyle(statusTone)}>{statusLabel}</span>
        </>,
        detailBody: <div style={{ display: 'grid', gap: '8px' }}><div>備註：{row.note || '—'}</div><div>管理員確認：{row.acknowledgedAt ? `${toDateTime(row.acknowledgedAt)}${row.acknowledgedNote ? ` · ${row.acknowledgedNote}` : ''}` : '尚未確認'}</div>{row.processingStatus && <div>處理狀態：{statusLabel}</div>}</div>,
        actions: <>
          {!row.acknowledged && (
            <>
              <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'pending')}>👀 確認收到</ActionButton>
              <ActionButton onClick={() => acknowledgeSelfReport(row.id, 'in-progress')}>⚙️ 處理中</ActionButton>
              <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'completed')}>✅ 已完成</ActionButton>
            </>
          )}
          {row.acknowledged && <ActionButton onClick={() => cancelAcknowledgment(row.id)}>↩️ 取消確認</ActionButton>}
          <ActionButton tone="danger" onClick={() => deleteSelfReport(row.id)}>🗑 刪除</ActionButton>
        </>,
      };
    });

    const incidentItems = incidents.map((row) => {
      const isCritical = row.severity === 'critical' || row.severity === 'high';
      const itemTone: 'default' | 'danger' | 'warning' | 'success' = row.resolved ? 'success' : isCritical ? 'danger' : 'warning';
      const itemLane: 'attention' | 'report' | 'routine' = row.resolved ? 'report' : 'attention';
      return {
        id: `incident-${row.id}`,
        kind: 'incident' as const,
        timestamp: row.reportedAt,
        tone: itemTone,
        lane: itemLane,
        title: <>{row.resolved ? '✅' : '🆘'} {row.type}</>,
        meta: <>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}{row.resolvedAt ? ` · 已於 ${toDateTime(row.resolvedAt)} 處理` : ''}</>,
        chips: <>
          <span style={badgeStyle(row.resolved ? 'success' : 'danger')}>{row.resolved ? '已處理' : '待處理'}</span>
          {row.severity && getSeverityBadge(row.severity)}
          {row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}
          {row.resolutionTemplate && <span style={badgeStyle('purple')}>範本：{resolutionTemplates.find((t) => t.id === row.resolutionTemplate)?.label}</span>}
        </>,
      detailBody: <div style={{ display: 'grid', gap: '8px' }}><div>嚴重程度：{row.severity ? getSeverityBadge(row.severity) : '未標記'}</div><div>說明：{row.note || '—'}</div><div>處理註記：{row.resolvedNote || '—'}</div>{row.resolvedAt ? <div>處理時間：{toDateTime(row.resolvedAt)}</div> : null}{row.resolutionTemplate ? <div>使用範本：{resolutionTemplates.find((t) => t.id === row.resolutionTemplate)?.label}</div> : null}</div>,
      actions: <>
        {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
        {!row.resolved && (
          <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>快速處理範本：</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {resolutionTemplates.map((tpl) => (
                <ActionButton key={tpl.id} tone="success" onClick={() => resolveIncident(row.id, tpl.id)}>
                  {tpl.label}
                </ActionButton>
              ))}
            </div>
            <ActionButton onClick={() => resolveIncident(row.id)}>✏️ 自訂處理</ActionButton>
          </div>
        )}
        <ActionButton tone="danger" onClick={() => deleteIncident(row.id)}>🗑 刪除</ActionButton>
      </>,
    };
    });

    const specialItems = selectedDateSpecial.map((row) => ({
      id: `adhoc-${row.id}`,
      kind: 'adhoc' as const,
      timestamp: row.doneAt || row.createdAt,
      tone: 'default' as const,
      lane: 'routine' as const,
      title: <>{row.icon} {row.name}</>,
      meta: <>{toDateTime(row.doneAt)}</>,
      chips: <>
        <span style={badgeStyle('success')}>已完成</span>
        {row.note && <span style={badgeStyle('neutral')}>派發：{row.note}</span>}
        {row.doneNote && <span style={badgeStyle('success')}>完成：{row.doneNote}</span>}
      </>,
      detailBody: <div style={{ display: 'grid', gap: '8px' }}><div>派發備註：{row.note || '—'}</div><div>完成備註：{row.doneNote || '—'}</div></div>,
      actions: <ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑 刪除</ActionButton>,
    }));

    return [...incidentItems, ...selfReportItems, ...checkinItems, ...specialItems]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [recordCheckins, selfReports, incidents, selectedDateSpecial, taskMap]);

  const filteredRecordStream = useMemo(() => recordStream.filter((item) => {
    if (recordsFilter === 'all') return true;
    if (recordsFilter === 'attention') return item.lane === 'attention';
    if (recordsFilter === 'checkins') return item.kind === 'checkin';
    if (recordsFilter === 'reports') return item.kind === 'selfReport';
    if (recordsFilter === 'incidents') return item.kind === 'incident';
    if (recordsFilter === 'special') return item.kind === 'adhoc';
    return true;
  }), [recordStream, recordsFilter]);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2600);
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      flash(`❌ 操作失敗：${msg}`);
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
    setTimeout(() => {
      taskFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
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

  const addWeight = async () => {
    const person = parseFloat(weightForm.personWeight);
    const carry = parseFloat(weightForm.carryWeight);
    if (isNaN(person) || isNaN(carry)) {
      flash('請輸入有效的體重數字');
      return;
    }
    if (carry <= person) {
      flash('抱貓重必須大於人重');
      return;
    }
    await withBusy(async () => {
      await post('/api/weights', { personWeight: person, carryWeight: carry, note: weightForm.note.trim() });
      setWeightForm({ personWeight: '', carryWeight: '', note: '' });
      flash(`已新增體重紀錄（${(carry - person).toFixed(2)} kg）`);
      await loadWeights();
    });
  };

  const deleteWeight = async (id: string) => {
    if (!window.confirm('確定刪除此體重紀錄？')) return;
    await withBusy(async () => {
      await del(`/api/weights?id=${encodeURIComponent(id)}`);
      flash('已刪除體重紀錄');
      await loadWeights();
    });
  };

  const markPeriodicDone = async (task: PeriodicTask) => {
    const note = window.prompt(`標記「${task.name}」已完成？\n可選：加上備註`, '') ?? null;
    if (note === null) return; // cancelled
    const now = new Date().toISOString();
    const updatedTask: PeriodicTask = {
      ...task,
      lastDoneAt: now,
      weeklyCount: task.weeklyMax
        ? (() => {
            const currentWeekStart = new Date();
            currentWeekStart.setHours(0, 0, 0, 0);
            currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
            const taskWeekStart = task.weekStart ? new Date(task.weekStart) : null;
            const isSameWeek = taskWeekStart && currentWeekStart.toDateString() === taskWeekStart.toDateString();
            return isSameWeek ? (task.weeklyCount || 0) + 1 : 1;
          })()
        : task.weeklyCount,
      weekStart: task.weeklyMax
        ? (() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - d.getDay());
            return d.toISOString();
          })()
        : task.weekStart,
    };
    const nextList = periodicTasks.map((t) => (t.id === task.id ? updatedTask : t));
    await withBusy(async () => {
      await post('/api/periodic', nextList);
      setPeriodicTasks(nextList);
      flash(`已標記「${task.name}」完成`);
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

  const acknowledgeSelfReport = async (id: string, processingStatus?: 'pending' | 'in-progress' | 'completed') => {
    const note = window.prompt('可選：留下確認註記（例如已查看、稍後補貨、正在處理）', '') ?? '';
    await withBusy(async () => {
      await post(`/api/selfreports/${id}/ack`, { note: note.trim(), processingStatus });
      const statusLabel = processingStatus === 'in-progress' ? '（處理中）' : processingStatus === 'completed' ? '（已完成）' : '';
      flash(note.trim() ? `已確認回報並附上註記${statusLabel}` : `已確認收到回報${statusLabel}`);
      setDetailModal(null);
      await Promise.all([loadRecords(recordsDate), loadOverview()]);
    });
  };

  const cancelAcknowledgment = async (id: string) => {
    if (!window.confirm('取消這個回報的確認狀態？之後可以重新確認。')) return;
    await withBusy(async () => {
      await post(`/api/selfreports/${id}/unack`, {});
      flash('已取消確認狀態');
      setDetailModal(null);
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

  const resolveIncident = async (id: string, template?: string) => {
    let note = '';
    if (template) {
      const tpl = resolutionTemplates.find((t) => t.id === template);
      note = tpl?.note || '';
    } else {
      const prompted = window.prompt('可選：留下處理註記（例如已聯絡照護者、已清理）', '');
      if (prompted === null) return; // user cancelled
      note = prompted;
    }
    await withBusy(async () => {
      await post(`/api/incidents/${id}/resolve`, { note: note.trim(), template });
      flash(template ? `已使用範本「${resolutionTemplates.find((t) => t.id === template)?.label}」標記完成` : (note.trim() ? '已標記完成並附上註記' : '已標記為處理完成'));
      setDetailModal(null);
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
    const row = adhoc.find((item) => item.id === id);
    const label = row?.done ? '刪除此特殊任務紀錄？' : '將這個特殊任務自待辦中移除（dismiss）？';
    if (!window.confirm(label)) return;
    await withBusy(async () => {
      await del(`/api/adhoc/${id}`);
      flash(row?.done ? '特殊任務紀錄已刪除' : '特殊任務已移出待辦');
      setDetailModal(null);
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
      // Sync catName in settings to keep system summary consistent
      if (settings && payload.name !== settings.catName) {
        const nextSettings = { ...settings, catName: payload.name } as Settings;
        await post('/api/settings', nextSettings);
        setSettings(nextSettings);
      }
      flash('貓咪資料已儲存');
      setRefreshKey((value) => value + 1);
    });
  };

  const saveQuickSettings = async () => {
    await withBusy(async () => {
      const nextSettings = {
        ...settings,
        catName: catForm.name.trim() || catName,
        adminGranularTimeGrouping: granularTime,
      } as Settings;
      await post('/api/settings', nextSettings);
      setSettings(nextSettings);
      flash('設定已更新');
    });
  };

  const persistGranularTimeSetting = async (checked: boolean) => {
    setGranularTime(checked);
    const nextSettings = {
      ...settings,
      catName: catForm.name.trim() || catName,
      adminGranularTimeGrouping: checked,
    } as Settings;
    try {
      await post('/api/settings', nextSettings);
      setSettings(nextSettings);
      flash(checked ? '已切換為細粒度時間分組' : '已切換為預設時間分組');
    } catch {
      setGranularTime(!!settings?.adminGranularTimeGrouping);
      flash('時間分組偏好儲存失敗');
    }
  };

  const resetTemplateDraft = () => {
    setTemplateDraft({ id: '', label: '', note: '' });
  };

  const saveResolutionTemplates = async (nextTemplates: ResolutionTemplate[], successMessage: string) => {
    await withBusy(async () => {
      await post('/api/resolution-templates', nextTemplates);
      setResolutionTemplates(nextTemplates);
      flash(successMessage);
      resetTemplateDraft();
      await loadResolutionTemplates();
    });
  };

  const addResolutionTemplate = async () => {
    const label = templateDraft.label.trim();
    const note = templateDraft.note.trim();
    if (!label || !note) {
      flash('請先填好範本名稱與內容');
      return;
    }
    const id = (templateDraft.id.trim() || label)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!id) {
      flash('請輸入有效的範本代號');
      return;
    }
    if (resolutionTemplates.some((template) => template.id === id)) {
      flash('範本代號已存在，請換一個');
      return;
    }
    await saveResolutionTemplates([...resolutionTemplates, { id, label, note }], '處理範本已新增');
  };

  const removeResolutionTemplate = async (id: string) => {
    if (resolutionTemplates.length <= 1) {
      flash('至少保留一個處理範本');
      return;
    }
    const target = resolutionTemplates.find((template) => template.id === id);
    if (!target || !window.confirm(`移除範本：${target.label}？`)) return;
    await saveResolutionTemplates(resolutionTemplates.filter((template) => template.id !== id), '處理範本已移除');
  };

  const changePin = async () => {
    if (!pinForm.oldPin || !pinForm.newPin) {
      flash('請輸入舊 PIN 與新 PIN');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/pin/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pinForm),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        flash(`❌ PIN 變更失敗：${data.error || '舊 PIN 不正確'}`);
        return;
      }
      setPinForm({ oldPin: '', newPin: '' });
      flash('✅ PIN 已更新');
    } catch {
      flash('❌ PIN 變更失敗，請重試');
    } finally {
      setBusy(false);
    }
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
            onClick={() => { setAdminMode(false); onLogout?.(); }}
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
            { label: '異常 / 回報', value: `${allUnresolvedIncidents.length}/${selfReports.length}`, sub: '未解 / 今日回報', color: allUnresolvedIncidents.length ? '#fecaca' : '#f5f5f5' },
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
            <div style={{ ...sectionCard, display: 'grid', gap: '12px', borderTop: `4px solid ${overdueCount || allUnresolvedIncidents.length ? '#ef4444' : unacknowledgedSelfReports.length ? '#f59e0b' : '#22c55e'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>📌 置頂摘要 / Urgency Bands</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>先把需要反應的事情釘在最上面，再往下看完整流水。</div>
                </div>
                <span style={badgeStyle(overdueCount || allUnresolvedIncidents.length ? 'danger' : unacknowledgedSelfReports.length ? 'warning' : 'success')}>
                  {overdueCount || allUnresolvedIncidents.length ? '需要立即注意' : unacknowledgedSelfReports.length ? '有待確認回報' : '目前平穩'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                {[
                  { label: '立即處理', value: overdueCount + allUnresolvedIncidents.length, sub: allUnresolvedIncidents.length ? `${allUnresolvedIncidents.length} 件未解決` : overdueCount ? `${overdueCount} 項逾時` : '沒有待處理項目', tone: overdueCount + allUnresolvedIncidents.length ? 'danger' as const : 'success' as const },
                  { label: '待確認回報', value: unacknowledgedSelfReports.length, sub: selfReports.length ? `${acknowledgedSelfReports.length} 則已確認` : '今天沒有回報', tone: unacknowledgedSelfReports.length ? 'warning' as const : 'neutral' as const },
                  { label: '日常流程', value: `${doneCount}/${totalCount || 0}`, sub: skipCount ? `${skipCount} 項略過` : '沒有略過項目', tone: pendingFreshCount ? 'warning' as const : 'success' as const },
                ].map((item) => (
                  <div key={item.label} style={{ borderRadius: '16px', padding: '12px', background: 'rgba(61,44,53,0.03)', border: '1px solid rgba(61,44,53,0.05)' }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.label}</div>
                    <div style={{ fontSize: '1.18rem', fontWeight: 800, marginTop: '4px' }}>{item.value}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>{item.sub}</div>
                    <div style={{ marginTop: '8px' }}><span style={badgeStyle(item.tone)}>{item.label}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {(allUnresolvedIncidents.length > 0 || selfReports.length > 0) && (
              <div style={{ display: 'grid', gap: '12px' }}>
                {!!allUnresolvedIncidents.length && (
                  <div style={{ ...sectionCard, borderColor: 'rgba(248,113,113,0.38)', background: 'linear-gradient(135deg, rgba(248,113,113,0.09), rgba(248,113,113,0.03))', borderTop: '4px solid #ef4444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#b91c1c' }}>🆘 異常案件置頂</div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(153,27,27,0.78)' }}>所有未處理案件（包含舊日）會優先顯示，避免遺漏。</div>
                      </div>
                      <span style={badgeStyle('danger')}>{allUnresolvedIncidents.length} 則待處理</span>
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {allUnresolvedIncidents.map((row) => (
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
                          onClick={() => setDetailModal({
                            tone: 'danger',
                            title: <>{row.hasPhoto ? '📷 ' : ''}{row.type}</>,
                            meta: <>{toDateTime(row.reportedAt)}</>,
                            chips: <><span style={badgeStyle('danger')}>待處理</span>{row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}</>,
                            body: <div style={{ display: 'grid', gap: '8px' }}>{row.severity && <div>嚴重程度：{getSeverityBadge(row.severity)}</div>}{row.note ? <div>說明：{row.note}</div> : <div>沒有附加說明。</div>}</div>,
                            actions: <>
                              {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                              <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>快速處理範本：</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {resolutionTemplates.slice(0, 3).map((tpl) => (
                                    <ActionButton key={tpl.id} tone="success" onClick={() => resolveIncident(row.id, tpl.id)}>
                                      {tpl.label}
                                    </ActionButton>
                                  ))}
                                </div>
                                <ActionButton onClick={() => resolveIncident(row.id)}>✏️ 更多選項...</ActionButton>
                              </div>
                            </>,
                          })}
                          actions={
                            <>
                              {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                              <ActionButton tone="success" onClick={() => {
                                setDetailModal({
                                  tone: 'danger',
                                  title: <>{row.hasPhoto ? '📷 ' : ''}{row.type}</>,
                                  meta: <>{toDateTime(row.reportedAt)}</>,
                                  chips: <><span style={badgeStyle('danger')}>待處理</span>{row.severity && getSeverityBadge(row.severity)}{row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}</>,
                                  body: <div style={{ display: 'grid', gap: '8px' }}>{row.severity && <div>嚴重程度：{getSeverityBadge(row.severity)}</div>}{row.note ? <div>說明：{row.note}</div> : <div>沒有附加說明。</div>}</div>,
                                  actions: <>
                                    {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                                    <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
                                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>快速處理範本：</div>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {resolutionTemplates.map((tpl) => (
                                          <ActionButton key={tpl.id} tone="success" onClick={() => resolveIncident(row.id, tpl.id)}>
                                            {tpl.label}
                                          </ActionButton>
                                        ))}
                                      </div>
                                      <ActionButton onClick={() => resolveIncident(row.id)}>✏️ 自訂處理</ActionButton>
                                    </div>
                                  </>,
                                });
                              }}>⚡ 快速處理</ActionButton>
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
                      <span style={badgeStyle(unacknowledgedSelfReports.length ? 'warning' : 'neutral')}>{unacknowledgedSelfReports.length}/{selfReports.length} 待確認 / 全部</span>
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {selfReports.map((row) => {
                        const statusLabel = row.processingStatus === 'in-progress' ? '處理中' : row.processingStatus === 'completed' ? '已完成' : row.acknowledged ? '已確認' : '待確認';
                        const statusTone = row.processingStatus === 'completed' ? 'success' : row.processingStatus === 'in-progress' ? 'purple' : row.acknowledged ? 'neutral' : 'warning';
                        return (
                          <RecordCard
                            key={row.id}
                            tone="warning"
                            title={<>{row.icon || '📝'} {row.title}{row.quantity ? ` ×${row.quantity}${row.unit || ''}` : ''}</>}
                            meta={<>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</>}
                            chips={<><span style={badgeStyle('warning')}>{row.type || 'self-report'}</span><span style={badgeStyle(statusTone)}>{statusLabel}</span></>}
                            actions={!row.acknowledged ? (
                              <>
                                <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'pending')}>👀 確認</ActionButton>
                                <ActionButton onClick={() => acknowledgeSelfReport(row.id, 'in-progress')}>⚙️ 處理中</ActionButton>
                              </>
                            ) : row.processingStatus === 'in-progress' ? (
                              <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'completed')}>✅ 標記完成</ActionButton>
                            ) : undefined}
                          />
                        );
                      })}
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
                  <span style={badgeStyle(overdueCount ? 'danger' : 'warning')}>{overdueCount ? `逾時 ${overdueCount}` : `待處理 ${pendingFreshCount}`}</span>
                  {pendingFreshCount > 0 && <span style={badgeStyle('warning')}>待處理 {pendingFreshCount}</span>}
                  {skipCount > 0 && <span style={badgeStyle('neutral')}>略過 {skipCount}</span>}
                  <button onClick={() => setRefreshKey((value) => value + 1)} style={subtleButton}>🔄 重新整理</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {[
                  { label: '完成率', value: `${pct}%`, tone: 'success' as const },
                  { label: '逾時 / 待處理', value: `${overdueCount}/${pendingFreshCount}`, tone: overdueCount ? 'danger' as const : 'warning' as const },
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
                <span style={badgeStyle(overdueCount ? 'danger' : pendingFreshCount ? 'warning' : 'success')}>
                  {overdueCount ? `${overdueCount} 項已逾時` : pendingFreshCount ? `${pendingFreshCount} 項待處理` : '全部已處理'}
                </span>
              </div>

              {timelineRows.length ? (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {[
                    { key: 'overdue', label: '⚠️ 已逾時', tone: 'danger' as const, rows: timelineGroups.overdue },
                    { key: 'pending', label: '🕓 待處理', tone: 'warning' as const, rows: timelineGroups.pending },
                    { key: 'skip', label: '⏭️ 已略過', tone: 'neutral' as const, rows: timelineGroups.skip },
                    { key: 'done', label: '✅ 已完成', tone: 'success' as const, rows: timelineGroups.done },
                  ].filter((group) => group.rows.length).map((group) => (
                    <div key={group.key} style={{ display: 'grid', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700 }}>{group.label}</div>
                        <span style={badgeStyle(group.tone)}>{group.rows.length} 項</span>
                      </div>
                      {group.rows.map((row) => {
                        const statusLabel = row.status === 'overdue' ? '已逾時' : row.status === 'pending' ? '待處理' : row.status === 'skip' ? '已略過' : '已完成';
                        const tone = row.status === 'overdue' ? 'danger' : row.status === 'pending' ? 'warning' : row.status === 'skip' ? 'neutral' : 'success';
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
                              border: row.status === 'overdue'
                                ? '1px solid rgba(248,113,113,0.28)'
                                : row.status === 'pending'
                                  ? '1px solid rgba(245,158,11,0.24)'
                                  : row.status === 'skip'
                                    ? '1px solid rgba(61,44,53,0.10)'
                                    : '1px solid rgba(74,222,128,0.22)',
                              background: row.status === 'overdue'
                                ? 'rgba(248,113,113,0.06)'
                                : row.status === 'pending'
                                  ? 'rgba(245,158,11,0.06)'
                                  : row.status === 'skip'
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
                  ))}
                </div>
              ) : (
                <EmptyState title="今天沒有可顯示的排程任務" subtitle="如果剛更新任務排程，重新整理後會同步顯示。" />
              )}
            </div>

            <div style={{ ...sectionCard, display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>📰 最近事件流</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>今天最新的 5 筆紀錄，讓你快速掌握最近發生的事。</div>
                </div>
                <button onClick={() => setActiveTab('records')} style={subtleButton}>📋 查看完整紀錄</button>
              </div>
              {(() => {
                const allTodayEvents = [
                  ...todayCheckins.map((row) => ({ timestamp: row.time, kind: 'checkin' as const, data: row })),
                  ...selfReports.map((row) => ({ timestamp: row.reportedAt, kind: 'selfReport' as const, data: row })),
                  ...incidents.map((row) => ({ timestamp: row.reportedAt, kind: 'incident' as const, data: row })),
                  ...todayDoneSpecial.map((row) => ({ timestamp: row.doneAt || row.createdAt, kind: 'adhoc' as const, data: row })),
                ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

                return allTodayEvents.length ? (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {allTodayEvents.map((event, idx) => {
                      if (event.kind === 'checkin') {
                        const row = event.data as Checkin;
                        const task = taskMap[row.taskId] || { id: row.taskId, name: row.taskId, icon: '📋' };
                        return (
                          <div key={`mini-checkin-${idx}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', borderRadius: '12px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}>
                            <div style={{ fontSize: '1.4rem' }}>{task.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{task.name}</div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{toClock(row.time)} · {row.isDone ? '完成' : '略過'}</div>
                            </div>
                          </div>
                        );
                      }
                      if (event.kind === 'selfReport') {
                        const row = event.data as SelfReportRow;
                        return (
                          <div key={`mini-report-${idx}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', borderRadius: '12px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
                            <div style={{ fontSize: '1.4rem' }}>{row.icon || '📝'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{row.title}</div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{toClock(row.reportedAt)} · {row.acknowledged ? '已確認' : '待確認'}</div>
                            </div>
                          </div>
                        );
                      }
                      if (event.kind === 'incident') {
                        const row = event.data as IncidentRow;
                        return (
                          <div key={`mini-incident-${idx}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', borderRadius: '12px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}>
                            <div style={{ fontSize: '1.4rem' }}>🆘</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{row.type}</div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{toClock(row.reportedAt)} · {row.resolved ? '已處理' : '待處理'}</div>
                            </div>
                          </div>
                        );
                      }
                      if (event.kind === 'adhoc') {
                        const row = event.data as AdhocTask;
                        return (
                          <div key={`mini-adhoc-${idx}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', borderRadius: '12px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                            <div style={{ fontSize: '1.4rem' }}>{row.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{row.name}</div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{toClock(row.doneAt || row.createdAt)} · 特殊任務完成</div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ) : <EmptyState title="今天還沒有事件紀錄" subtitle="完成任務、回報、異常會即時顯示在這裡。" />;
              })()}
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
                    onClick={() => setDetailModal({
                      tone: 'warning',
                      title: <>{row.icon} {row.name}</>,
                      meta: <>{toDateTime(row.createdAt)}</>,
                      chips: <><span style={badgeStyle('warning')}>待完成</span></>,
                      body: <div>派發備註：{row.note || '—'}</div>,
                      actions: <ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑 移出待辦</ActionButton>,
                    })}
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
                <input type="date" value={recordsDate} onChange={(e) => { setRecordsDate(e.target.value); setRecordsFilter('all'); }} style={{ ...inputStyle, maxWidth: '220px' }} />
                <button onClick={() => loadRecords(recordsDate)} style={subtleButton}>🔄 刷新</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={badgeStyle('neutral')}>打卡 {recordCheckins.length}</span>
                <span style={badgeStyle('warning')}>回報 {selfReports.length}</span>
                <span style={badgeStyle(unresolvedIncidents.length ? 'danger' : 'neutral')}>異常 {incidents.length}</span>
              </div>
            </div>

            <div style={{ ...sectionCard, display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>🧵 統一流水紀錄</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>把打卡、回報、異常、特殊任務拉成同一條 stream，先看 attention，再依類型過濾。</div>
                </div>
                <span style={badgeStyle(filteredRecordStream.some((item) => item.lane === 'attention') ? 'danger' : 'neutral')}>{filteredRecordStream.length} / {recordStream.length} 筆顯示中</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  ['all', `全部 ${recordStream.length}`],
                  ['attention', `待注意 ${recordStream.filter((item) => item.lane === 'attention').length}`],
                  ['checkins', `打卡 ${recordCheckins.length}`],
                  ['reports', `回報 ${selfReports.length}`],
                  ['incidents', `異常 ${incidents.length}`],
                  ['special', `特殊 ${selectedDateSpecial.length}`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRecordsFilter(key as typeof recordsFilter)}
                    style={{
                      ...buttonBase,
                      padding: '8px 12px',
                      background: recordsFilter === key ? 'linear-gradient(135deg, var(--primary), #c084fc)' : 'var(--glass)',
                      color: recordsFilter === key ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={granularTime} onChange={(e) => persistGranularTimeSetting(e.target.checked)} />
                  使用細粒度時間分組（小時級別）
                </label>
              </div>
              {filteredRecordStream.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(() => {
                    const grouped: Record<string, RecordStreamItem[]> = {};
                    filteredRecordStream.forEach((item) => {
                      const group = getTimeGroup(item.timestamp, granularTime);
                      if (!grouped[group]) grouped[group] = [];
                      grouped[group].push(item);
                    });
                    const groupOrder = granularTime 
                      ? ['🌙 深夜 (00:00-02:59)', '🌃 清晨 (03:00-05:59)', '🌅 早晨 (06:00-08:59)', '☀️ 上午 (09:00-11:59)', '☀️ 中午 (12:00-14:59)', '🌤️ 下午 (15:00-17:59)', '🌆 傍晚 (18:00-20:59)', '🌙 晚上 (21:00-23:59)', '🕐 時間未知']
                      : ['🌅 早上 (05:00-11:59)', '☀️ 下午 (12:00-16:59)', '🌆 傍晚 (17:00-20:59)', '🌙 晚上 (21:00-04:59)', '🕐 時間未知'];
                    return groupOrder.flatMap((groupLabel) => {
                      const items = grouped[groupLabel];
                      if (!items || items.length === 0) return [];
                      return [
                        <div key={`header-${groupLabel}`} style={{ position: 'sticky', top: '0', zIndex: 10, background: 'linear-gradient(135deg, rgba(155,135,245,0.08), rgba(192,132,252,0.08))', borderRadius: '12px', padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(8px)' }}>
                          <span>{groupLabel}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{items.length} 筆</span>
                        </div>,
                        ...items.map((item) => (
                          <RecordCard
                            key={item.id}
                            tone={item.tone}
                            title={item.title}
                            meta={item.meta}
                            chips={item.chips}
                            actions={item.actions}
                            onClick={() => setDetailModal({ title: item.title, meta: item.meta, chips: item.chips, body: item.detailBody, actions: item.actions, tone: item.tone === 'default' ? undefined : item.tone })}
                          />
                        ))
                      ];
                    });
                  })()}
                </div>
              ) : <EmptyState title="這個篩選條件下沒有紀錄" subtitle="換個 chip 或改日期，就能快速切回完整流水。" />}
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
                        onClick={() => setDetailModal({
                          tone: row.isDone ? 'success' : 'default',
                          title: <>{task.icon || '📋'} {task.name}</>,
                          meta: <>{toDateTime(row.time)}</>,
                          chips: <><span style={badgeStyle(row.isDone ? 'success' : 'neutral')}>{row.isDone ? '完成' : '略過'}</span>{row.result && <span style={badgeStyle('purple')}>{row.result}</span>}</>,
                          body: <div style={{ display: 'grid', gap: '8px' }}><div>預定時間：{(task.scheduledTimes || []).join(' / ') || '—'}</div><div>備註：{row.note || '—'}</div></div>,
                          actions: <ActionButton tone="danger" onClick={() => deleteCheckin(row.taskId)}>🗑 刪除</ActionButton>,
                        })}
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
                <span style={badgeStyle(unacknowledgedSelfReports.length ? 'warning' : 'neutral')}>{unacknowledgedSelfReports.length}/{selfReports.length} 待確認 / 全部</span>
              </div>
              {selfReports.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {selfReports.map((row) => {
                    const statusLabel = row.processingStatus === 'in-progress' ? '處理中' : row.processingStatus === 'completed' ? '已完成' : row.acknowledged ? '已確認' : '待確認';
                    const statusTone = row.processingStatus === 'completed' ? 'success' : row.processingStatus === 'in-progress' ? 'purple' : row.acknowledged ? 'neutral' : 'warning';
                    return (
                      <RecordCard
                        key={row.id}
                        tone="warning"
                        title={<>{row.icon || '📝'} {row.title}{row.quantity ? ` ×${row.quantity}${row.unit || ''}` : ''}</>}
                        meta={<>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</>}
                        chips={<><span style={badgeStyle('warning')}>{row.type || 'self-report'}</span>{row.quantity ? <span style={badgeStyle('purple')}>{row.quantity}{row.unit || ''}</span> : null}<span style={badgeStyle(statusTone)}>{statusLabel}</span></>}
                        onClick={() => setDetailModal({
                          tone: 'warning',
                          title: <>{row.icon || '📝'} {row.title}</>,
                          meta: <>{toDateTime(row.reportedAt)}</>,
                          chips: <><span style={badgeStyle('warning')}>{row.type || 'self-report'}</span>{row.quantity ? <span style={badgeStyle('purple')}>{row.quantity}{row.unit || ''}</span> : null}<span style={badgeStyle(statusTone)}>{statusLabel}</span></>,
                          body: <div style={{ display: 'grid', gap: '8px' }}><div>備註：{row.note || '—'}</div><div>管理員確認：{row.acknowledgedAt ? `${toDateTime(row.acknowledgedAt)}${row.acknowledgedNote ? ` · ${row.acknowledgedNote}` : ''}` : '尚未確認'}</div>{row.processingStatus && <div>處理狀態：{statusLabel}</div>}</div>,
                          actions: <>
                            {!row.acknowledged && (
                              <>
                                <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'pending')}>👀 確認收到</ActionButton>
                                <ActionButton onClick={() => acknowledgeSelfReport(row.id, 'in-progress')}>⚙️ 處理中</ActionButton>
                                <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'completed')}>✅ 已完成</ActionButton>
                              </>
                            )}
                            {row.acknowledged && <ActionButton onClick={() => cancelAcknowledgment(row.id)}>↩️ 取消確認</ActionButton>}
                            <ActionButton tone="danger" onClick={() => deleteSelfReport(row.id)}>🗑 刪除</ActionButton>
                          </>,
                        })}
                        actions={<>
                          {!row.acknowledged && (
                            <>
                              <ActionButton tone="success" onClick={() => acknowledgeSelfReport(row.id, 'pending')}>👀 確認</ActionButton>
                              <ActionButton onClick={() => acknowledgeSelfReport(row.id, 'in-progress')}>⚙️ 處理中</ActionButton>
                            </>
                          )}
                          {row.acknowledged && <ActionButton onClick={() => cancelAcknowledgment(row.id)}>↩️ 取消確認</ActionButton>}
                          <ActionButton tone="danger" onClick={() => deleteSelfReport(row.id)}>🗑 刪除</ActionButton>
                        </>}
                      />
                    );
                  })}
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
                      onClick={() => setDetailModal({
                        title: <>{row.icon} {row.name}</>,
                        meta: <>{toDateTime(row.doneAt)}</>,
                        chips: <><span style={badgeStyle('success')}>已完成</span></>,
                        body: <div style={{ display: 'grid', gap: '8px' }}><div>派發備註：{row.note || '—'}</div><div>完成備註：{row.doneNote || '—'}</div></div>,
                        actions: <ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑 刪除</ActionButton>,
                      })}
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
                          {row.severity && getSeverityBadge(row.severity)}
                          {row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}
                          {row.resolutionTemplate && <span style={badgeStyle('purple')}>範本：{resolutionTemplates.find((t) => t.id === row.resolutionTemplate)?.label}</span>}
                        </>
                      }
                      onClick={() => setDetailModal({
                        tone: row.resolved ? 'success' : 'danger',
                        title: <>{row.resolved ? '✅' : '🆘'} {row.type}</>,
                        meta: <>{toDateTime(row.reportedAt)}</>,
                        chips: <><span style={badgeStyle(row.resolved ? 'success' : 'danger')}>{row.resolved ? '已處理' : '待處理'}</span>{row.severity && getSeverityBadge(row.severity)}{row.hasPhoto && <span style={badgeStyle('warning')}>附照片</span>}{row.resolutionTemplate && <span style={badgeStyle('purple')}>範本：{resolutionTemplates.find((t) => t.id === row.resolutionTemplate)?.label}</span>}</>,
                        body: <div style={{ display: 'grid', gap: '8px' }}>{row.severity && <div>嚴重程度：{getSeverityBadge(row.severity)}</div>}<div>說明：{row.note || '—'}</div><div>處理註記：{row.resolvedNote || '—'}</div>{row.resolvedAt ? <div>處理時間：{toDateTime(row.resolvedAt)}</div> : null}{row.resolutionTemplate ? <div>使用範本：{resolutionTemplates.find((t) => t.id === row.resolutionTemplate)?.label}</div> : null}</div>,
                        actions: <>
                          {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                          {!row.resolved && (
                            <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>快速處理範本：</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {resolutionTemplates.map((tpl) => (
                                  <ActionButton key={tpl.id} tone="success" onClick={() => resolveIncident(row.id, tpl.id)}>
                                    {tpl.label}
                                  </ActionButton>
                                ))}
                              </div>
                              <ActionButton onClick={() => resolveIncident(row.id)}>✏️ 自訂處理</ActionButton>
                            </div>
                          )}
                          <ActionButton tone="danger" onClick={() => deleteIncident(row.id)}>🗑 刪除</ActionButton>
                        </>,
                      })}
                      actions={
                        <>
                          {row.hasPhoto && <ActionButton onClick={() => openIncidentPhoto(row.id)}>🖼 查看照片</ActionButton>}
                          {!row.resolved && (
                            <>
                              <ActionButton tone="success" onClick={() => resolveIncident(row.id, 'monitor')}>👁 觀察</ActionButton>
                              <ActionButton tone="success" onClick={() => resolveIncident(row.id, 'resolved')}>✅ 處理</ActionButton>
                            </>
                          )}
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
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>➕ 手動新增體重紀錄</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>人重 (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={weightForm.personWeight}
                      onChange={(e) => setWeightForm((s) => ({ ...s, personWeight: e.target.value }))}
                      style={inputStyle}
                      placeholder={`例：${settings?.lastPersonWeight ?? 66.5}`}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>抱貓重 (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={weightForm.carryWeight}
                      onChange={(e) => setWeightForm((s) => ({ ...s, carryWeight: e.target.value }))}
                      style={inputStyle}
                      placeholder="例：70.3"
                    />
                  </div>
                </div>
                {weightForm.personWeight && weightForm.carryWeight && !isNaN(parseFloat(weightForm.carryWeight) - parseFloat(weightForm.personWeight)) && (
                  <div style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 700 }}>
                    貓重：{(parseFloat(weightForm.carryWeight) - parseFloat(weightForm.personWeight)).toFixed(2)} kg
                  </div>
                )}
                <input
                  value={weightForm.note}
                  onChange={(e) => setWeightForm((s) => ({ ...s, note: e.target.value }))}
                  style={inputStyle}
                  placeholder="備註（選填）"
                />
                <button onClick={addWeight} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff', width: 'fit-content' }}>
                  💾 新增紀錄
                </button>
              </div>
            </div>
            <div style={{ ...sectionCard, display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>⚖️ 體重紀錄</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>補回舊版強調的最新值、前次差異與近期平均。</div>
                </div>
                <button onClick={() => loadWeights()} style={subtleButton}>🔄 刷新</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                {[
                  { label: '最新體重', value: latestWeight ? `${latestWeight.catWeight} kg` : '—', sub: latestWeight ? toDateTime(latestWeight.measuredAt) : '尚未記錄' },
                  { label: '與前次差異', value: weightDelta == null ? '—' : `${weightDelta > 0 ? '+' : ''}${weightDelta} kg`, sub: previousWeight ? `${previousWeight.catWeight} kg → ${latestWeight?.catWeight} kg` : '至少需要 2 筆紀錄' },
                  { label: '近 5 筆平均', value: recentWeightAverage == null ? '—' : `${recentWeightAverage} kg`, sub: weights.length ? `共 ${weights.length} 筆紀錄` : '尚未記錄' },
                ].map((item) => (
                  <div key={item.label} style={{ borderRadius: '16px', padding: '12px', background: 'rgba(61,44,53,0.03)', border: '1px solid rgba(61,44,53,0.04)' }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.label}</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{item.value}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={sectionCard}>
              {weights.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {[...weights].reverse().map((row) => (
                    <RecordCard
                      key={row.id || row.measuredAt}
                      title={<>{catName} {row.catWeight} kg</>}
                      meta={<>{toDateTime(row.measuredAt)}</>}
                      chips={<><span style={badgeStyle('purple')}>人重 {row.personWeight} kg</span><span style={badgeStyle('neutral')}>抱貓重 {row.carryWeight} kg</span></>}
                      actions={<ActionButton tone="danger" onClick={() => deleteWeight(row.id || row.measuredAt)}>🗑 刪除</ActionButton>}
                      onClick={() => setDetailModal({
                        title: <>{catName} 體重紀錄</>,
                        meta: <>{toDateTime(row.measuredAt)}</>,
                        chips: <><span style={badgeStyle('purple')}>{row.catWeight} kg</span></>,
                        body: <div style={{ display: 'grid', gap: '8px' }}><div>人重：{row.personWeight} kg</div><div>抱貓重：{row.carryWeight} kg</div><div>備註：{row.note || '—'}</div></div>,
                      })}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="目前沒有體重紀錄" subtitle="照護者完成體重任務後，這裡會自動累積記錄。" />
              )}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div ref={taskFormRef} style={sectionCard}>
              <div style={{ fontWeight: 800, marginBottom: '12px' }}>{taskForm.id ? '✏️ 編輯任務' : '＋ 新增任務'}</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '10px' }}>
                  <input value={taskForm.icon} onChange={(e) => setTaskForm((s) => ({ ...s, icon: e.target.value }))} style={inputStyle} placeholder="圖示" />
                  <input value={taskForm.name} onChange={(e) => setTaskForm((s) => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="任務名稱" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <select value={taskForm.type} onChange={(e) => setTaskForm((s) => ({ ...s, type: e.target.value }))} style={inputStyle}>
                    <option value="other">一般</option>
                    <option value="meal">餐食</option>
                    <option value="feed">餵食（舊）</option>
                    <option value="treat">零食</option>
                    <option value="weight">量體重</option>
                    <option value="litter">清貓砂</option>
                    <option value="water">換水</option>
                    <option value="groom">美容/梳毛</option>
                    <option value="feeder">自動餵食機</option>
                    <option value="clean">清潔（舊）</option>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>🔁 週期護理任務</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>剪指甲、洗澡、清耳朵等週期任務，點按完成後會更新紀錄。</div>
                </div>
                <button onClick={() => loadPeriodicTasks()} style={subtleButton}>🔄 刷新</button>
              </div>
              {periodicTasks.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {periodicTasks.map((task) => {
                    const now = new Date();
                    let dueDate: Date | null = null;
                    let isOverdue = false;
                    let daysLeft: number | null = null;
                    if (task.intervalDays && task.lastDoneAt) {
                      dueDate = new Date(task.lastDoneAt);
                      dueDate.setDate(dueDate.getDate() + task.intervalDays);
                      const diffMs = dueDate.getTime() - now.getTime();
                      daysLeft = Math.ceil(diffMs / 86400000);
                      isOverdue = daysLeft < 0;
                    } else if (task.intervalDays && !task.lastDoneAt) {
                      isOverdue = true;
                    }
                    // Weekly max logic
                    let weeklyInfo = '';
                    if (task.weeklyMax) {
                      const currentWeekStart = new Date();
                      currentWeekStart.setHours(0, 0, 0, 0);
                      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
                      const taskWeekStart = task.weekStart ? new Date(task.weekStart) : null;
                      const isSameWeek = taskWeekStart && currentWeekStart.toDateString() === taskWeekStart.toDateString();
                      const count = isSameWeek ? (task.weeklyCount || 0) : 0;
                      weeklyInfo = `本週 ${count}/${task.weeklyMax}`;
                      isOverdue = isSameWeek ? count >= task.weeklyMax : false;
                    }
                    const tone: 'danger' | 'warning' | 'success' | 'default' = isOverdue ? 'danger' : (daysLeft !== null && daysLeft <= 3) ? 'warning' : task.lastDoneAt ? 'success' : 'warning';
                    return (
                      <RecordCard
                        key={task.id}
                        tone={tone}
                        title={<>{task.icon} {task.name}</>}
                        meta={<>{task.lastDoneAt ? `上次完成：${toDateTime(task.lastDoneAt)}` : '尚未完成過'}{task.note ? ` · ${task.note}` : ''}</>}
                        chips={<>
                          {task.intervalDays && (
                            <span style={badgeStyle(isOverdue ? 'danger' : daysLeft !== null && daysLeft <= 3 ? 'warning' : 'success')}>
                              {isOverdue
                                ? `已逾期 ${Math.abs(daysLeft ?? 0)} 天`
                                : daysLeft === 0 ? '今天到期'
                                : daysLeft !== null ? `還有 ${daysLeft} 天`
                                : `每 ${task.intervalDays} 天一次`}
                            </span>
                          )}
                          {task.weeklyMax && <span style={badgeStyle(isOverdue ? 'neutral' : 'warning')}>{weeklyInfo}</span>}
                          {dueDate && !isOverdue && <span style={badgeStyle('neutral')}>到期：{toDateTime(dueDate.toISOString())}</span>}
                        </>}
                        actions={<ActionButton tone="success" onClick={() => markPeriodicDone(task)}>✅ 標記完成</ActionButton>}
                      />
                    );
                  })}
                </div>
              ) : <EmptyState title="載入週期任務中…" subtitle="如沒顯示請重新整理。" />}
            </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>🧩 異常處理範本</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>改成由後端保存；若沒有自訂資料，系統會自動回填預設範本。</div>
                </div>
                <span style={badgeStyle('purple')}>{resolutionTemplates.length} 個</span>
              </div>
              <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input value={templateDraft.label} onChange={(e) => setTemplateDraft((s) => ({ ...s, label: e.target.value, id: s.id || e.target.value }))} style={inputStyle} placeholder="範本名稱（例：聯絡獸醫）" />
                  <input value={templateDraft.id} onChange={(e) => setTemplateDraft((s) => ({ ...s, id: e.target.value }))} style={inputStyle} placeholder="代號（英文，可選）" />
                </div>
                <textarea value={templateDraft.note} onChange={(e) => setTemplateDraft((s) => ({ ...s, note: e.target.value }))} rows={3} style={inputStyle} placeholder="預設處理內容" />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={addResolutionTemplate} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>➕ 新增範本</button>
                  <button onClick={resetTemplateDraft} style={subtleButton}>↺ 清空</button>
                </div>
              </div>
              {resolutionTemplates.length ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {resolutionTemplates.map((template) => (
                    <RecordCard
                      key={template.id}
                      title={<>{template.label}</>}
                      meta={<>{template.note}</>}
                      chips={<><span style={badgeStyle('neutral')}>{template.id}</span></>}
                      actions={<ActionButton tone="danger" onClick={() => removeResolutionTemplate(template.id)}>✕ 移除</ActionButton>}
                    />
                  ))}
                </div>
              ) : <EmptyState title="尚未建立處理範本" subtitle="至少保留一個範本，異常紀錄頁才有快速處理捷徑。" />}
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

      {detailModal && (
        <div onClick={() => setDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(29, 19, 28, 0.48)', backdropFilter: 'blur(10px)', display: 'grid', alignItems: 'end', zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '18px 16px 22px', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gap: '12px' }}>
            <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'rgba(61,44,53,0.14)', margin: '0 auto' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.4 }}>{detailModal.title}</div>
                {detailModal.meta && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>{detailModal.meta}</div>}
              </div>
              <button onClick={() => setDetailModal(null)} style={{ ...subtleButton, padding: '6px 10px' }}>關閉</button>
            </div>
            {detailModal.chips && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{detailModal.chips}</div>}
            {detailModal.body && <div style={{ borderRadius: '16px', padding: '12px', background: 'rgba(61,44,53,0.03)', color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.7 }}>{detailModal.body}</div>}
            {detailModal.actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{detailModal.actions}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
