import { useT } from '../i18n';
import { useAppStore } from '../store/useAppStore';

interface BottomNavProps {
  page: 'tasks' | 'calendar';
  onNavigate: (page: 'tasks' | 'calendar') => void;
}

export function BottomNav({ page, onNavigate }: BottomNavProps) {
  const lang = useAppStore((s) => s.lang);
  const t = useT(lang);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(255,255,255,0.96)',
      backdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255,133,161,0.2)',
      display: 'flex',
      zIndex: 50,
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
      boxShadow: '0 -4px 20px rgba(255,133,161,0.1)',
    }}>
      <button
        className={`nav-btn${page === 'tasks' ? ' active' : ''}`}
        onClick={() => onNavigate('tasks')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 0 8px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          color: page === 'tasks' ? 'var(--primary)' : 'var(--text-muted)',
          fontFamily: 'var(--font)',
          fontSize: '0.7rem',
        }}
      >
        <span style={{ fontSize: '1.3rem', marginBottom: '2px' }}>📋</span>
        {t('todayLabel')}
      </button>

      <button
        className={`nav-btn${page === 'calendar' ? ' active' : ''}`}
        onClick={() => onNavigate('calendar')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 0 8px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          color: page === 'calendar' ? 'var(--primary)' : 'var(--text-muted)',
          fontFamily: 'var(--font)',
          fontSize: '0.7rem',
        }}
      >
        <span style={{ fontSize: '1.3rem', marginBottom: '2px' }}>📅</span>
        {t('calendarLabel')}
      </button>
    </nav>
  );
}
