import { useState } from 'react';
import type { Task, Checkin } from '../store/useAppStore';
import { post } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';
import { confetti } from '../utils/confetti';
import { WeightPanel } from './WeightPanel';
import {
  getTaskStatus,
  getStatusLabel,
  STATUS_COLOR,
  STATUS_BG,
  STATUS_BADGE_BG,
  STATUS_BADGE_COLOR,
} from '../utils/taskStatus';

interface TaskCardProps {
  task: Task;
  checkin?: Checkin;
  caregiverDate: string;
  onCheckinUpdate: () => void;
}

function Counter({
  label,
  emoji,
  value,
  onChange,
}: {
  label: string;
  emoji: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1 }}>
      <div style={{ fontSize: '1.5rem' }}>{emoji}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{
            width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--glass-border)',
            background: 'var(--glass)', color: 'var(--text-secondary)', fontSize: '1.1rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)',
          }}
        >−</button>
        <span style={{ fontSize: '1.2rem', fontWeight: 700, minWidth: '24px', textAlign: 'center', color: value > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          style={{
            width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--glass-border)',
            background: 'var(--glass)', color: 'var(--text-secondary)', fontSize: '1.1rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)',
          }}
        >+</button>
      </div>
    </div>
  );
}

function buildLitterResult(poop: number, pee: number): string {
  const parts: string[] = [];
  if (poop > 0) parts.push(`poop:${poop}`);
  if (pee > 0) parts.push(`pee:${pee}`);
  if (parts.length === 0) return 'clean';
  return parts.join(',');
}

function parseLitterResult(result: string | null): { poop: number; pee: number } {
  if (!result || result === 'clean') return { poop: 0, pee: 0 };
  // legacy values
  if (result === 'both') return { poop: 1, pee: 1 };
  if (result === 'poop') return { poop: 1, pee: 0 };
  if (result === 'urine') return { poop: 0, pee: 1 };
  if (result === 'none') return { poop: 0, pee: 0 };
  const obj: { poop: number; pee: number } = { poop: 0, pee: 0 };
  result.split(',').forEach((part) => {
    const [k, v] = part.split(':');
    if (k === 'poop') obj.poop = parseInt(v, 10) || 0;
    if (k === 'pee') obj.pee = parseInt(v, 10) || 0;
  });
  return obj;
}

function formatLitterResult(result: string | null, t: (key: string, ...args: unknown[]) => string): string {
  const { poop, pee } = parseLitterResult(result);
  const parts: string[] = [];
  if (poop > 0) parts.push(`💩×${poop}`);
  if (pee > 0) parts.push(`💦×${pee}`);
  return parts.length > 0 ? parts.join(' ') : t('litterClean');
}

export function TaskCard({ task, checkin, caregiverDate, onCheckinUpdate }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const [isDone, setIsDone] = useState<boolean | null>(null);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [litterPoop, setLitterPoop] = useState(0);
  const [litterPee, setLitterPee] = useState(0);
  const lang = useAppStore((s) => s.lang);
  const t = useT(lang);

  const isWeight = task.type === 'weight';
  const isLitter = task.type === 'litter';
  const status = getTaskStatus(checkin, task.scheduledTimes);
  const statusLabel = getStatusLabel(status, t);

  const handleOpen = () => {
    if (!open && isLitter) {
      // reset counters on open
      setLitterPoop(0);
      setLitterPee(0);
    }
    setOpen((o) => !o);
  };

  const handleSubmit = async () => {
    if (isDone === null) return;
    setSubmitting(true);
    const finalResult = isLitter && isDone ? buildLitterResult(litterPoop, litterPee) : (result || null);
    try {
      await post('/api/checkins', {
        taskId: task.id,
        isDone,
        result: finalResult,
        note,
        date: caregiverDate,
        time: new Date().toISOString(),
      });
      setOpen(false);
      if (isDone) confetti();
      onCheckinUpdate();
    } catch {
      alert(t('incidentSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      background: STATUS_BG[status],
      border: `1px solid ${STATUS_COLOR[status]}`,
      borderRadius: 'var(--radius)',
      marginBottom: '10px',
      overflow: 'hidden',
      boxShadow: status === 'overdue'
        ? '0 2px 12px rgba(245,158,11,0.2)'
        : '0 2px 12px rgba(255,133,161,0.1)',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', cursor: 'pointer' }}
        onClick={handleOpen}
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
                {checkin.isDone ? '✔' : '⏭'} {new Date(checkin.time).toLocaleTimeString(lang === 'en' ? 'en-CA' : 'zh-HK', { hour: '2-digit', minute: '2-digit' })}
                {isLitter && checkin.isDone && checkin.result && (
                  <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>
                    {formatLitterResult(checkin.result, t)}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
          background: STATUS_BADGE_BG[status], color: STATUS_BADGE_COLOR[status],
        }}>
          {statusLabel}
        </div>
      </div>

      {open && isWeight && (
        <WeightPanel
          taskId={task.id}
          caregiverDate={caregiverDate}
          checkin={checkin}
          onUpdate={onCheckinUpdate}
          onClose={() => setOpen(false)}
        />
      )}

      {open && !isWeight && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,133,161,0.15)', background: '#fff9fb' }}>
          {checkin ? (
            <div style={{
              margin: '14px 0',
              background: checkin.isDone ? 'rgba(74,222,128,0.08)' : 'rgba(245,158,11,0.06)',
              border: `1px solid ${checkin.isDone ? 'rgba(74,222,128,0.25)' : 'rgba(245,158,11,0.25)'}`,
              borderRadius: '12px', padding: '12px 14px',
            }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {checkin.isDone ? t('statusDone') : t('statusSkip')}
                {checkin.result && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.85rem' }}>
                    {isLitter ? formatLitterResult(checkin.result, t) : checkin.result}
                  </span>
                )}
              </div>
              {checkin.note && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>📝 {checkin.note}</div>}
            </div>
          ) : (
            <>
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
                >{t('doneBtn')}</button>
                <button
                  onClick={() => setIsDone(false)}
                  style={{
                    padding: '12px', borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${isDone === false ? '#f87171' : 'var(--glass-border)'}`,
                    background: isDone === false ? 'rgba(248,113,113,0.15)' : 'transparent',
                    color: isDone === false ? '#e05555' : 'var(--text-secondary)',
                    fontFamily: 'var(--font)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >{t('skipBtn')}</button>
              </div>

              {/* Litter poo/pee counters */}
              {isLitter && isDone === true && (
                <div style={{
                  background: 'rgba(255,133,161,0.06)', border: '1px solid rgba(255,133,161,0.18)',
                  borderRadius: '14px', padding: '14px 12px', marginBottom: '14px',
                }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('litterCountLabel')}
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Counter
                      emoji="💩"
                      label={t('litterPoopLabel')}
                      value={litterPoop}
                      onChange={setLitterPoop}
                    />
                    <Counter
                      emoji="💦"
                      label={t('litterPeeLabel')}
                      value={litterPee}
                      onChange={setLitterPee}
                    />
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {litterPoop === 0 && litterPee === 0
                      ? `🧹 ${t('litterClean')}`
                      : [litterPoop > 0 ? `💩×${litterPoop}` : '', litterPee > 0 ? `💦×${litterPee}` : ''].filter(Boolean).join('  ')}
                  </div>
                </div>
              )}

              {/* Standard result options (non-litter) */}
              {!isLitter && task.resultOptions && task.resultOptions.length > 0 && (
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
                      {lang === 'en' && 'labelEn' in opt && typeof opt.labelEn === 'string' && opt.labelEn ? opt.labelEn : opt.label}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('noteOptional')}
                rows={2}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg-card2)', border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font)', fontSize: '0.9rem', resize: 'none', marginBottom: '14px',
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || isDone === null}
                  style={{
                    padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: 'white', fontFamily: 'var(--font)', fontSize: '0.9rem',
                    fontWeight: 600, cursor: 'pointer', opacity: isDone === null ? 0.5 : 1,
                  }}
                >
                  {submitting ? t('submitting') : t('submitBtn')}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    padding: '12px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--glass-border)', background: 'var(--glass)',
                    color: 'var(--text-secondary)', fontFamily: 'var(--font)', fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  {t('cancelBtn')}
                </button>
              </div>
            </>
          )}

          {checkin && (
            <button
              onClick={() => setOpen(false)}
              style={{
                width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)', background: 'var(--glass)',
                color: 'var(--text-secondary)', fontFamily: 'var(--font)', fontSize: '0.9rem',
                cursor: 'pointer', marginTop: '8px',
              }}
            >
              {t('closeBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
