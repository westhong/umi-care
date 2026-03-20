import { useState } from 'react';
import type { Task, Checkin } from '../store/useAppStore';
import { post } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';
import { confetti } from '../utils/confetti';
import { WeightPanel } from './WeightPanel';
import { LitterCounter, encodeLitterResult, formatLitterSummary } from './LitterCounter';
import type { LitterCounts } from './LitterCounter';
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

export function TaskCard({ task, checkin, caregiverDate, onCheckinUpdate }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const [isDone, setIsDone] = useState<boolean | null>(null);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [litterCounts, setLitterCounts] = useState<LitterCounts>({ poop: 0, pee: 0 });
  const lang = useAppStore((s) => s.lang);
  const t = useT(lang);

  const isWeight = task.type === 'weight';
  const isLitter = task.type === 'litter';
  const status = getTaskStatus(checkin, task.scheduledTimes);
  const statusLabel = getStatusLabel(status, t);

  const handleOpen = () => {
    if (!open && isLitter) setLitterCounts({ poop: 0, pee: 0 });
    setOpen((o) => !o);
  };

  const handleSubmit = async () => {
    if (isDone === null) return;
    // Validate requireNote: if task requires a note and user is marking as done, note must be filled
    if (isDone && task.requireNote && !note.trim()) {
      alert(t('noteRequired') || '請填寫備註（此任務為必填）');
      return;
    }
    setSubmitting(true);
    const finalResult = isLitter && isDone ? encodeLitterResult(litterCounts) : (result || null);
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
                  <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {formatLitterSummary(checkin.result, t('litterClean'))}
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
                    {isLitter ? formatLitterSummary(checkin.result, t('litterClean')) : (() => {
                      const opt = task.resultOptions?.find((o) => o.value === checkin.result);
                      if (opt) return lang === 'en' && 'labelEn' in opt && typeof opt.labelEn === 'string' && opt.labelEn ? opt.labelEn : opt.label;
                      return checkin.result;
                    })()}
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

              {/* Shared LitterCounter for litter tasks */}
              {isLitter && isDone === true && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('litterCountLabel')}
                  </div>
                  <LitterCounter
                    counts={litterCounts}
                    onChange={setLitterCounts}
                    poopLabel={t('litterPoopLabel')}
                    peeLabel={t('litterPeeLabel')}
                    cleanLabel={t('litterClean')}
                  />
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
                placeholder={isDone && task.requireNote ? (lang === 'en' ? 'Note required *' : '備註（必填）*') : t('noteOptional')}
                rows={2}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg-card2)',
                  border: `1px solid ${isDone && task.requireNote && !note.trim() ? '#f87171' : 'var(--glass-border)'}`,
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font)', fontSize: '0.9rem', resize: 'none', marginBottom: '14px',
                  boxSizing: 'border-box',
                }}
              />
              {isDone && task.requireNote && !note.trim() && (
                <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '-10px', marginBottom: '10px' }}>
                  {lang === 'en' ? '* Note is required for this task' : '* 此任務需要填寫備註'}
                </div>
              )}

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
