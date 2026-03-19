import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { del, get, post } from '../api/client';
import { getTaskStatus, type TaskStatus } from '../utils/taskStatus';
import { useAppStore } from '../store/useAppStore';
import type { CatProfile, Checkin, Settings, Task } from '../store/useAppStore';

type AdminTab = 'today' | 'incidents' | 'activity' | 'manage' | 'settings';
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
  const [activeTab, setActiveTab] = useState<AdminTab>('today');
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
  const [allUnacknowledgedSelfReports, setAllUnacknowledgedSelfReports] = useState<SelfReportRow[]>([]);
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
    const [checkinsData, adhocData, selfReportData, incidentData, allIncidentData, allSelfReportData] = await Promise.all([
      get<Checkin[]>(`/api/checkins?date=${todayLocal()}`).catch(() => []),
      get<AdhocTask[]>('/api/adhoc').catch(() => []),
      get<SelfReportRow[]>(`/api/selfreports?date=${todayLocal()}`).catch(() => []),
      get<IncidentRow[]>(`/api/incidents?date=${todayLocal()}`).catch(() => []),
      get<IncidentRow[]>('/api/incidents').catch(() => []),
      get<SelfReportRow[]>('/api/selfreports').catch(() => []),
    ]);
    setTodayCheckins(checkinsData);
    setAdhoc(adhocData);
    setSelfReports(selfReportData);
    setIncidents(incidentData);
    const allUnresolved = allIncidentData.filter((inc) => !inc.resolved);
    setAllUnresolvedIncidents(allUnresolved);
    setAllUnacknowledgedSelfReports(allSelfReportData.filter((r) => !r.acknowledged));
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
    if (activeTab === 'today') {
      loadOverview().catch(() => undefined);
    }
    if (activeTab === 'incidents') {
      loadOverview().catch(() => undefined);
    }
    if (activeTab === 'activity') {
      loadRecords(recordsDate).catch(() => undefined);
    }
    if (activeTab === 'settings') {
      loadWeights().catch(() => undefined);
    }
    if (activeTab === 'manage') {
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
  const _todayDoneSpecial = adhoc.filter((row) => row.done && row.doneAt?.slice(0, 10) === todayLocal()); void _todayDoneSpecial;
  const pendingSpecial = adhoc.filter((row) => !row.done);
  const selectedDateSpecial = adhoc.filter((row) => row.done && row.doneAt?.slice(0, 10) === recordsDate);
  const taskMap = useMemo(() => Object.fromEntries(tasks.map((task) => [task.id, task])), [tasks]);
  const unresolvedIncidents = incidents.filter((row) => !row.resolved);
  const resolvedIncidents = incidents.filter((row) => row.resolved);
  const unacknowledgedSelfReports = selfReports.filter((row) => !row.acknowledged);
  const acknowledgedSelfReports = selfReports.filter((row) => row.acknowledged); void acknowledgedSelfReports;

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
  const overduePeriodicTasks = useMemo(() => {
    const now = new Date();
    return periodicTasks.filter((task) => {
      if (task.intervalDays) {
        if (!task.lastDoneAt) return true;
        const due = new Date(task.lastDoneAt);
        due.setDate(due.getDate() + task.intervalDays);
        return due < now;
      }
      return false;
    });
  }, [periodicTasks]);
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
    setActiveTab('manage');
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
      await loadOverview();
      if (activeTab === 'activity') await loadRecords(recordsDate);
    });
  };

  const acknowledgeSelfReport = async (id: string, processingStatus?: 'pending' | 'in-progress' | 'completed') => {
    const prompted = window.prompt('可選：留下確認註記（例如已查看、稍後補貨、正在處理）', '');
    if (prompted === null) return; // user cancelled
    const note = prompted;
    await withBusy(async () => {
      await post(`/api/selfreports/${id}/ack`, { note: note.trim(), processingStatus });
      const statusLabel = processingStatus === 'in-progress' ? '（處理中）' : processingStatus === 'completed' ? '（已完成）' : '';
      flash(note.trim() ? `已確認回報並附上註記${statusLabel}` : `已確認收到回報${statusLabel}`);
      setDetailModal(null);
      // Load overview first (always needed), then activity if on that tab
      await loadOverview();
      if (activeTab === 'activity') await loadRecords(recordsDate);
    });
  };

  const cancelAcknowledgment = async (id: string) => {
    if (!window.confirm('取消這個回報的確認狀態？之後可以重新確認。')) return;
    await withBusy(async () => {
      await post(`/api/selfreports/${id}/unack`, {});
      flash('已取消確認狀態');
      setDetailModal(null);
      await loadOverview();
      if (activeTab === 'activity') await loadRecords(recordsDate);
    });
  };

  const deleteSelfReport = async (id: string) => {
    if (!window.confirm('刪除此主動回報？')) return;
    await withBusy(async () => {
      await del(`/api/selfreports/${id}`);
      flash('已刪除主動回報');
      await loadOverview();
      if (activeTab === 'activity') await loadRecords(recordsDate);
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
      await loadOverview();
      if (activeTab === 'activity') await loadRecords(recordsDate);
    });
  };

  const deleteIncident = async (id: string) => {
    if (!window.confirm('刪除此異常回報？')) return;
    await withBusy(async () => {
      await del(`/api/incidents/${id}`);
      flash('已刪除異常回報');
      await loadOverview();
      if (activeTab === 'activity') await loadRecords(recordsDate);
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
      if (activeTab === 'activity') await loadRecords(recordsDate);
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
    <div style={{ paddingBottom: '80px', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── TOP BAR ───────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, #c084fc 100%)',
        padding: '18px 16px 0',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛠️ Admin
              {(allUnresolvedIncidents.length > 0 || overdueCount > 0) && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: '999px', padding: '2px 8px' }}>
                  {allUnresolvedIncidents.length + overdueCount} 待處理
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', opacity: 0.88, marginTop: '2px' }}>
              {catName} · {todayLocal()} · v{settings?.appVersion || '5.7'}
            </div>
          </div>
          <button
            onClick={() => { setAdminMode(false); onLogout?.(); }}
            style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: '20px', padding: '7px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
          >
            登出
          </button>
        </div>

        {/* ── TABS ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '0' }}>
          {([
            ['today',     '今日',   doneCount + '/' + (totalCount||0)],
            ['incidents', '🆘 異常', allUnresolvedIncidents.length > 0 ? String(allUnresolvedIncidents.length) : ''],
            ['activity',  '📋 紀錄', ''],
            ['manage',    '✏️ 任務', ''],
            ['settings',  '⚙️ 設定', ''],
          ] as [AdminTab, string, string][]).map(([key, label, badge]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                border: 'none',
                borderRadius: '12px 12px 0 0',
                padding: '9px 14px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                whiteSpace: 'nowrap',
                position: 'relative',
                background: activeTab === key ? 'var(--bg-card)' : 'rgba(255,255,255,0.12)',
                color: activeTab === key ? 'var(--primary)' : 'rgba(255,255,255,0.88)',
                transition: 'all 0.15s',
              }}
            >
              {label}
              {badge && (
                <span style={{ marginLeft: '5px', fontSize: '0.68rem', fontWeight: 800, background: key === 'incidents' ? '#ef4444' : 'rgba(255,255,255,0.3)', color: '#fff', borderRadius: '999px', padding: '1px 6px' }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── FLASH MESSAGE ─────────────────────────────────── */}
      <div style={{ padding: '0 14px' }}>
        {message && (
          <div style={{
            margin: '10px 0 0',
            background: message.startsWith('❌') ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.12)',
            border: `1px solid ${message.startsWith('❌') ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.28)'}`,
            color: message.startsWith('❌') ? '#b91c1c' : '#15803d',
            borderRadius: '12px',
            padding: '9px 12px',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}>
            {message}
          </div>
        )}
        {busy && (
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>⏳ 處理中…</div>
        )}
      </div>

      <div style={{ padding: '12px 14px', display: 'grid', gap: '12px' }}>

        {/* ════════════════════════════════════════════════════
            TAB: 今日 TODAY
            ════════════════════════════════════════════════════ */}
        {activeTab === 'today' && (
          <div style={{ display: 'grid', gap: '12px' }}>

            {/* ── URGENT BANNER ─────────────────────────────── */}
            {(allUnresolvedIncidents.length > 0 || overdueCount > 0 || overduePeriodicTasks.length > 0) && (
              <div style={{ background: 'linear-gradient(135deg, #fef2f2, #fff5f5)', border: '2px solid #fca5a5', borderRadius: '18px', padding: '14px 16px' }}>
                <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '0.9rem', marginBottom: '10px' }}>
                  🚨 需要立即注意
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {allUnresolvedIncidents.length > 0 && (
                    <button
                      onClick={() => setActiveTab('incidents')}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #fca5a5', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >
                      <span style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.88rem' }}>🆘 未處理異常</span>
                      <span style={{ background: '#ef4444', color: '#fff', borderRadius: '999px', padding: '3px 10px', fontSize: '0.78rem', fontWeight: 800 }}>{allUnresolvedIncidents.length} 件 →</span>
                    </button>
                  )}
                  {overdueCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #fca5a5', borderRadius: '12px', padding: '10px 14px' }}>
                      <span style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.88rem' }}>⏰ 任務已逾時</span>
                      <span style={{ background: '#f97316', color: '#fff', borderRadius: '999px', padding: '3px 10px', fontSize: '0.78rem', fontWeight: 800 }}>{overdueCount} 項</span>
                    </div>
                  )}
                  {overduePeriodicTasks.length > 0 && (
                    <button
                      onClick={() => setActiveTab('manage')}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #fde68a', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >
                      <span style={{ fontWeight: 700, color: '#92400e', fontSize: '0.88rem' }}>
                        🔁 逾期護理：{overduePeriodicTasks.map(t => t.icon + t.name).join('、')}
                      </span>
                      <span style={{ background: '#f59e0b', color: '#fff', borderRadius: '999px', padding: '3px 10px', fontSize: '0.78rem', fontWeight: 800 }}>{overduePeriodicTasks.length} 項 →</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── STAT CARDS ────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[
                {
                  label: '完成率',
                  value: `${pct}%`,
                  sub: `${doneCount}/${totalCount} 項`,
                  bg: pct === 100 ? '#f0fdf4' : pct >= 50 ? '#fefce8' : '#fef2f2',
                  color: pct === 100 ? '#15803d' : pct >= 50 ? '#a16207' : '#b91c1c',
                },
                {
                  label: '待確認',
                  value: String(allUnacknowledgedSelfReports.length),
                  sub: `共 ${selfReports.length} 則回報`,
                  bg: allUnacknowledgedSelfReports.length > 0 ? '#fffbeb' : '#f8fafc',
                  color: allUnacknowledgedSelfReports.length > 0 ? '#b45309' : '#64748b',
                },
                {
                  label: '最新體重',
                  value: latestWeight ? `${latestWeight.catWeight}kg` : '—',
                  sub: latestWeight ? toDateTime(latestWeight.measuredAt) : '未記錄',
                  bg: '#f8fafc',
                  color: '#475569',
                },
              ].map((s) => (
                <div key={s.label} style={{ background: s.bg, borderRadius: '16px', padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '4px' }}>{s.label}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '3px' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* ── UNACKNOWLEDGED SELF REPORTS ───────────────── */}
            {allUnacknowledgedSelfReports.length > 0 && (
              <div style={{ ...sectionCard, borderTop: '3px solid #f59e0b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.9rem' }}>📝 待確認回報</div>
                  <span style={badgeStyle('warning')}>{allUnacknowledgedSelfReports.length} 則</span>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {unacknowledgedSelfReports.slice(0, 5).map((row) => (
                    <div key={row.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '1.2rem', flexShrink: 0 }}>{row.icon || '📝'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '2px' }}>{row.title}{row.quantity && row.quantity > 1 ? ` ×${row.quantity}` : ''}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button onClick={() => acknowledgeSelfReport(row.id, 'pending')} style={{ ...buttonBase, padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(74,222,128,0.12)', color: '#15803d', border: '1px solid rgba(74,222,128,0.3)' }}>✓ 確認</button>
                      </div>
                    </div>
                  ))}
                  {allUnacknowledgedSelfReports.length > 5 && (
                    <button onClick={() => setActiveTab('activity')} style={{ ...subtleButton, fontSize: '0.78rem' }}>還有 {allUnacknowledgedSelfReports.length - 5} 則 →</button>
                  )}
                </div>
              </div>
            )}

            {/* ── TASK TIMELINE ─────────────────────────────── */}
            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                  ⏱️ 任務狀況
                  <span style={{ marginLeft: '8px', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>{completionSummary}</span>
                </div>
                <button onClick={() => setRefreshKey(k => k + 1)} style={{ ...subtleButton, padding: '5px 10px', fontSize: '0.76rem' }}>🔄</button>
              </div>

              {timelineRows.length ? (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {/* Overdue + Pending first, then done/skip collapsed */}
                  {[
                    { rows: timelineGroups.overdue, label: '已逾時', color: '#ef4444', bg: 'rgba(248,113,113,0.07)', badge: 'danger' as const },
                    { rows: timelineGroups.pending, label: '待處理', color: '#f59e0b', bg: 'rgba(245,158,11,0.05)', badge: 'warning' as const },
                  ].map((g) => g.rows.length ? (
                    <div key={g.label}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: g.color, marginBottom: '4px', paddingLeft: '4px' }}>{g.label} ({g.rows.length})</div>
                      {g.rows.map((row) => (
                        <div key={row.task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '10px', background: g.bg, border: `1px solid ${g.color}33`, marginBottom: '4px' }}>
                          <span style={{ fontSize: '1.1rem' }}>{row.task.icon || '📋'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{row.task.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>預定 {(row.task.scheduledTimes || []).join('、') || '—'}</div>
                          </div>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: g.color }}>{g.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : null)}

                  {/* Done + Skip summary */}
                  {(timelineGroups.done.length > 0 || timelineGroups.skip.length > 0) && (
                    <details style={{ marginTop: '4px' }}>
                      <summary style={{ fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', userSelect: 'none' }}>
                        ✅ 已完成 {timelineGroups.done.length} · 略過 {timelineGroups.skip.length}
                      </summary>
                      <div style={{ marginTop: '6px', display: 'grid', gap: '4px' }}>
                        {[...timelineGroups.done, ...timelineGroups.skip].map((row) => (
                          <div key={row.task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '10px', background: row.status === 'done' ? 'rgba(74,222,128,0.06)' : 'rgba(61,44,53,0.04)' }}>
                            <span style={{ fontSize: '1rem' }}>{row.task.icon || '📋'}</span>
                            <div style={{ flex: 1, fontSize: '0.82rem' }}>{row.task.name}</div>
                            <span style={{ fontSize: '0.7rem', color: row.status === 'done' ? '#15803d' : '#94a3b8' }}>
                              {row.status === 'done' ? `✓ ${toClock(row.checkin?.time)}` : '略過'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <EmptyState title="今天沒有排程任務" />
              )}
            </div>

            {/* ── TODAY'S ACTIVITY FEED (last 6) ──────────── */}
            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>📰 今日最新動態</div>
                <button onClick={() => setActiveTab('activity')} style={{ ...subtleButton, fontSize: '0.76rem', padding: '5px 10px' }}>全部 →</button>
              </div>
              {(() => {
                const events = [
                  ...todayCheckins.map(r => ({ ts: r.time, kind: 'checkin' as const, data: r })),
                  ...selfReports.map(r => ({ ts: r.reportedAt, kind: 'report' as const, data: r })),
                  ...incidents.map(r => ({ ts: r.reportedAt, kind: 'incident' as const, data: r })),
                  ...adhoc.filter(r => r.done && r.doneAt?.slice(0,10) === todayLocal()).map(r => ({ ts: r.doneAt || r.createdAt, kind: 'adhoc' as const, data: r })),
                ].sort((a,b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 6);

                return events.length ? (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {events.map((ev, i) => {
                      if (ev.kind === 'checkin') {
                        const r = ev.data as Checkin;
                        const task = taskMap[r.taskId] || { icon: '📋', name: r.taskId };
                        return <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px', borderRadius: '10px', background: 'rgba(74,222,128,0.06)' }}>
                          <span>{task.icon}</span><div style={{ flex: 1, fontSize: '0.83rem', fontWeight: 600 }}>{task.name}</div><span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{toClock(r.time)} {r.isDone ? '✓' : '⏭'}</span>
                        </div>;
                      }
                      if (ev.kind === 'report') {
                        const r = ev.data as SelfReportRow;
                        return <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px', borderRadius: '10px', background: 'rgba(245,158,11,0.06)' }}>
                          <span>{r.icon || '📝'}</span><div style={{ flex: 1, fontSize: '0.83rem', fontWeight: 600 }}>{r.title}</div><span style={{ fontSize: '0.72rem', color: r.acknowledged ? '#15803d' : '#b45309' }}>{r.acknowledged ? '已確認' : '待確認'}</span>
                        </div>;
                      }
                      if (ev.kind === 'incident') {
                        const r = ev.data as IncidentRow;
                        return <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px', borderRadius: '10px', background: 'rgba(248,113,113,0.06)' }}>
                          <span>🆘</span><div style={{ flex: 1, fontSize: '0.83rem', fontWeight: 600 }}>{r.type}</div><span style={{ fontSize: '0.72rem', color: r.resolved ? '#15803d' : '#b91c1c' }}>{r.resolved ? '已處理' : '待處理'}</span>
                        </div>;
                      }
                      const r = ev.data as AdhocTask;
                      return <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px', borderRadius: '10px', background: 'rgba(139,92,246,0.05)' }}>
                        <span>{r.icon}</span><div style={{ flex: 1, fontSize: '0.83rem', fontWeight: 600 }}>{r.name}</div><span style={{ fontSize: '0.72rem', color: '#7c3aed' }}>特殊任務</span>
                      </div>;
                    })}
                  </div>
                ) : <EmptyState title="今天還沒有動態" />;
              })()}
            </div>

          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: 🆘 異常 INCIDENTS
            ════════════════════════════════════════════════════ */}
        {activeTab === 'incidents' && (
          <div style={{ display: 'grid', gap: '12px' }}>

            {/* All Unresolved */}
            {allUnresolvedIncidents.length > 0 ? (
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '8px', color: '#b91c1c' }}>
                  🆘 未處理 ({allUnresolvedIncidents.length})
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {allUnresolvedIncidents.map((row) => (
                    <div key={row.id} style={{ background: '#fff', border: '2px solid #fca5a5', borderRadius: '18px', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ fontSize: '2rem', lineHeight: 1 }}>🆘</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '1rem' }}>{row.type}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {toDateTime(row.reportedAt)}
                            {row.note ? ` · ${row.note}` : ''}
                            {row.severity && ` · ${row.severity === 'critical' ? '🔴 緊急' : row.severity === 'high' ? '🟠 高' : row.severity === 'medium' ? '🟡 中' : '🟢 低'}`}
                          </div>
                          {row.hasPhoto && <div style={{ marginTop: '4px' }}><button onClick={() => openIncidentPhoto(row.id)} style={{ ...subtleButton, fontSize: '0.74rem', padding: '4px 8px' }}>🖼 查看照片</button></div>}
                        </div>
                      </div>
                      {/* Quick resolve buttons */}
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px' }}>快速處理：</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {resolutionTemplates.slice(0, 4).map((tpl) => (
                            <button key={tpl.id} onClick={() => resolveIncident(row.id, tpl.id)} style={{ ...buttonBase, padding: '7px 12px', fontSize: '0.78rem', background: 'rgba(74,222,128,0.1)', color: '#15803d', border: '1px solid rgba(74,222,128,0.3)' }}>
                              ✓ {tpl.label}
                            </button>
                          ))}
                          <button onClick={() => resolveIncident(row.id)} style={{ ...buttonBase, padding: '7px 12px', fontSize: '0.78rem', background: 'var(--glass)', color: 'var(--text-secondary)' }}>
                            ✏️ 自訂…
                          </button>
                        </div>
                        <button onClick={() => deleteIncident(row.id)} style={{ ...buttonBase, padding: '6px 10px', fontSize: '0.74rem', color: '#dc2626', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', width: 'fit-content', marginTop: '2px' }}>
                          🗑 刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ ...sectionCard, textAlign: 'center', padding: '32px', background: '#f0fdf4', border: '1px solid rgba(74,222,128,0.3)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 800, color: '#15803d', fontSize: '1rem' }}>目前沒有未處理異常</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>所有案件已妥善處理</div>
              </div>
            )}

            {/* All resolved incidents (recent 10) */}
            {(() => {
              // Derive from allUnresolvedIncidents's sibling — we use a combined approach
              // Since we fetch all incidents in loadOverview, resolved = those not in allUnresolved
              // But we don't store allResolved separately; use incidents (today's) as a proxy for now,
              // supplemented by checking if any recently resolved ones can be shown
              const recentResolved = resolvedIncidents;
              return recentResolved.length > 0 ? (
              <details>
                <summary style={{ fontWeight: 700, fontSize: '0.84rem', color: '#64748b', cursor: 'pointer', padding: '8px 4px' }}>
                  ✅ 近日已處理 ({recentResolved.length})
                </summary>
                <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                  {recentResolved.map((row) => (
                    <RecordCard
                      key={row.id}
                      tone="success"
                      title={<>✅ {row.type}</>}
                      meta={<>{toDateTime(row.reportedAt)} · 處理：{toDateTime(row.resolvedAt)} {row.resolvedNote ? `· ${row.resolvedNote}` : ''}</>}
                      chips={<>{row.resolutionTemplate && <span style={badgeStyle('success')}>範本：{resolutionTemplates.find(t => t.id === row.resolutionTemplate)?.label}</span>}</>}
                      actions={<ActionButton tone="danger" onClick={() => deleteIncident(row.id)}>🗑</ActionButton>}
                    />
                  ))}
                </div>
              </details>
              ) : null;
            })()}

            {/* Self Reports section */}
            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                  📝 今日回報
                  {allUnacknowledgedSelfReports.length > 0 && <span style={{ marginLeft: '6px', ...badgeStyle('warning') }}>{allUnacknowledgedSelfReports.length} 待確認</span>}
                </div>
              </div>
              {selfReports.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {selfReports.map((row) => {
                    const statusTone = row.processingStatus === 'completed' ? 'success' : row.processingStatus === 'in-progress' ? 'purple' : row.acknowledged ? 'neutral' : 'warning';
                    const statusLabel = row.processingStatus === 'in-progress' ? '處理中' : row.processingStatus === 'completed' ? '已完成' : row.acknowledged ? '已確認' : '待確認';
                    return (
                      <div key={row.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: row.acknowledged ? 'rgba(61,44,53,0.03)' : 'rgba(245,158,11,0.06)', border: `1px solid ${row.acknowledged ? 'rgba(61,44,53,0.08)' : 'rgba(245,158,11,0.25)'}`, borderRadius: '12px', padding: '10px 12px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{row.icon || '📝'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{row.title}{row.quantity && row.quantity > 1 ? ` ×${row.quantity}${row.unit || ''}` : ''}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{toDateTime(row.reportedAt)}{row.note ? ` · ${row.note}` : ''}</div>
                          <div style={{ marginTop: '4px' }}><span style={badgeStyle(statusTone)}>{statusLabel}</span></div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                          {!row.acknowledged ? (
                            <>
                              <button onClick={() => acknowledgeSelfReport(row.id, 'pending')} style={{ ...buttonBase, padding: '5px 10px', fontSize: '0.74rem', background: 'rgba(74,222,128,0.1)', color: '#15803d', border: '1px solid rgba(74,222,128,0.3)' }}>✓ 確認</button>
                              <button onClick={() => acknowledgeSelfReport(row.id, 'completed')} style={{ ...buttonBase, padding: '5px 10px', fontSize: '0.74rem', background: 'rgba(74,222,128,0.1)', color: '#15803d', border: '1px solid rgba(74,222,128,0.3)' }}>✅ 完成</button>
                            </>
                          ) : (
                            <button onClick={() => cancelAcknowledgment(row.id)} style={{ ...buttonBase, padding: '5px 8px', fontSize: '0.72rem' }}>↩</button>
                          )}
                          <button onClick={() => deleteSelfReport(row.id)} style={{ ...buttonBase, padding: '5px 8px', fontSize: '0.72rem', color: '#dc2626' }}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="今日沒有回報" />}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: 📋 紀錄 ACTIVITY
            ════════════════════════════════════════════════════ */}
        {activeTab === 'activity' && (
          <div style={{ display: 'grid', gap: '12px' }}>

            {/* Date picker */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={recordsDate} onChange={(e) => { setRecordsDate(e.target.value); setRecordsFilter('all'); }} style={{ ...inputStyle, maxWidth: '180px', fontSize: '0.86rem', padding: '9px 10px' }} />
              <button onClick={() => loadRecords(recordsDate)} style={subtleButton}>🔄</button>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={badgeStyle('neutral')}>打卡 {recordCheckins.length}</span>
                <span style={badgeStyle('warning')}>回報 {selfReports.length}</span>
                <span style={badgeStyle(unresolvedIncidents.length ? 'danger' : 'neutral')}>異常 {incidents.length}</span>
              </div>
            </div>

            {/* Stream filters */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {([
                ['all', `全部 ${recordStream.length}`],
                ['attention', `⚠️ 待注意 ${recordStream.filter(i => i.lane === 'attention').length}`],
                ['checkins', `打卡 ${recordCheckins.length}`],
                ['reports',  `回報 ${selfReports.length}`],
                ['incidents', `異常 ${incidents.length}`],
                ['special',   `特殊 ${selectedDateSpecial.length}`],
              ] as [typeof recordsFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRecordsFilter(key)}
                  style={{ ...buttonBase, padding: '7px 11px', fontSize: '0.76rem', background: recordsFilter === key ? 'linear-gradient(135deg, var(--primary), #c084fc)' : 'var(--glass)', color: recordsFilter === key ? '#fff' : 'var(--text-secondary)' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Toggle granular time */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={granularTime} onChange={(e) => persistGranularTimeSetting(e.target.checked)} />
              細粒度時間分組（小時）
            </label>

            {/* Unified stream */}
            {filteredRecordStream.length ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {(() => {
                  const grouped: Record<string, RecordStreamItem[]> = {};
                  filteredRecordStream.forEach((item) => {
                    const g = getTimeGroup(item.timestamp, granularTime);
                    if (!grouped[g]) grouped[g] = [];
                    grouped[g].push(item);
                  });
                  const groupOrder = granularTime
                    ? ['🌙 深夜 (00:00-02:59)', '🌃 清晨 (03:00-05:59)', '🌅 早晨 (06:00-08:59)', '☀️ 上午 (09:00-11:59)', '☀️ 中午 (12:00-14:59)', '🌤️ 下午 (15:00-17:59)', '🌆 傍晚 (18:00-20:59)', '🌙 晚上 (21:00-23:59)', '🕐 時間未知']
                    : ['🌅 早上 (05:00-11:59)', '☀️ 下午 (12:00-16:59)', '🌆 傍晚 (17:00-20:59)', '🌙 晚上 (21:00-04:59)', '🕐 時間未知'];
                  return groupOrder.flatMap((gl) => {
                    const items = grouped[gl];
                    if (!items?.length) return [];
                    return [
                      <div key={`h-${gl}`} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', padding: '6px 8px', background: 'rgba(155,135,245,0.08)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{gl}</span><span style={{ color: 'var(--text-muted)' }}>{items.length} 筆</span>
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
                      )),
                    ];
                  });
                })()}
              </div>
            ) : <EmptyState title="這個篩選下沒有紀錄" subtitle="換個 filter 或改日期試試" />}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: ✏️ 任務 MANAGE
            ════════════════════════════════════════════════════ */}
        {activeTab === 'manage' && (
          <div style={{ display: 'grid', gap: '12px' }}>

            {/* ── 週期任務 ─────────────────────────────────── */}
            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                  🔁 週期護理
                  {overduePeriodicTasks.length > 0 && <span style={{ marginLeft: '6px', ...badgeStyle('danger') }}>{overduePeriodicTasks.length} 逾期</span>}
                </div>
                <button onClick={() => loadPeriodicTasks()} style={{ ...subtleButton, fontSize: '0.76rem', padding: '5px 10px' }}>🔄</button>
              </div>
              {periodicTasks.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {periodicTasks.map((task) => {
                    const now = new Date();
                    let daysLeft: number | null = null;
                    let isOverdue = false;
                    if (task.intervalDays && task.lastDoneAt) {
                      const due = new Date(task.lastDoneAt);
                      due.setDate(due.getDate() + task.intervalDays);
                      daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86400000);
                      isOverdue = daysLeft < 0;
                    } else if (task.intervalDays && !task.lastDoneAt) {
                      isOverdue = true;
                    }
                    const tone: 'danger' | 'warning' | 'success' | 'default' = isOverdue ? 'danger' : (daysLeft !== null && daysLeft <= 3) ? 'warning' : task.lastDoneAt ? 'success' : 'warning';
                    return (
                      <div key={task.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', background: isOverdue ? 'rgba(248,113,113,0.06)' : 'rgba(61,44,53,0.03)', border: `1px solid ${isOverdue ? 'rgba(248,113,113,0.25)' : 'rgba(61,44,53,0.08)'}` }}>
                        <span style={{ fontSize: '1.3rem' }}>{task.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{task.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {task.lastDoneAt ? `上次：${toDateTime(task.lastDoneAt)}` : '從未完成'}
                            {task.intervalDays && ` · 每 ${task.intervalDays} 天`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          <span style={badgeStyle(tone)}>
                            {isOverdue ? `逾 ${Math.abs(daysLeft ?? 0)} 天` : daysLeft === 0 ? '今天' : daysLeft !== null ? `${daysLeft}d` : '—'}
                          </span>
                          <button onClick={() => markPeriodicDone(task)} style={{ ...buttonBase, padding: '6px 12px', fontSize: '0.76rem', background: 'rgba(74,222,128,0.12)', color: '#15803d', border: '1px solid rgba(74,222,128,0.3)' }}>
                            ✅ 完成
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="載入中…" />}
            </div>

            {/* ── 特殊任務派發 ─────────────────────────────── */}
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '10px' }}>✨ 派發特殊任務</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {specialPresets.map((preset) => (
                  <button key={preset.id} onClick={() => setSpecialForm({ icon: preset.icon, name: preset.name, note: preset.note || '' })} style={{ ...subtleButton, fontSize: '0.78rem', padding: '6px 10px' }}>
                    {preset.icon} {preset.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '8px' }}>
                  <input value={specialForm.icon} onChange={(e) => setSpecialForm(s => ({ ...s, icon: e.target.value }))} style={inputStyle} placeholder="圖示" />
                  <input value={specialForm.name} onChange={(e) => setSpecialForm(s => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="任務名稱" />
                </div>
                <input value={specialForm.note} onChange={(e) => setSpecialForm(s => ({ ...s, note: e.target.value }))} style={inputStyle} placeholder="備註（選填）" />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={dispatchSpecialTask} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>🚀 派發</button>
                  <button onClick={addCurrentAsPreset} style={subtleButton}>💾 存快捷</button>
                </div>
              </div>
            </div>

            {/* Pending special */}
            {pendingSpecial.length > 0 && (
              <div style={sectionCard}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '10px' }}>📌 待完成特殊任務 ({pendingSpecial.length})</div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {pendingSpecial.map((row) => (
                    <RecordCard
                      key={row.id}
                      tone="warning"
                      title={<>{row.icon} {row.name}</>}
                      meta={<>{toDateTime(row.createdAt)}{row.note ? ` · ${row.note}` : ''}</>}
                      chips={<span style={badgeStyle('warning')}>待完成</span>}
                      actions={<ActionButton tone="danger" onClick={() => deleteSpecialTask(row.id)}>🗑</ActionButton>}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Quick preset manager */}
            {specialPresets.length > 0 && (
              <details>
                <summary style={{ fontWeight: 700, fontSize: '0.84rem', color: '#64748b', cursor: 'pointer', padding: '8px 4px' }}>⚙️ 快捷任務管理 ({specialPresets.length})</summary>
                <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                  {specialPresets.map((preset) => (
                    <RecordCard
                      key={preset.id}
                      title={<>{preset.icon} {preset.name}</>}
                      meta={<>{preset.note || '—'}</>}
                      actions={<ActionButton tone="danger" onClick={() => savePresets(specialPresets.filter(r => r.id !== preset.id))}>✕</ActionButton>}
                    />
                  ))}
                </div>
              </details>
            )}

            {/* ── 任務排程 ─────────────────────────────────── */}
            <div ref={taskFormRef} style={sectionCard}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '10px' }}>{taskForm.id ? '✏️ 編輯任務' : '＋ 新增任務'}</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '8px' }}>
                  <input value={taskForm.icon} onChange={(e) => setTaskForm(s => ({ ...s, icon: e.target.value }))} style={inputStyle} placeholder="圖示" />
                  <input value={taskForm.name} onChange={(e) => setTaskForm(s => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="任務名稱" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <select value={taskForm.type} onChange={(e) => setTaskForm(s => ({ ...s, type: e.target.value }))} style={inputStyle}>
                    {[['other','一般'],['meal','餐食'],['treat','零食'],['weight','量體重'],['litter','清貓砂'],['water','換水'],['groom','美容/梳毛'],['feeder','自動餵食機']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select value={taskForm.scheduleType} onChange={(e) => setTaskForm(s => ({ ...s, scheduleType: e.target.value }))} style={inputStyle}>
                    {[['daily','每日'],['weekly','每週指定日'],['weekdays','平日'],['weekends','週末']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {taskForm.scheduleType === 'weekly' && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {weekDayLabels.map((label, index) => {
                      const active = taskForm.weekDays.includes(index);
                      return (
                        <button key={label} type="button" onClick={() => setTaskForm(s => ({ ...s, weekDays: active ? s.weekDays.filter(d => d !== index) : [...s.weekDays, index] }))}
                          style={{ ...buttonBase, padding: '7px 12px', background: active ? 'linear-gradient(135deg, var(--primary), #c084fc)' : 'var(--glass)', color: active ? '#fff' : 'var(--text-secondary)' }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="time" value={taskForm.newTime} onChange={(e) => setTaskForm(s => ({ ...s, newTime: e.target.value }))} style={{ ...inputStyle, maxWidth: '140px' }} />
                  <button type="button" onClick={() => { if (!taskForm.newTime || taskForm.scheduledTimes.includes(taskForm.newTime)) return; setTaskForm(s => ({ ...s, scheduledTimes: [...s.scheduledTimes, s.newTime].sort(), newTime: '' })); }} style={subtleButton}>＋ 加時間</button>
                </div>
                {!!taskForm.scheduledTimes.length && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {taskForm.scheduledTimes.map((time) => (
                      <span key={time} style={{ background: 'rgba(255,133,161,0.12)', border: '1px solid rgba(255,133,161,0.24)', color: 'var(--primary)', borderRadius: '999px', padding: '5px 10px', fontSize: '0.76rem' }}>
                        {time} <button type="button" onClick={() => setTaskForm(s => ({ ...s, scheduledTimes: s.scheduledTimes.filter(t => t !== time) }))} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', marginLeft: '4px' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                  <select value={taskForm.resultPreset} onChange={(e) => setTaskForm(s => ({ ...s, resultPreset: e.target.value }))} style={inputStyle}>
                    <option value="none">不需要結果選項</option>
                    <option value="feed">餵食結果</option>
                    <option value="treat">零食結果</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={taskForm.requireNote} onChange={(e) => setTaskForm(s => ({ ...s, requireNote: e.target.checked }))} />
                    需備註
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={saveTask} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>💾 儲存</button>
                  <button onClick={resetTaskForm} style={subtleButton}>↺ 清空</button>
                </div>
              </div>
            </div>

            {/* Task list */}
            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>排程任務 ({tasks.length})</div>
              </div>
              {tasks.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {tasks.map((task) => (
                    <RecordCard
                      key={task.id}
                      title={<>{task.icon || '📋'} {task.name}</>}
                      meta={<>{scheduleLabel[task.scheduleType || 'daily']}{task.weekDays?.length ? ` · ${task.weekDays.map(d => weekDayLabels[d]).join('、')}` : ''}</>}
                      chips={<>{(task.scheduledTimes || []).map(t => <span key={t} style={badgeStyle('purple')}>{t}</span>)}{task.requireNote && <span style={badgeStyle('warning')}>需備註</span>}</>}
                      actions={<>
                        <ActionButton onClick={() => editTask(task)}>✏️</ActionButton>
                        <ActionButton tone="danger" onClick={() => removeTask(task.id)}>🗑</ActionButton>
                      </>}
                    />
                  ))}
                </div>
              ) : <EmptyState title="尚無任務" />}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: ⚙️ 設定 SETTINGS
            ════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div style={{ display: 'grid', gap: '12px' }}>

            {/* Cat profile */}
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '10px' }}>🐾 貓咪資料</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <input value={catForm.name || ''} onChange={(e) => setCatForm(s => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="名字" />
                <input value={catForm.breed || ''} onChange={(e) => setCatForm(s => ({ ...s, breed: e.target.value }))} style={inputStyle} placeholder="品種" />
                <input type="date" value={catForm.birthdate || ''} onChange={(e) => setCatForm(s => ({ ...s, birthdate: e.target.value }))} style={inputStyle} />
                <textarea value={catForm.notes || ''} onChange={(e) => setCatForm(s => ({ ...s, notes: e.target.value }))} rows={3} style={inputStyle} placeholder="備註" />
                <button onClick={saveCatProfile} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff', width: 'fit-content' }}>💾 儲存貓咪資料</button>
              </div>
            </div>

            {/* Weight entry */}
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '10px' }}>⚖️ 新增體重紀錄</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>人重 (kg)</label>
                    <input type="number" step="0.1" value={weightForm.personWeight} onChange={(e) => setWeightForm(s => ({ ...s, personWeight: e.target.value }))} style={inputStyle} placeholder={String(settings?.lastPersonWeight ?? 66.5)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>抱貓重 (kg)</label>
                    <input type="number" step="0.1" value={weightForm.carryWeight} onChange={(e) => setWeightForm(s => ({ ...s, carryWeight: e.target.value }))} style={inputStyle} placeholder="例：70.3" />
                  </div>
                </div>
                {weightForm.personWeight && weightForm.carryWeight && !isNaN(parseFloat(weightForm.carryWeight) - parseFloat(weightForm.personWeight)) && (
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)' }}>貓重：{(parseFloat(weightForm.carryWeight) - parseFloat(weightForm.personWeight)).toFixed(2)} kg</div>
                )}
                <input value={weightForm.note} onChange={(e) => setWeightForm(s => ({ ...s, note: e.target.value }))} style={inputStyle} placeholder="備註（選填）" />
                <button onClick={addWeight} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff', width: 'fit-content' }}>💾 新增</button>
              </div>
              {/* Weight history */}
              <div style={{ marginTop: '14px', display: 'grid', gap: '6px' }}>
                {(latestWeight || previousWeight) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '8px' }}>
                    {[
                      { label: '最新', value: latestWeight ? `${latestWeight.catWeight}kg` : '—', sub: latestWeight ? toDateTime(latestWeight.measuredAt) : '' },
                      { label: '差異', value: weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta}kg` : '—', sub: '' },
                      { label: '近5平均', value: recentWeightAverage != null ? `${recentWeightAverage}kg` : '—', sub: '' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'rgba(61,44,53,0.03)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{s.label}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '3px' }}>{s.value}</div>
                        {s.sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{s.sub}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {weights.length ? (
                  <details>
                    <summary style={{ fontSize: '0.8rem', color: '#64748b', cursor: 'pointer', padding: '4px' }}>歷史紀錄 ({weights.length} 筆)</summary>
                    <div style={{ marginTop: '8px', display: 'grid', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                      {[...weights].reverse().map((row) => (
                        <RecordCard
                          key={row.id || row.measuredAt}
                          title={<>{catName} {row.catWeight} kg</>}
                          meta={<>{toDateTime(row.measuredAt)}</>}
                          chips={<><span style={badgeStyle('purple')}>人重 {row.personWeight}kg</span><span style={badgeStyle('neutral')}>抱貓 {row.carryWeight}kg</span></>}
                          actions={<ActionButton tone="danger" onClick={() => deleteWeight(row.id || row.measuredAt)}>🗑</ActionButton>}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>

            {/* Resolution templates */}
            <div style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>🧩 處理範本</div>
                <span style={badgeStyle('purple')}>{resolutionTemplates.length} 個</span>
              </div>
              <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input value={templateDraft.label} onChange={(e) => setTemplateDraft(s => ({ ...s, label: e.target.value, id: s.id || e.target.value }))} style={inputStyle} placeholder="範本名稱" />
                  <input value={templateDraft.id} onChange={(e) => setTemplateDraft(s => ({ ...s, id: e.target.value }))} style={inputStyle} placeholder="代號（英文）" />
                </div>
                <textarea value={templateDraft.note} onChange={(e) => setTemplateDraft(s => ({ ...s, note: e.target.value }))} rows={2} style={inputStyle} placeholder="預設處理內容" />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={addResolutionTemplate} style={{ ...buttonBase, background: 'linear-gradient(135deg, var(--primary), #c084fc)', color: '#fff' }}>➕ 新增</button>
                  <button onClick={resetTemplateDraft} style={subtleButton}>↺</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {resolutionTemplates.map((tpl) => (
                  <RecordCard
                    key={tpl.id}
                    title={<>{tpl.label}</>}
                    meta={<>{tpl.note}</>}
                    chips={<span style={badgeStyle('neutral')}>{tpl.id}</span>}
                    actions={<ActionButton tone="danger" onClick={() => removeResolutionTemplate(tpl.id)}>✕</ActionButton>}
                  />
                ))}
              </div>
            </div>

            {/* PIN change */}
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '10px' }}>🔐 變更管理員 PIN</div>
              <div style={{ display: 'grid', gap: '8px', maxWidth: '320px' }}>
                <input type="password" value={pinForm.oldPin} onChange={(e) => setPinForm(s => ({ ...s, oldPin: e.target.value }))} style={inputStyle} placeholder="舊 PIN" />
                <input type="password" value={pinForm.newPin} onChange={(e) => setPinForm(s => ({ ...s, newPin: e.target.value }))} style={inputStyle} placeholder="新 PIN（至少 4 位）" />
                <button onClick={changePin} style={{ ...subtleButton, width: 'fit-content' }}>🔄 更新 PIN</button>
              </div>
            </div>

            {/* System info */}
            <div style={sectionCard}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '8px' }}>ℹ️ 系統資訊</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div>版本：v{settings?.appVersion || '5.7'}</div>
                <div>貓名：{settings?.catName || catName}</div>
                <div>上次人重：{settings?.lastPersonWeight ?? '—'} kg</div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ── DETAIL MODAL ──────────────────────────────────── */}
      {detailModal && (
        <div onClick={() => setDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(29, 19, 28, 0.48)', backdropFilter: 'blur(10px)', display: 'grid', alignItems: 'end', zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '18px 16px 28px', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gap: '12px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'rgba(61,44,53,0.14)', margin: '0 auto' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.4 }}>{detailModal.title}</div>
                {detailModal.meta && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{detailModal.meta}</div>}
              </div>
              <button onClick={() => setDetailModal(null)} style={{ ...subtleButton, padding: '6px 10px', flexShrink: 0 }}>關閉</button>
            </div>
            {detailModal.chips && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{detailModal.chips}</div>}
            {detailModal.body && <div style={{ borderRadius: '14px', padding: '12px', background: 'rgba(61,44,53,0.03)', color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.7 }}>{detailModal.body}</div>}
            {detailModal.actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{detailModal.actions}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
