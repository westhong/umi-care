// Shared litter counter UI — used in both TaskCard (scheduled) and LitterModal (quick report)

export interface LitterCounts {
  poop: number;
  pee: number;
}

interface CounterProps {
  emoji: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function Counter({ emoji, label, value, onChange }: CounterProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
      <div style={{ fontSize: '2rem' }}>{emoji}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{
            width: '34px', height: '34px', borderRadius: '50%',
            border: '1px solid var(--glass-border)', background: 'var(--glass)',
            color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font)',
          }}
        >−</button>
        <span style={{
          fontSize: '1.4rem', fontWeight: 700, minWidth: '28px', textAlign: 'center',
          color: value > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
        }}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          style={{
            width: '34px', height: '34px', borderRadius: '50%',
            border: '1px solid var(--glass-border)', background: 'var(--glass)',
            color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font)',
          }}
        >+</button>
      </div>
    </div>
  );
}

interface LitterCounterProps {
  counts: LitterCounts;
  onChange: (counts: LitterCounts) => void;
  poopLabel: string;
  peeLabel: string;
  cleanLabel: string;
}

export function LitterCounter({ counts, onChange, poopLabel, peeLabel, cleanLabel }: LitterCounterProps) {
  const summary =
    counts.poop === 0 && counts.pee === 0
      ? `🧹 ${cleanLabel}`
      : [counts.poop > 0 ? `💩×${counts.poop}` : '', counts.pee > 0 ? `💦×${counts.pee}` : '']
          .filter(Boolean)
          .join('  ');

  return (
    <div style={{
      background: 'rgba(255,133,161,0.06)',
      border: '1px solid rgba(255,133,161,0.18)',
      borderRadius: '14px',
      padding: '14px 12px',
    }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
        <Counter emoji="💩" label={poopLabel} value={counts.poop} onChange={(v) => onChange({ ...counts, poop: v })} />
        <div style={{ width: '1px', background: 'var(--glass-border)', alignSelf: 'stretch' }} />
        <Counter emoji="💦" label={peeLabel} value={counts.pee} onChange={(v) => onChange({ ...counts, pee: v })} />
      </div>
      <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', minHeight: '20px' }}>
        {summary}
      </div>
    </div>
  );
}

// Encode/decode helpers — shared between TaskCard and LitterModal
export function encodeLitterResult(counts: LitterCounts): string {
  const parts: string[] = [];
  if (counts.poop > 0) parts.push(`poop:${counts.poop}`);
  if (counts.pee > 0) parts.push(`pee:${counts.pee}`);
  return parts.length > 0 ? parts.join(',') : 'clean';
}

export function decodeLitterResult(result: string | null | undefined): LitterCounts {
  if (!result || result === 'clean' || result === 'none') return { poop: 0, pee: 0 };
  if (result === 'both') return { poop: 1, pee: 1 };
  if (result === 'poop') return { poop: 1, pee: 0 };
  if (result === 'urine') return { poop: 0, pee: 1 };
  const obj: LitterCounts = { poop: 0, pee: 0 };
  result.split(',').forEach((part) => {
    const [k, v] = part.split(':');
    if (k === 'poop') obj.poop = parseInt(v, 10) || 0;
    if (k === 'pee') obj.pee = parseInt(v, 10) || 0;
  });
  return obj;
}

export function formatLitterSummary(result: string | null | undefined, cleanLabel: string): string {
  const { poop, pee } = decodeLitterResult(result);
  const parts: string[] = [];
  if (poop > 0) parts.push(`💩×${poop}`);
  if (pee > 0) parts.push(`💦×${pee}`);
  return parts.length > 0 ? parts.join(' ') : `🧹 ${cleanLabel}`;
}
