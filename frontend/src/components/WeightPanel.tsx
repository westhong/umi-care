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

  const [personW, setPersonW] = useState('');
  const [carryW, setCarryW] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reRecording, setReRecording] = useState(false);

  const catW = (() => {
    const p = parseFloat(personW) || lastPersonW;
    const c = parseFloat(carryW);
    if (!isNaN(c) && c > p) return (c - p).toFixed(2);
    return null;
  })();

  const carryErr = (() => {
    const p = parseFloat(personW) || lastPersonW;
    const c = parseFloat(carryW);
    if (carryW && !isNaN(c) && c <= p) return '⚠️ 應大於人重';
    return null;
  })();

  const handleSubmit = async () => {
    const p = parseFloat(personW) || lastPersonW;
    const c = parseFloat(carryW);
    if (isNaN(c) || c <= 0) { alert('⚠️ 請輸入抱貓重量'); return; }
    if (c <= p) { alert('⚠️ 抱貓重應大於人重'); return; }
    setSubmitting(true);
    try {
      await post('/api/weights', { personWeight: p, carryWeight: c, note });
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
    } catch {
      alert('❌ 記錄失敗，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      await post('/api/checkins', {
        taskId,
        isDone: false,
        result: null,
        note: '略過',
        date: caregiverDate,
        time: new Date().toISOString(),
      });
      onUpdate();
      onClose();
    } catch {
      alert('❌ 略過失敗，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Already recorded view ──────────────────────────────────────────
  if (checkin && !reRecording) {
    const doneTime = utcToLocalTime(checkin.time);
    const isSkipped = !checkin.isDone;

    if (isSkipped) {
      return (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,133,161,0.15)', background: '#fff9fb' }}>
          <div style={{
            margin: '14px 0',
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '12px',
            padding: '14px',
          }}>
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
            <button onClick={() => setReRecording(true)} style={btnStyle('secondary')}>
              🔄 改為記錄體重
            </button>
            <button onClick={onClose} style={btnStyle('ghost')}>關閉</button>
          </div>
        </div>
      );
    }

    // Done — show recorded values
    const catKg = parseFloat(checkin.result || '0') || 0;
    return (
      <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,133,161,0.15)', background: '#fff9fb' }}>
        <div style={{
          margin: '14px 0',
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.25)',
          borderRadius: '12px',
          padding: '14px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '10px', fontSize: '0.85rem' }}>
            📊 今日記錄
            {doneTime && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>({doneTime})</span>}
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
              <div style={{ ...recValStyle(), color: 'var(--primary)' }}>{catKg > 0 ? catKg.toFixed(2) : '—'} kg</div>
            </div>
          </div>
          {checkin.note && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              備註: {checkin.note}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button onClick={() => setReRecording(true)} style={btnStyle('secondary')}>🔄 重新記錄</button>
          <button onClick={onClose} style={btnStyle('ghost')}>關閉</button>
        </div>
      </div>
    );
  }

  // ── Input form ─────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,133,161,0.15)', background: '#fff9fb' }}>
      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>

        {/* Person weight */}
        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            人重（今次）kg
          </label>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={personW}
            onChange={(e) => setPersonW(e.target.value)}
            placeholder={`上次: ${lastPersonW} kg`}
            style={inputStyle()}
          />
        </div>

        {/* Carry weight */}
        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            抱著{catName}量 kg
          </label>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={carryW}
            onChange={(e) => setCarryW(e.target.value)}
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
          border: '1px solid rgba(255,133,161,0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🐱 {catName}體重</span>
          <span style={{
            fontSize: '1.3rem', fontWeight: 700,
            color: catW ? 'var(--primary)' : 'var(--text-muted)',
            fontFamily: 'var(--mono)',
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
            background: 'var(--bg-card2)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
            fontFamily: 'var(--font)', fontSize: '0.9rem', resize: 'none',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !catW}
          style={{
            ...btnStyle('success'),
            opacity: !catW ? 0.5 : 1,
          }}
        >
          {submitting ? '⏳...' : '✅ 確認記錄'}
        </button>
        <button onClick={handleSkip} disabled={submitting} style={btnStyle('ghost')}>
          ⏭️ 略過
        </button>
        <button onClick={onClose} style={btnStyle('ghost')}>取消</button>
      </div>
    </div>
  );
}

// ── Style helpers ────────────────────────────────────────────────────

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
  };
}

function btnStyle(variant: 'success' | 'secondary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font)',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  };
  if (variant === 'success') return { ...base, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' };
  if (variant === 'secondary') return { ...base, background: 'var(--glass)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' };
  return { ...base, background: 'var(--glass)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' };
}

function recItemStyle(): React.CSSProperties {
  return {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '10px',
    padding: '8px 6px',
    textAlign: 'center',
  };
}

function recLabelStyle(): React.CSSProperties {
  return { fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '3px' };
}

function recValStyle(): React.CSSProperties {
  return { fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' };
}
