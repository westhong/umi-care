// AdminPage — placeholder for v5.0.8
// Full admin panel implementation coming in v5.1

import { useAppStore } from '../store/useAppStore';

export function AdminPage() {
  const { setAdminMode, cat } = useAppStore();

  return (
    <div style={{ paddingBottom: '20px' }}>
      {/* Admin Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, #c084fc 100%)',
        padding: '20px 20px 16px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '1.35rem', fontWeight: 800 }}>🛠️ 管理員模式</span>
          <button
            onClick={() => setAdminMode(false)}
            style={{
              background: 'rgba(255,255,255,0.22)', border: 'none', color: '#fff',
              borderRadius: '20px', padding: '7px 16px', fontSize: '0.82rem',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            🚪 登出
          </button>
        </div>
        <div style={{ fontSize: '0.78rem', opacity: 0.88 }}>
          UmiCare v5.0.8 · {cat?.name || '屋咪'} 照護系統
        </div>
      </div>

      {/* Placeholder content */}
      <div style={{ padding: '20px' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius)',
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🚧</div>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>管理員面板重構中</div>
          <div style={{ fontSize: '0.85rem' }}>完整管理功能將在 v5.1 實作</div>
          <div style={{ fontSize: '0.75rem', marginTop: '16px', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
            React 19 migration · Phase 1 of N
          </div>
        </div>
      </div>
    </div>
  );
}
