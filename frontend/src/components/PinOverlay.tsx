import { useState } from 'react';
import { post } from '../api/client';

interface PinOverlayProps {
  mode: 'setup' | 'login';
  onSuccess: () => void;
  onCancel?: () => void;
}

export function PinOverlay({ mode, onSuccess, onCancel }: PinOverlayProps) {
  const [buffer, setBuffer] = useState<string[]>([]);
  const [firstPin, setFirstPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleKey = async (key: string) => {
    if (key === '⌫') {
      setBuffer((b) => b.slice(0, -1));
      return;
    }
    if (buffer.length >= 6) return;
    const newBuf = [...buffer, key];
    setBuffer(newBuf);

    if (newBuf.length >= 4) {
      const pin = newBuf.join('');
      setBuffer([]);

      if (mode === 'setup') {
        if (step === 'enter') {
          setFirstPin(pin);
          setStep('confirm');
          setError('');
          setInfo('✅ 請再次輸入確認 PIN');
        } else {
          setInfo('');
          if (pin !== firstPin) {
            setError('❌ PIN 不一致，請重新輸入');
            setStep('enter');
            setFirstPin('');
            return;
          }
          try {
            await post('/api/pin/setup', { pin });
            onSuccess();
          } catch {
            setError('❌ 設定失敗，請重試');
          }
        }
      } else {
        try {
          const r = await post<{ valid: boolean; locked?: boolean }>('/api/pin/verify', { pin });
          if (r.valid) {
            onSuccess();
          } else if (r.locked) {
            setError('🔒 錯誤次數過多，請稍後再試');
          } else {
            setError('❌ PIN 不正確，請重試');
          }
        } catch {
          setError('❌ 驗證失敗');
        }
      }
    }
  };

  const keys = [1,2,3,4,5,6,7,8,9,'',0,'⌫'];

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(255,240,245,0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius)',
        padding: '32px 24px',
        width: '100%', maxWidth: '380px',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(255,133,161,0.18)',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>
          {mode === 'setup' ? '🐾' : '🔐'}
        </div>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
          {mode === 'setup' ? '歡迎使用 UmiCare' : '管理員登入'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
          {mode === 'setup' ? '首次使用，請設定管理員 PIN 碼' : '請輸入 PIN 碼'}
        </p>

        {/* PIN dots */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '16px' }}>
          {[0,1,2,3].map((i) => (
            <div key={i} style={{
              width: '16px', height: '16px',
              borderRadius: '50%',
              border: '2px solid var(--glass-border)',
              background: i < buffer.length ? 'var(--primary)' : 'transparent',
              transition: 'all 0.2s',
              boxShadow: i < buffer.length ? '0 0 8px rgba(255,133,161,0.5)' : 'none',
            }} />
          ))}
        </div>

        {info && (
          <div style={{ fontSize: '0.82rem', color: '#15803d', marginBottom: '12px', minHeight: '20px' }}>
            {info}
          </div>
        )}
        {error && (
          <div style={{ fontSize: '0.82rem', color: '#f87171', marginBottom: '12px', minHeight: '20px' }}>
            {error}
          </div>
        )}

        {/* PIN pad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', maxWidth: '240px', margin: '0 auto' }}>
          {keys.map((k, i) => (
            <button
              key={i}
              onClick={() => k !== '' && handleKey(String(k))}
              style={{
                background: 'rgba(255,133,161,0.06)',
                border: '1.5px solid rgba(255,133,161,0.2)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font)',
                fontSize: k === '⌫' ? '0.9rem' : '1.2rem',
                fontWeight: 600,
                padding: '16px',
                cursor: k === '' ? 'default' : 'pointer',
                visibility: k === '' ? 'hidden' : 'visible',
                transition: 'all 0.15s',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              display: 'block', width: '100%',
              padding: '14px 20px', marginTop: '12px',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--glass)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font)', fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}
