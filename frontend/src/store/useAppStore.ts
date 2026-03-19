import { create } from 'zustand';

export interface Task {
  id: string;
  name: string;
  nameEn?: string;
  icon: string;
  type: string;
  scheduleType: string;
  scheduledTimes: string[];
  weekDays?: number[];
  resultOptions?: { label: string; labelEn?: string; value: string }[];
  requireNote?: boolean;
}

export interface Checkin {
  taskId: string;
  isDone: boolean;
  result: string | null;
  note: string;
  time: string;
}

export interface CatProfile {
  name: string;
  breed?: string;
  birthdate?: string;
  notes?: string;
}

export interface Settings {
  lastPersonWeight: number;
  catName: string;
  appVersion?: string;
  adminGranularTimeGrouping?: boolean;
}

export interface AdhocRequest {
  id: string;
  name: string;
  icon: string;
  note: string;
  createdAt: string;
  done: boolean;
  doneAt?: string;
}

export interface SelfReport {
  id: string;
  type: string;
  title: string;
  icon: string;
  quantity: number;
  unit: string;
  note: string;
  reportedAt: string;
}

export interface AppState {
  tasks: Task[];
  checkins: Checkin[];
  settings: Settings;
  cat: CatProfile;
  catName: string;
  weightsList: unknown[];
  adhocRequests: AdhocRequest[];
  adhocDoneToday: AdhocRequest[];
  selfReports: SelfReport[];
  yesterdayCheckins: Checkin[];
  yesterdayBacklog: Task[];
  adminMode: boolean;
  currentDate: string;
  caregiverDate: string;
  caregiverMode: 'today' | 'backlog';
  expandedTask: string | null;
  lang: 'zh' | 'en';
  setTasks: (tasks: Task[]) => void;
  setCheckins: (checkins: Checkin[]) => void;
  setSettings: (settings: Settings) => void;
  setCat: (cat: CatProfile) => void;
  setAdminMode: (adminMode: boolean) => void;
  setExpandedTask: (taskId: string | null) => void;
  setLang: (lang: 'zh' | 'en') => void;
  setAdhocRequests: (requests: AdhocRequest[]) => void;
  setSelfReports: (reports: SelfReport[]) => void;
}

function todayStr(): string {
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

const today = todayStr();

function getInitialLang(): 'zh' | 'en' {
  // URL param always wins (allows ?lang=zh for admin)
  const urlLang = new URL(location.href).searchParams.get('lang');
  if (urlLang === 'zh' || urlLang === 'en') return urlLang;
  // Default: English for caregiver interface
  return 'en';
}

export const useAppStore = create<AppState>((set) => ({
  tasks: [],
  checkins: [],
  settings: { lastPersonWeight: 66.5, catName: '屋咪', appVersion: '5.5.0', adminGranularTimeGrouping: false },
  cat: { name: '屋咪' },
  catName: '屋咪',
  weightsList: [],
  adhocRequests: [],
  adhocDoneToday: [],
  selfReports: [],
  yesterdayCheckins: [],
  yesterdayBacklog: [],
  adminMode: false,
  currentDate: today,
  caregiverDate: today,
  caregiverMode: 'today',
  expandedTask: null,
  lang: getInitialLang(),
  setTasks: (tasks) => set({ tasks }),
  setCheckins: (checkins) => set({ checkins }),
  setSettings: (settings) => set({ settings }),
  setCat: (cat) => set({ cat, catName: cat.name }),
  setAdminMode: (adminMode) => set({ adminMode }),
  setExpandedTask: (expandedTask) => set({ expandedTask }),
  setLang: (lang) => {
    try {
      // Persist lang in URL only (not localStorage) so default stays EN on fresh load
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
    set({ lang });
  },
  setAdhocRequests: (adhocRequests) => set({ adhocRequests }),
  setSelfReports: (selfReports) => set({ selfReports }),
}));
