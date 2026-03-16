import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';

interface ProgressRingProps {
  pct: number;
  done: number;
  total: number;
  catName: string;
  sub: string;
}

export function ProgressRing({ pct, done, total, catName, sub }: ProgressRingProps) {
  const lang = useAppStore((s) => s.lang);
  const t = useT(lang);
  const circumference = 2 * Math.PI * 33;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{
      padding: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      background: 'linear-gradient(135deg, rgba(255,133,161,0.08) 0%, rgba(200,168,233,0.08) 100%)',
      margin: '12px 16px',
      borderRadius: 'var(--radius)',
      border: '1px solid rgba(255,133,161,0.15)',
      boxShadow: '0 2px 12px rgba(255,133,161,0.08)',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff85a1" />
              <stop offset="100%" stopColor="#ffb347" />
            </linearGradient>
          </defs>
          <circle fill="none" stroke="var(--glass-border)" strokeWidth="6" cx="40" cy="40" r="33" />
          <circle
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke="url(#ringGrad)"
            cx="40"
            cy="40"
            r="33"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
            {pct}%
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t('progressLabel')}</div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600 }}>{catName}</h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{sub}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
          {t('progressCount', done, total)}
        </div>
      </div>
    </div>
  );
}
