import { useState } from 'react';
import type { Task, Checkin } from '../store/useAppStore';
import { post } from '../api/client';
import { useAppStore } from '../store/useAppStore';

interface TaskCardProps {
  task: Task;
  checkin?: Checkin;
  caregiverDate: string;
  onCheckinUpdate: () => void;
}

export function TaskCard({ task, checkin, caregiverDate, onCheckinUpdate }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const [isDone, setIsDone] = useState<boolean | null>(null);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lang = useAppStore((s) => s.lang);

  const status = checkin
    ? (checkin.isDone ? 'done' : 'skip')
    : 'pending';

  const statusLabel = {
    done: '✅ 完成',
    skip: '⏭️ 略過',
    pending: '待完成',
  }[status];

  const handleSubmit = async () => {
    if (isDone === null) return;
    setSubmitting(true);
    try {
      await post('/api/checkins', {
        taskId: task.id,
        isDone,
        result: result || null,
        note,
        date: caregiverDate,
        time: new Date().toISOString(),
      });
      setOpen(false);
      onCheckinUpdate();
    } catch {
      alert('提交失敗，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${status === 'done' ? 'rgba(82,199,126,0.4)' : status === 'skip' ? 'rgba(255,133,161,0.35)' : 'var(--glass-border)'}`,
      borderRadius: 'var(--radius)',
      marginBottom: '10px',
      overflow: 'hidden',
      backgroundColor: status === 'done' ? 'rgba(82,199,126,0.06)' : status === 'skip' ? 'rgba(255,218,230,0.08)' : 'var(--bg-card)',
      boxShadow: '0 2px 12px rgba(255,133,161,0.1)',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '14px 16px', cursor: 'pointer',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{
          width: '44px', height: '44px',
          background: 'linear-gradient(135deg, #fff0f5, #fde8f0)',
          borderRadius: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', flexShrink: 0,
        }}>
          {task.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            {lang === 'en' ? (task.nameEn || task.name) : task.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {task.scheduledTimes?.[0] || ''}
            {checkin?.time && (
              <span style={{ color: checkin.isDone ? '#4ade80' : '#e8679a', marginLeft: '6px', fontWeight: 600 }}>
                {checkin.isDone ? '✔' : '⏭'} {new Date(checkin.time).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
          background: status === 'done' ? 'rgba(74,222,128,0.2)' : status === 'skip' ? 'rgba(255,182,210,0.3)' : 'rgba(255,255,255,0.08)',
          color: status === 'done' ? '#4ade80' : status === 'skip' ? '#e8679a' : 'var(--text-muted)',
        }}>
          {statusLabel}
        </div>
      </div>

      {/* Expanded Panel */}
      {open && !checkin && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,133,161,0.15)', background: '#fff9fb' }}>
          {/* Done / Skip toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
            <button
              onClick={() => setIsDone(true)}
              style={{
                padding: '12px', borderRadius: 'var(--radius-sm)',
                border: `2px solid ${isDone === true ? '#4ade80' : 'var(--glass-border)'}`,
                background: isDone === true ? 'rgba(74,222,128,0.15)' : 'transparent',
                color: isDone === true ? '#3aaa63' : 'var(--text-secondary)',
                fontFamily: 'var(--font)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
              }}
            >✅ 完成</button>
            <button
              onClick={() => setIsDone(false)}
              style={{
                padding: '12px', borderRadius: 'var(--radius-sm)',
                border: `2px solid ${isDone === false ? '#f87171' : 'var(--glass-border)'}`,
                background: isDone === false ? 'rgba(248,113,113,0.15)' : 'transparent',
                color: isDone === false ? '#e05555' : 'var(--text-secondary)',
                fontFamily: 'var(--font)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
              }}
            >⏭️ 略過</button>
          </div>

          {/* Result options */}
          {task.resultOptions && task.resultOptions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {task.resultOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setResult(opt.value)}
                  style={{
                    padding: '10px 8px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${result === opt.value ? 'var(--primary)' : 'var(--glass-border)'}`,
                    background: result === opt.value ? 'rgba(102,126,234,0.2)' : 'var(--glass)',
                    color: result === opt.value ? 'var(--primary)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Note */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（選填）"
            rows={2}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--bg-card2)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontFamily: 'var(--font)', fontSize: '0.9rem',
              resize: 'none', marginBottom: '14px',
            }}
          />

          {/* Submit / Cancel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || isDone === null}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: 'white', fontFamily: 'var(--font)', fontSize: '0.9rem',
                fontWeight: 600, cursor: 'pointer', opacity: isDone === null ? 0.5 : 1,
              }}
            >
              {submitting ? '⏳ 提交中...' : '✅ 確認提交'}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)',
                background: 'var(--glass)',
                color: 'var(--text-secondary)', fontFamily: 'var(--font)',
                fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
