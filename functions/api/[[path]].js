// UmiCare v3 - Cloudflare Pages Function
// File: functions/api/[[path]].js
// KV binding: UMICARE_DATA (set in Pages → Settings → Functions → KV bindings)

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'umicare_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const DEFAULT_TASKS = [
  { id: 't1', name: '第一餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['05:30'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }] },
  { id: 't2', name: '量體重', icon: '⚖️', type: 'weight', scheduleType: 'daily', scheduledTimes: ['07:00'], resultOptions: [] },
  { id: 't3', name: '早上鏟貓砂', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['08:00'], resultOptions: [{ label: '💩 有屎', value: 'poop' }, { label: '💦 有尿', value: 'urine' }, { label: '💩💦 都有', value: 'both' }, { label: '✨ 都沒有', value: 'none' }] },
  { id: 't4', name: '換新鮮飲水', icon: '💧', type: 'water', scheduleType: 'daily', scheduledTimes: ['08:30'], resultOptions: [{ label: '已換 ✅', value: 'done' }, { label: '只補水', value: 'topped' }] },
  { id: 't5', name: '第二餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['09:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }] },
  { id: 't6', name: '第三餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['12:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }] },
  { id: 't7', name: '下午鏟貓砂', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['14:00'], resultOptions: [{ label: '💩 有屎', value: 'poop' }, { label: '💦 有尿', value: 'urine' }, { label: '💩💦 都有', value: 'both' }, { label: '✨ 都沒有', value: 'none' }] },
  { id: 't8', name: '第四餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['16:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }] },
  { id: 't9', name: '貓薄荷', icon: '🌿', type: 'other', scheduleType: 'daily', scheduledTimes: ['19:00'], resultOptions: [{ label: '已給 ✅', value: 'given' }, { label: '跳過', value: 'skip' }] },
  { id: 't10', name: '第五餐(睡前)', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['21:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }] },
  { id: 't11', name: '晚間鏟貓砂', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['21:30'], resultOptions: [{ label: '💩 有屎', value: 'poop' }, { label: '💦 有尿', value: 'urine' }, { label: '💩💦 都有', value: 'both' }, { label: '✨ 都沒有', value: 'none' }] },
  { id: 't12', name: '刷牙', icon: '🦷', type: 'groom', scheduleType: 'daily', scheduledTimes: ['22:00'], resultOptions: [{ label: '完成 ✅', value: 'done' }, { label: '部分完成', value: 'partial' }, { label: '跳過', value: 'skip' }] },
];

const DEFAULT_PERIODIC = [
  { id: 'p1', name: '罐頭加水', intervalDays: 3, lastDoneAt: null, note: '無吞拿魚，喜歡糊狀' },
  { id: 'p2', name: '貓泥', weeklyMax: 3, weeklyCount: 0, weekStart: null, lastDoneAt: null },
  { id: 'p3', name: '剪指甲', intervalDays: 14, lastDoneAt: null },
  { id: 'p4', name: '清耳朵', intervalDays: 14, lastDoneAt: null },
  { id: 'p5', name: '全換貓砂(豆腐砂)', intervalDays: 25, lastDoneAt: null, note: '3-4cm深度' },
  { id: 'p6', name: '洗澡', intervalDays: 45, lastDoneAt: null, note: '抗菌洗劑×2，低速風筒，擦臉' },
  { id: 'p7', name: '健康檢查', intervalDays: 365, lastDoneAt: null, note: '血檢、X-ray、牙科' },
];

const DEFAULT_SETTINGS = { lastPersonWeight: 66.5, catName: '喔咪', appVersion: '3.0' };

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // Strip /api prefix to get the route
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = request.method;
  const KV = env.UMICARE_DATA;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // ── PING ──────────────────────────────────────────────
    if (path === '/ping') {
      return json({ ok: true, version: '3.0' });
    }

    // ── PIN ───────────────────────────────────────────────
    if (path === '/pin/check') {
      const stored = await KV.get('pin');
      return json({ hasPin: !!stored });
    }

    if (path === '/pin/setup' && method === 'POST') {
      const body = await request.json();
      if (!body.pin || body.pin.length < 4) return json({ error: 'PIN must be at least 4 digits' }, 400);
      const existing = await KV.get('pin');
      if (existing) return json({ error: 'PIN already set' }, 400);
      await KV.put('pin', await hashPin(body.pin));
      return json({ ok: true });
    }

    if (path === '/pin/verify' && method === 'POST') {
      const body = await request.json();
      const stored = await KV.get('pin');
      if (!stored) return json({ valid: false, error: 'No PIN set' }, 400);
      const hashed = await hashPin(body.pin);
      return json({ valid: hashed === stored });
    }

    if (path === '/pin/change' && method === 'POST') {
      const body = await request.json();
      const stored = await KV.get('pin');
      if (!stored) return json({ error: 'No PIN set' }, 400);
      if (await hashPin(body.oldPin) !== stored) return json({ error: 'Wrong current PIN' }, 401);
      await KV.put('pin', await hashPin(body.newPin));
      return json({ ok: true });
    }

    // ── SETTINGS ──────────────────────────────────────────
    if (path === '/settings') {
      if (method === 'GET') {
        const raw = await KV.get('settings');
        return json(raw ? JSON.parse(raw) : DEFAULT_SETTINGS);
      }
      if (method === 'POST') {
        const body = await request.json();
        await KV.put('settings', JSON.stringify(body));
        return json({ ok: true });
      }
    }

    // ── CAT PROFILE ───────────────────────────────────────
    if (path === '/cat') {
      if (method === 'GET') {
        const raw = await KV.get('cat:profile');
        return json(raw ? JSON.parse(raw) : { name: '喔咪', nickname: 'Omi' });
      }
      if (method === 'POST') {
        await KV.put('cat:profile', JSON.stringify(await request.json()));
        return json({ ok: true });
      }
    }

    // ── TASKS ─────────────────────────────────────────────
    if (path === '/tasks') {
      if (method === 'GET') {
        const raw = await KV.get('tasks:list');
        return json(raw ? JSON.parse(raw) : DEFAULT_TASKS);
      }
      if (method === 'POST') {
        await KV.put('tasks:list', JSON.stringify(await request.json()));
        return json({ ok: true });
      }
    }

    // ── CHECKINS ──────────────────────────────────────────
    if (path === '/checkins') {
      if (method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const raw = await KV.get(`checkins:${date}`);
        return json(raw ? JSON.parse(raw) : []);
      }
      if (method === 'POST') {
        const body = await request.json();
        const date = body.date || new Date().toISOString().split('T')[0];
        const key = `checkins:${date}`;
        const raw = await KV.get(key);
        const list = raw ? JSON.parse(raw) : [];
        const record = {
          taskId: body.taskId,
          isDone: body.isDone,
          result: body.result || null,
          note: body.note || '',
          time: body.time || new Date().toISOString(),
        };
        const idx = list.findIndex(c => c.taskId === body.taskId);
        if (idx >= 0) list[idx] = record; else list.push(record);
        await KV.put(key, JSON.stringify(list));
        return json({ ok: true, record });
      }
    }

    // ── WEIGHTS ───────────────────────────────────────────
    if (path === '/weights') {
      if (method === 'GET') {
        const raw = await KV.get('weights:list');
        const list = raw ? JSON.parse(raw) : [];
        return json(list.slice(-90));
      }
      if (method === 'POST') {
        const body = await request.json();
        const personWeight = parseFloat(body.personWeight);
        const carryWeight = parseFloat(body.carryWeight);
        const catWeight = parseFloat((carryWeight - personWeight).toFixed(2));
        const record = { id: Date.now().toString(), personWeight, carryWeight, catWeight, note: body.note || '', measuredAt: new Date().toISOString() };
        const raw = await KV.get('weights:list');
        const list = raw ? JSON.parse(raw) : [];
        list.push(record);
        await KV.put('weights:list', JSON.stringify(list));
        // Update lastPersonWeight in settings
        const sRaw = await KV.get('settings');
        const settings = sRaw ? JSON.parse(sRaw) : DEFAULT_SETTINGS;
        settings.lastPersonWeight = personWeight;
        await KV.put('settings', JSON.stringify(settings));
        return json({ ok: true, record });
      }
    }

    // ── PERIODIC ──────────────────────────────────────────
    if (path === '/periodic') {
      if (method === 'GET') {
        const raw = await KV.get('periodic:list');
        return json(raw ? JSON.parse(raw) : DEFAULT_PERIODIC);
      }
      if (method === 'POST') {
        await KV.put('periodic:list', JSON.stringify(await request.json()));
        return json({ ok: true });
      }
    }

    // ── DASHBOARD SUMMARY ─────────────────────────────────
    if (path === '/dashboard' && method === 'GET') {
      const today = new Date().toISOString().split('T')[0];
      const [tasksRaw, checkinsRaw, weightsRaw, periodicRaw, catRaw] = await Promise.all([
        KV.get('tasks:list'), KV.get(`checkins:${today}`),
        KV.get('weights:list'), KV.get('periodic:list'), KV.get('cat:profile'),
      ]);
      const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;
      const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
      const weights = weightsRaw ? JSON.parse(weightsRaw) : [];
      const periodic = periodicRaw ? JSON.parse(periodicRaw) : DEFAULT_PERIODIC;
      const cat = catRaw ? JSON.parse(catRaw) : { name: '喔咪' };
      const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;
      const now = new Date();
      const overduePeriodic = periodic.filter(p => {
        if (!p.intervalDays || !p.lastDoneAt) return false;
        const due = new Date(p.lastDoneAt);
        due.setDate(due.getDate() + p.intervalDays);
        return due < now;
      }).map(p => p.name);
      return json({
        cat,
        today: {
          date: today,
          done: checkins.filter(c => c.isDone).length,
          total: tasks.length,
          percent: tasks.length > 0 ? Math.round(checkins.filter(c => c.isDone).length / tasks.length * 100) : 0,
        },
        latestWeight,
        overduePeriodic,
      });
    }

    return json({ error: 'Not found' }, 404);

  } catch (err) {
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}
