import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { get, post } from '../api/client';
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
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    type: '',
    severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    note: '',
  });

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

  const submitIncident = async () => {
    if (!incidentForm.type.trim()) {
      alert('請輸入異常類型（例如：嘔吐、食慾不振）');
      return;
    }
    try {
      await post('/api/incidents', {
        type: incidentForm.type.trim(),
        severity: incidentForm.severity,
        note: incidentForm.note.trim(),
        reportedAt: new Date().toISOString(),
      });
      setShowIncidentModal(false);
      setIncidentForm({ type: '', severity: 'medium', note: '' });
      alert('異常回報已提交，管理員會儘快處理');
    } catch (error) {
      alert('提交失敗，請稍後再試');
    }
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
            v5.3.0
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
          <button
            onClick={() => setShowIncidentModal(true)}
            style={{
              padding: '12px 10px', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--glass)', color: 'var(--text-secondary)', fontFamily: 'var(--font)',
              fontSize: '0.9rem', cursor: 'pointer',
            }}
          >
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

      {/* Incident Report Modal */}
      {showIncidentModal && (
        <div
          onClick={() => setShowIncidentModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(29, 19, 28, 0.48)',
            backdropFilter: 'blur(10px)',
            display: 'grid',
            alignItems: 'end',
            zIndex: 999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              padding: '18px 16px 28px',
              boxShadow: '0 -18px 40px rgba(15,23,42,0.18)',
              display: 'grid',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '4px',
                borderRadius: '999px',
                background: 'rgba(61,44,53,0.14)',
                margin: '0 auto',
              }}
            />
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              🆘 異常狀況回報
            </div>
            
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  異常類型 *
                </label>
                <input
                  type="text"
                  value={incidentForm.type}
                  onChange={(e) => setIncidentForm((s) => ({ ...s, type: e.target.value }))}
                  placeholder="例如：嘔吐、食慾不振、精神不佳"
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    background: 'var(--bg-card2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    fontFamily: 'var(--font)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  嚴重程度 *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { value: 'low', label: '低', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
                    { value: 'medium', label: '中', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    { value: 'high', label: '高', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                    { value: 'critical', label: '緊急', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
                  ].map((sev) => (
                    <button
                      key={sev.value}
                      type="button"
                      onClick={() => setIncidentForm((s) => ({ ...s, severity: sev.value as typeof incidentForm.severity }))}
                      style={{
                        padding: '10px',
                        border: incidentForm.severity === sev.value ? `2px solid ${sev.color}` : '1px solid var(--glass-border)',
                        borderRadius: '12px',
                        background: incidentForm.severity === sev.value ? sev.bg : 'var(--glass)',
                        color: incidentForm.severity === sev.value ? sev.color : 'var(--text-secondary)',
                        fontFamily: 'var(--font)',
                        fontSize: '0.88rem',
                        fontWeight: incidentForm.severity === sev.value ? 700 : 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      🚨 {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  詳細說明（選填）
                </label>
                <textarea
                  value={incidentForm.note}
                  onChange={(e) => setIncidentForm((s) => ({ ...s, note: e.target.value }))}
                  rows={3}
                  placeholder="例如：吐了兩次、有未消化的食物、精神還可以"
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    background: 'var(--bg-card2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    fontFamily: 'var(--font)',
                    fontSize: '0.9rem',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={submitIncident}
                style={{
                  flex: 1,
                  padding: '13px',
                  border: 'none',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                🆘 立即回報
              </button>
              <button
                onClick={() => setShowIncidentModal(false)}
                style={{
                  padding: '13px 18px',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '16px',
                  background: 'var(--glass)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
