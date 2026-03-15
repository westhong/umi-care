// Task status helpers — overdue detection

export type TaskStatus = 'done' | 'skip' | 'overdue' | 'pending';

const CALGARY_OFFSET_MS = -7 * 3600 * 1000; // MST (close enough; ±1h DST fine for "overdue")

function nowCalgaryMinutes(): number {
  const now = new Date();
  const calgary = new Date(now.getTime() + CALGARY_OFFSET_MS);
  return calgary.getUTCHours() * 60 + calgary.getUTCMinutes();
}

export function getTaskStatus(
  checkin: { isDone: boolean } | undefined,
  scheduledTimes?: string[],
  overdueGraceMinutes = 30,
): TaskStatus {
  if (checkin) return checkin.isDone ? 'done' : 'skip';
  if (!scheduledTimes?.length) return 'pending';

  const nowMin = nowCalgaryMinutes();
  const lastSchedule = scheduledTimes[scheduledTimes.length - 1];
  const [h, m] = lastSchedule.split(':').map(Number);
  const scheduleMin = h * 60 + m;

  if (nowMin > scheduleMin + overdueGraceMinutes) return 'overdue';
  return 'pending';
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  done: '✅ 完成',
  skip: '⏭️ 略過',
  overdue: '⚠️ 已過時',
  pending: '待完成',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  done: 'rgba(82,199,126,0.4)',
  skip: 'rgba(255,133,161,0.35)',
  overdue: 'rgba(245,158,11,0.5)',
  pending: 'var(--glass-border)',
};

export const STATUS_BG: Record<TaskStatus, string> = {
  done: 'rgba(82,199,126,0.06)',
  skip: 'rgba(255,218,230,0.08)',
  overdue: 'rgba(245,158,11,0.06)',
  pending: 'var(--bg-card)',
};

export const STATUS_BADGE_BG: Record<TaskStatus, string> = {
  done: 'rgba(74,222,128,0.2)',
  skip: 'rgba(255,182,210,0.3)',
  overdue: 'rgba(245,158,11,0.2)',
  pending: 'rgba(255,255,255,0.08)',
};

export const STATUS_BADGE_COLOR: Record<TaskStatus, string> = {
  done: '#4ade80',
  skip: '#e8679a',
  overdue: '#f59e0b',
  pending: 'var(--text-muted)',
};
