import { useState } from 'react';
import { post } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { confetti } from '../utils/confetti';

interface WeightPanelProps {
  taskId: string;
  caregiverDate: string;
  checkin?: {
    isDone: boolean;
    result: string | null;
    note: string;
    time: string;
  };
  onUpdate: () => void;
  onClose: () => void;
}

function utcToLocalTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function WeightPanel({ taskId, caregiverDate, checkin, onUpdate, onClose }: WeightPanelProps) {
  const { settings, cat } = useAppStore();
  const catName = cat?.name || '貓咪';
  const lastPersonW = settings?.lastPersonWeight || 66.5;

  // Pre-fill person weight with last known value
  const [personW, setPersonW] = useState(String(lastPersonW));
  const [carryW, setCarryW] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reRecording, setReRecording] = useState(false);

  const personNum = parseFloat(personW.replace(',', '.'));
  const carryNum = parseFloat(carryW.replace(',', '.'));

  const catW = (() => {
    if (isNaN(personNum) || isNaN(carryNum)) return null;
    if (carryNum <= personNum) return null;
    return (carryNum - personNum).toFixed(2);
  })();

  const carryErr = carryW !== '' && !isNaN(carryNum) && carryNum <= personNum
    ? '⚠️ 應大於人重'
    : null;

  const handleSubmit = async () => {
    setError('');
    const p = isNaN(personNum) ? lastPersonW : personNum;
    const c = carryNum;

    if (isNaN(c) || c <= 0) {
      setError('⚠️ 請輸入抱貓重量');
      return;
    }
    if (c <= p) {
      setError('⚠️ 抱貓重應大於人重');
      return;
    }

    setSubmitting(true);
    try {
      await post('/api/weights', {
        personWeight: p,
        carryWeight: c,
        note,
      });
      await post('/api/checkins', {
        taskId,
        isDone: true,
        result: `${(c - p).toFixed(2)}kg`,
        note,
        date: caregiverDate,
        time: new Date().toISOString(),
      });
      confetti();
      onUpdate();
      onClose();
    } catch (e) {
      setError('❌ 記錄失敗，請重試（' + (e instanceof Error ? e.message : String(e)) + '）');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setError('');
    setSubmitting(true);
    try {
      await post('/api/checkins', {
        taskId,
        isDone: false,
        result: null,
        note: note || '略過',
        date: caregiverDate,
        time: new Date().toISOString(),
      });
      onUpdate();
      onClose();
    } catch (e) {
      setError('❌ 略過失敗，請重試（' + (e instanceof Error ? e.message : String(e)) + '）');
    } finally {
      setSubmitting(false);
    }
  };

  const startReRecord = () => {
    setPersonW(String(lastPersonW));
    setCarryW('');
    setNote('');
    setError('');
    setReRecording(true);
  };

  // ── Already recorded (read-only view) ────────────────────────
  if (checkin && !reRecording) {
    const doneTime = utcToLocalTime(checkin.time);
    const isSkipped = !checkin.isDone;
    const catKg = parseFloat(checkin.result || '0') || 0;

    if (isSkipped) {
      return (
        <div
          style={panelStyle()}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={recordedBoxStyle('#f59e0b', 'rgba(245,158,11,0.06)')}>
            <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '4px' }}>
              ⏭️ 已略過 {doneTime && `(${doneTime})`}
            </div>
            {checkin.note && checkin.note !== '略過' && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                備註: {checkin.note}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={startReRecord} style={btnStyle('secondary')}>🔄 改為記錄體重</button>
            <button onClick={onClose} style={btnStyle('ghost')}>關閉</button>
          </div>
        </div>
      );
    }

    return (
      <div
        style={panelStyle()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={recordedBoxStyle('#4ade80', 'rgba(74,222,128,0.08)')}>
          <div style={{ fontWeight: 600, marginBottom: '10px', fontSize: '0.85rem' }}>
            📊 今日記錄
            {doneTime && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
                ({doneTime})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={recItemStyle()}>
              <div style={recLabelStyle()}>人重</div>
              <div style={recValStyle()}>— kg</div>
            </div>
            <div style={recItemStyle()}>
              <div style={recLabelStyle()}>抱貓重</div>
              <div style={recValStyle()}>— kg</div>
            </div>
            <div style={{ ...recItemStyle(), background: 'rgba(255,133,161,0.12)', border: '1px solid rgba(255,133,161,0.25)' }}>
              <div style={recLabelStyle()}>🐱 {catName}</div>
              <div style={{ ...recValStyle(), color: 'var(--primary)' }}>
                {catKg > 0 ? catKg.toFixed(2) : '—'} kg
              </div>
            </div>
          </div>
          {checkin.note && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              備註: {checkin.note}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button onClick={startReRecord} style={btnStyle('secondary')}>🔄 重新記錄</button>
          <button onClick={onClose} style={btnStyle('ghost')}>關閉</button>
        </div>
      </div>
    );
  }

  // ── Input form ────────────────────────────────────────────────
  return (
    <div
      style={panelStyle()}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>

        {/* Person weight */}
        <div>
          <label style={labelStyle()}>人重（今次）kg</label>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={personW}
            onChange={(e) => setPersonW(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder={`例: ${lastPersonW}`}
            style={inputStyle()}
          />
        </div>

        {/* Carry weight */}
        <div>
          <label style={labelStyle()}>抱著{catName}量 kg</label>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={carryW}
            onChange={(e) => setCarryW(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="輸入抱貓後的重量"
            style={{ ...inputStyle(), borderColor: carryErr ? '#f87171' : undefined }}
          />
          {carryErr && (
            <div style={{ fontSize: '0.78rem', color: '#f87171', marginTop: '4px' }}>{carryErr}</div>
          )}
        </div>

        {/* Cat weight result */}
        <div style={{
          background: 'rgba(255,133,161,0.08)',
          border: `1px solid ${catW ? 'rgba(255,133,161,0.4)' : 'rgba(255,133,161,0.2)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transition: 'border-color 0.2s',
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🐱 {catName}體重</span>
          <span style={{
            fontSize: '1.3rem', fontWeight: 700,
            color: catW ? 'var(--primary)' : 'var(--text-muted)',
            fontFamily: 'var(--mono)',
            transition: 'color 0.2s',
          }}>
            {catW ? `${catW} kg` : '-- kg'}
          </span>
        </div>

        {/* Note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備註（選填）"
          rows={2}
          style={{
            width: '100%', padding: '10px 14px',
            background: 'var(--bg-card2)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font)', fontSize: '0.9rem',
            resize: 'none', boxSizing: 'border-box',
          }}
        />

        {/* Error message (replaces alert) */}
        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '0.85rem',
            color: '#f87171',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !catW}
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: catW
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'rgba(200,200,200,0.3)',
            color: catW ? 'white' : 'var(--text-muted)',
            fontFamily: 'var(--font)', fontSize: '0.9rem',
            fontWeight: 700, cursor: catW ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {submitting ? '⏳ 儲存中...' : '✅ 確認記錄'}
        </button>
        <button
          onClick={handleSkip}
          disabled={submitting}
          style={{
            ...btnStyle('ghost'),
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ⏭️ 略過
        </button>
        <button
          onClick={onClose}
          style={{
            ...btnStyle('ghost'),
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ── Style helpers ────────────────────────────────────────────────

function panelStyle(): React.CSSProperties {
  return {
    padding: '14px 16px 16px',
    borderTop: '1px solid rgba(255,133,161,0.15)',
    background: '#fff9fb',
  };
}

function recordedBoxStyle(borderColor: string, bg: string): React.CSSProperties {
  return {
    marginBottom: '12px',
    background: bg,
    border: `1px solid ${borderColor}40`,
    borderRadius: '12px',
    padding: '14px',
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--bg-card2)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--mono)',
    fontSize: '1.1rem',
    boxSizing: 'border-box',
    WebkitAppearance: 'none',
  };
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    display: 'block',
    marginBottom: '6px',
  };
}

function btnStyle(variant: 'success' | 'secondary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  };
  if (variant === 'success') return { ...base, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' };
  return { ...base, background: 'var(--glass)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' };
}

function recItemStyle(): React.CSSProperties {
  return { flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '8px 6px', textAlign: 'center' };
}

function recLabelStyle(): React.CSSProperties {
  return { fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' };
}

function recValStyle(): React.CSSProperties {
  return { fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' };
}
