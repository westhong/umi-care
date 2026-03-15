import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { get } from '../api/client';
import { ProgressRing } from '../components/ProgressRing';
import { TaskCard } from '../components/TaskCard';
import type { Task, Checkin } from '../store/useAppStore';

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

  useEffect(() => {
    const now = new Date();
    const days = ['日','一','二','三','四','五','六'];
    setTodayDate(`${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} 星期${days[now.getDay()]}`);
  }, []);

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

  const pendingTasks = visibleTasks.filter((t) => !checkins.find((c) => c.taskId === t.id));
  const doneTasks = visibleTasks.filter((t) => checkins.find((c) => c.taskId === t.id));

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
            v5.0.1
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
        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary)', fontWeight: 700, marginBottom: '12px' }}>
          📋 今日任務
        </div>

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
            {pendingTasks.length === 0 && doneTasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>目前沒有任務</div>
            )}

            {pendingTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                caregiverDate={currentDate}
                onCheckinUpdate={loadData}
              />
            ))}

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
                    checkin={checkins.find((c) => c.taskId === task.id)}
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
