import { useT } from '../i18n';
import { useAppStore } from '../store/useAppStore';

export function CalendarPage() {
  const lang = useAppStore((s) => s.lang);
  const t = useT(lang);

  return (
    <div style={{ padding: '20px', paddingBottom: '80px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px' }}>{t('calendarTitle')}</h1>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius)',
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        {t('calendarPlaceholder')}
      </div>
    </div>
  );
}
