import { useState, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { get } from './api/client';
import { PinOverlay } from './components/PinOverlay';
import { BottomNav } from './components/BottomNav';
import { TasksPage } from './pages/TasksPage';
import { CalendarPage } from './pages/CalendarPage';
import { AdminPage } from './pages/AdminPage';
import type { CatProfile, Settings } from './store/useAppStore';

type Page = 'tasks' | 'calendar' | 'admin';

export default function App() {
  const { adminMode, setAdminMode, setCat, setSettings } = useAppStore();
  const [page, setPage] = useState<Page>('tasks');
  const [pinState, setPinState] = useState<'loading' | 'setup' | 'ready'>('loading');
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    // Check if PIN is set up
    get<{ hasPin: boolean }>('/api/pin/check').then((r) => {
      setPinState(r.hasPin ? 'ready' : 'setup');
    }).catch(() => {
      setPinState('ready'); // Offline fallback
    });

    // Load cat profile + settings
    Promise.all([
      get<CatProfile>('/api/cat').catch(() => null),
      get<Settings>('/api/settings').catch(() => null),
    ]).then(([cat, settings]) => {
      if (cat) setCat(cat);
      if (settings) setSettings(settings);
    });
  }, [setCat, setSettings]);

  const handleAdminLogin = () => {
    setAdminMode(true);
    setShowAdminLogin(false);
    setPage('admin');
  };

  const handleAdminLogout = () => {
    setAdminMode(false);
    setPage('tasks');
  };



  if (pinState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{
          width: '20px', height: '20px',
          border: '2px solid var(--glass-border)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
        }} />
      </div>
    );
  }

  if (pinState === 'setup') {
    return <PinOverlay mode="setup" onSuccess={() => setPinState('ready')} />;
  }

  return (
    <>
      {/* Admin Login Overlay */}
      {showAdminLogin && (
        <PinOverlay
          mode="login"
          onSuccess={handleAdminLogin}
          onCancel={() => setShowAdminLogin(false)}
        />
      )}

      {/* Pages */}
      {page === 'tasks' && (
        <TasksPage onAdminOpen={() => setShowAdminLogin(true)} />
      )}
      {page === 'calendar' && <CalendarPage />}
      {page === 'admin' && adminMode && (
        <AdminPage onLogout={handleAdminLogout} />
      )}

      {/* Bottom Nav (hidden in admin) */}
      {page !== 'admin' && (
        <BottomNav
          page={page as 'tasks' | 'calendar'}
          onNavigate={(p) => setPage(p)}
        />
      )}
    </>
  );
}
