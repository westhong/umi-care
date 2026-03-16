import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { get } from '../api/client';
import { ProgressRing } from '../components/ProgressRing';
import { TaskCard } from '../components/TaskCard';
import type { Task, Checkin } from '../store/useAppStore';
import { getTaskStatus } from '../utils/taskStatus';
import { requestPushPermission, isSubscribed, listenPushSound } from '../utils/pushNotify';

interface TasksPageProps {
  onAdminOpen: () => void;
}

export function TasksPage({ onAdminOpen }: TasksPageProps) {
  const {
    tasks, checkins, cat, catName, currentDate,
    setTasks, setCheckins,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [todayDate, setTodayDate] = useState('');
  const [pushStatus, setPushStatus] = useState<'unknown' | 'subscribed' | 'denied' | 'unsupported'>('unknown');

  useEffect(() => {
    const now = new Date();
    const days = ['日','一','二','三','四','五','六'];
    setTodayDate(`${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} 星期${days[now.getDay()]}`);

    // Register SW + check push status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      isSubscribed().then((ok) => setPushStatus(ok ? 'subscribed' : 'unknown'));
    } else {
      setPushStatus('unsupported');
    }

    // Listen for push sound
    listenPushSound();
  }, []);

  const handlePushEnable = async () => {
    if (!('Notification' in window)) { setPushStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setPushStatus('denied'); return; }
    const ok = await requestPushPermission();
    setPushStatus(ok ? 'subscribed' : 'denied');
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksData, checkinsData] = await Promise.all([
        get<Task[]>('/api/tasks'),
        get<Checkin[]>(`/api/checkins?date=${currentDate}`),
      ]);
      setTasks(tasksData);
      setCheckins(checkinsData);
    } catch {
      // keep current state
    } finally {
      setLoading(false);
    }
  }, [currentDate, setTasks, setCheckins]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 5 min to update overdue status
  useEffect(() => {
    const t = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(t);
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

  const visibleIds = new Set(visibleTasks.map((t) => t.id));
  const total = visibleTasks.length;
  const done = checkins.filter((c) => c.isDone && visibleIds.has(c.taskId)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const msgs = ['今日任務', '加油！繼續努力 💪', '快到了！', '差不多啦 🎉', '全部完成！🎊'];
  const idx = pct === 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct > 0 ? 1 : 0;

  // Group tasks by status
  const getCheckin = (t: Task) => checkins.find((c) => c.taskId === t.id);
  const pendingTasks  = visibleTasks.filter((t) => { const s = getTaskStatus(getCheckin(t), t.scheduledTimes); return s === 'pending'; });
  const overdueTasks  = visibleTasks.filter((t) => { const s = getTaskStatus(getCheckin(t), t.scheduledTimes); return s === 'overdue'; });
  const doneTasks     = visibleTasks.filter((t) => { const s = getTaskStatus(getCheckin(t), t.scheduledTimes); return s === 'done' || s === 'skip'; });

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{
        padding: '20px 20px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative',
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 700,
            background: 'linear-gradient(135deg, #ff85a1 0%, #c8a8e9 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            UmiCare 🐾
          </h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {todayDate}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.6rem', fontFamily: 'var(--mono)',
            background: 'rgba(255,133,161,0.15)', color: 'var(--text-muted)',
            border: '1px solid rgba(255,133,161,0.25)', borderRadius: '10px',
            padding: '2px 7px',
          }}>
            v5.0.9
          </span>
          <div
            onClick={onAdminOpen}
            style={{
              width: '40px', height: '40px',
              background: 'rgba(255,133,161,0.12)',
              border: '1px solid rgba(255,133,161,0.3)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '1.1rem',
            }}
            title="管理員"
          >
            🔐
          </div>
        </div>
      </div>

      {/* Push Notification Banner */}
      {pushStatus === 'unknown' && (
        <div style={{
          margin: '14px 16px 0',
          background: 'rgba(102,126,234,0.1)',
          border: '1px solid rgba(102,126,234,0.3)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            🔔 開啟通知，任務到時即提醒
          </span>
          <button
            onClick={handlePushEnable}
            style={{
              padding: '7px 14px', borderRadius: '20px', border: 'none',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white', fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'var(--font)',
            }}
          >
            開啟
          </button>
        </div>
      )}
      {pushStatus === 'subscribed' && (
        <div style={{
          margin: '14px 16px 0',
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: '0.78rem', color: '#4ade80',
        }}>
          🔔 通知已開啟 — 任務到時會推送提醒
        </div>
      )}
      {pushStatus === 'denied' && (
        <div style={{
          margin: '14px 16px 0',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: '0.78rem', color: '#f87171',
        }}>
          🔕 通知已被拒絕，請在瀏覽器設定中手動開啟
        </div>
      )}

      {/* Progress Ring */}
      <ProgressRing pct={pct} done={done} total={total} catName={cat?.name || catName} sub={msgs[idx]} />

      {/* Quick Report */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary)', fontWeight: 700, marginBottom: '10px' }}>
          ⚡ 主動回報
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
          <button style={{
            padding: '12px 10px', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--glass)', color: 'var(--text-secondary)', fontFamily: 'var(--font)',
            fontSize: '0.9rem', cursor: 'pointer',
          }}>
            🤢 嘔吐 / 異常狀況
          </button>
          <button style={{
            padding: '12px 10px', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--glass)', color: 'var(--text-secondary)', fontFamily: 'var(--font)',
            fontSize: '0.9rem', cursor: 'pointer',
          }}>
            🍽️ 餵食紀錄
          </button>
        </div>
      </div>

      {/* Task List */}
      <div style={{ padding: '0 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '20px', height: '20px',
              border: '2px solid var(--glass-border)',
              borderTopColor: 'var(--primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto',
            }} />
          </div>
        ) : (
          <>
            {/* Overdue tasks */}
            {overdueTasks.length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  margin: '0 0 10px',
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    ⚠️ 已過時 ({overdueTasks.length})
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(245,158,11,0.35)' }} />
                </div>
                {overdueTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    checkin={getCheckin(task)}
                    caregiverDate={currentDate}
                    onCheckinUpdate={loadData}
                  />
                ))}
              </>
            )}

            {/* Pending tasks */}
            {pendingTasks.length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  margin: `${overdueTasks.length > 0 ? '16px' : '0'} 0 10px`,
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--primary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    📋 待完成 ({pendingTasks.length})
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,133,161,0.25)' }} />
                </div>
                {pendingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    checkin={getCheckin(task)}
                    caregiverDate={currentDate}
                    onCheckinUpdate={loadData}
                  />
                ))}
              </>
            )}

            {pendingTasks.length === 0 && overdueTasks.length === 0 && doneTasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>目前沒有任務</div>
            )}

            {/* Done/skipped tasks */}
            {doneTasks.length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  margin: '16px 0 10px',
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#4ade80', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    ✅ 已完成 ({doneTasks.length})
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(74,222,128,0.25)' }} />
                </div>
                {doneTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    checkin={getCheckin(task)}
                    caregiverDate={currentDate}
                    onCheckinUpdate={loadData}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
