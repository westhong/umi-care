// Calgary timezone helpers (DST-aware) — ported from v4.x

export function getCalgaryDate(now = new Date()): Date {
  const year = now.getUTCFullYear();
  const dstStart = (() => {
    const d = new Date(Date.UTC(year, 2, 1));
    let s = 0;
    while (s < 2) { if (d.getUTCDay() === 0) s++; if (s < 2) d.setUTCDate(d.getUTCDate() + 1); }
    d.setUTCHours(9, 0, 0, 0); return d;
  })();
  const dstEnd = (() => {
    const d = new Date(Date.UTC(year, 10, 1));
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(8, 0, 0, 0); return d;
  })();
  const offset = (now >= dstStart && now < dstEnd) ? -6 : -7;
  return new Date(now.getTime() + offset * 3600000);
}

export function getCalgaryTotalMinutes(): number {
  const c = getCalgaryDate();
  return c.getUTCHours() * 60 + c.getUTCMinutes();
}

export function utcToCalgaryClock(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const c = getCalgaryDate(new Date(isoStr));
    return `${String(c.getUTCHours()).padStart(2, '0')}:${String(c.getUTCMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}
