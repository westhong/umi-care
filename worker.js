// UmiCare v3 Cloudflare Worker
// KV Namespace binding: UMICARE_DATA
// Worker URL: https://umicare-api.westhong.workers.dev

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'umicare_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_TASKS = [
  { id: 't1', name: '第一餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['05:30'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }], requireNote: false },
  { id: 't2', name: '量體重', icon: '⚖️', type: 'weight', scheduleType: 'daily', scheduledTimes: ['07:00'], resultOptions: [], requireNote: false },
  { id: 't3', name: '早上鏟貓砂', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['08:00'], resultOptions: [{ label: '💩 有屎', value: 'poop' }, { label: '💦 有尿', value: 'urine' }, { label: '💩💦 都有', value: 'both' }, { label: '✨ 都沒有', value: 'none' }], requireNote: false },
  { id: 't4', name: '換新鮮飲水', icon: '💧', type: 'water', scheduleType: 'daily', scheduledTimes: ['08:30'], resultOptions: [{ label: '已換 ✅', value: 'done' }, { label: '只補水', value: 'topped' }], requireNote: false },
  { id: 't5', name: '第二餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['09:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }], requireNote: false },
  { id: 't6', name: '第三餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['12:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }], requireNote: false },
  { id: 't7', name: '下午鏟貓砂', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['14:00'], resultOptions: [{ label: '💩 有屎', value: 'poop' }, { label: '💦 有尿', value: 'urine' }, { label: '💩💦 都有', value: 'both' }, { label: '✨ 都沒有', value: 'none' }], requireNote: false },
  { id: 't8', name: '第四餐', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['16:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }], requireNote: false },
  { id: 't9', name: '貓薄荷', icon: '🌿', type: 'other', scheduleType: 'daily', scheduledTimes: ['19:00'], resultOptions: [{ label: '已給 ✅', value: 'given' }, { label: '跳過', value: 'skip' }], requireNote: false },
  { id: 't10', name: '第五餐(睡前)', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['21:00'], resultOptions: [{ label: '正常進食 ✅', value: 'normal' }, { label: '少量進食', value: 'little' }, { label: '完全不吃', value: 'none' }], requireNote: false },
  { id: 't11', name: '晚間鏟貓砂', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['21:30'], resultOptions: [{ label: '💩 有屎', value: 'poop' }, { label: '💦 有尿', value: 'urine' }, { label: '💩💦 都有', value: 'both' }, { label: '✨ 都沒有', value: 'none' }], requireNote: false },
  { id: 't12', name: '刷牙', icon: '🦷', type: 'groom', scheduleType: 'daily', scheduledTimes: ['22:00'], resultOptions: [{ label: '完成 ✅', value: 'done' }, { label: '部分完成', value: 'partial' }, { label: '跳過', value: 'skip' }], requireNote: false },
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

const DEFAULT_SETTINGS = {
  lastPersonWeight: 66.5,
  catName: '喔咪',
  appVersion: '3.0',
};

const DEFAULT_CAT = {
  name: '喔咪',
  nickname: 'Omi',
  breed: '虎斑貓',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return handleOptions();

    try {
      // PIN routes
      if (path === '/api/ping') {
        return jsonResponse({ ok: true, version: '3.0' });
      }

      if (path === '/api/pin/check') {
        const stored = await env.UMICARE_DATA.get('pin');
        return jsonResponse({ hasPin: !!stored });
      }

      if (path === '/api/pin/setup' && method === 'POST') {
        const body = await request.json();
        if (!body.pin || body.pin.length < 4) {
          return jsonResponse({ error: 'PIN must be at least 4 digits' }, 400);
        }
        const existing = await env.UMICARE_DATA.get('pin');
        if (existing) {
          return jsonResponse({ error: 'PIN already set. Use /api/pin/change to update.' }, 400);
        }
        const hashed = await hashPin(body.pin);
        await env.UMICARE_DATA.put('pin', hashed);
        return jsonResponse({ ok: true, message: 'PIN set successfully' });
      }

      if (path === '/api/pin/verify' && method === 'POST') {
        const body = await request.json();
        const stored = await env.UMICARE_DATA.get('pin');
        if (!stored) return jsonResponse({ valid: false, error: 'No PIN set' }, 400);
        const hashed = await hashPin(body.pin);
        return jsonResponse({ valid: hashed === stored });
      }

      if (path === '/api/pin/change' && method === 'POST') {
        const body = await request.json();
        const stored = await env.UMICARE_DATA.get('pin');
        if (!stored) return jsonResponse({ error: 'No PIN set' }, 400);
        const oldHashed = await hashPin(body.oldPin);
        if (oldHashed !== stored) return jsonResponse({ error: 'Wrong current PIN' }, 401);
        const newHashed = await hashPin(body.newPin);
        await env.UMICARE_DATA.put('pin', newHashed);
        return jsonResponse({ ok: true });
      }

      // Settings
      if (path === '/api/settings') {
        if (method === 'GET') {
          const raw = await env.UMICARE_DATA.get('settings');
          const settings = raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
          return jsonResponse(settings);
        }
        if (method === 'POST') {
          const body = await request.json();
          await env.UMICARE_DATA.put('settings', JSON.stringify(body));
          return jsonResponse({ ok: true });
        }
      }

      // Cat profile
      if (path === '/api/cat') {
        if (method === 'GET') {
          const raw = await env.UMICARE_DATA.get('cat:profile');
          return jsonResponse(raw ? JSON.parse(raw) : DEFAULT_CAT);
        }
        if (method === 'POST') {
          const body = await request.json();
          await env.UMICARE_DATA.put('cat:profile', JSON.stringify(body));
          return jsonResponse({ ok: true });
        }
      }

      // Tasks
      if (path === '/api/tasks') {
        if (method === 'GET') {
          const raw = await env.UMICARE_DATA.get('tasks:list');
          return jsonResponse(raw ? JSON.parse(raw) : DEFAULT_TASKS);
        }
        if (method === 'POST') {
          const body = await request.json();
          await env.UMICARE_DATA.put('tasks:list', JSON.stringify(body));
          return jsonResponse({ ok: true });
        }
      }

      // Checkins
      if (path === '/api/checkins') {
        if (method === 'GET') {
          const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
          const raw = await env.UMICARE_DATA.get(`checkins:${date}`);
          return jsonResponse(raw ? JSON.parse(raw) : []);
        }
        if (method === 'POST') {
          const body = await request.json();
          const date = body.date || new Date().toISOString().split('T')[0];
          const key = `checkins:${date}`;
          const raw = await env.UMICARE_DATA.get(key);
          const existing = raw ? JSON.parse(raw) : [];
          // Replace if same taskId exists for this date, otherwise append
          const idx = existing.findIndex(c => c.taskId === body.taskId);
          const record = {
            taskId: body.taskId,
            isDone: body.isDone,
            result: body.result || null,
            note: body.note || '',
            time: body.time || new Date().toISOString(),
          };
          if (idx >= 0) existing[idx] = record;
          else existing.push(record);
          await env.UMICARE_DATA.put(key, JSON.stringify(existing));
          return jsonResponse({ ok: true, record });
        }
      }

      // Weights
      if (path === '/api/weights') {
        if (method === 'GET') {
          const raw = await env.UMICARE_DATA.get('weights:list');
          const list = raw ? JSON.parse(raw) : [];
          // Return last 90 entries
          return jsonResponse(list.slice(-90));
        }
        if (method === 'POST') {
          const body = await request.json();
          const personWeight = parseFloat(body.personWeight);
          const carryWeight = parseFloat(body.carryWeight);
          const catWeight = parseFloat((carryWeight - personWeight).toFixed(2));
          const record = {
            id: Date.now().toString(),
            personWeight,
            carryWeight,
            catWeight,
            note: body.note || '',
            measuredAt: new Date().toISOString(),
          };
          const raw = await env.UMICARE_DATA.get('weights:list');
          const list = raw ? JSON.parse(raw) : [];
          list.push(record);
          await env.UMICARE_DATA.put('weights:list', JSON.stringify(list));
          // Also update last person weight in settings
          const settingsRaw = await env.UMICARE_DATA.get('settings');
          const settings = settingsRaw ? JSON.parse(settingsRaw) : DEFAULT_SETTINGS;
          settings.lastPersonWeight = personWeight;
          await env.UMICARE_DATA.put('settings', JSON.stringify(settings));
          return jsonResponse({ ok: true, record });
        }
      }

      // Periodic tasks
      if (path === '/api/periodic') {
        if (method === 'GET') {
          const raw = await env.UMICARE_DATA.get('periodic:list');
          return jsonResponse(raw ? JSON.parse(raw) : DEFAULT_PERIODIC);
        }
        if (method === 'POST') {
          const body = await request.json();
          await env.UMICARE_DATA.put('periodic:list', JSON.stringify(body));
          return jsonResponse({ ok: true });
        }
      }

      // Dashboard summary
      if (path === '/api/dashboard' && method === 'GET') {
        const today = new Date().toISOString().split('T')[0];
        const [tasksRaw, checkinsRaw, weightsRaw, periodicRaw, catRaw] = await Promise.all([
          env.UMICARE_DATA.get('tasks:list'),
          env.UMICARE_DATA.get(`checkins:${today}`),
          env.UMICARE_DATA.get('weights:list'),
          env.UMICARE_DATA.get('periodic:list'),
          env.UMICARE_DATA.get('cat:profile'),
        ]);
        const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;
        const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
        const weights = weightsRaw ? JSON.parse(weightsRaw) : [];
        const periodic = periodicRaw ? JSON.parse(periodicRaw) : DEFAULT_PERIODIC;
        const cat = catRaw ? JSON.parse(catRaw) : DEFAULT_CAT;

        const doneCount = checkins.filter(c => c.isDone).length;
        const totalCount = tasks.length;
        const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

        // Get last 7 days completion
        const recentDays = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const dayRaw = await env.UMICARE_DATA.get(`checkins:${dateStr}`);
          const dayCheckins = dayRaw ? JSON.parse(dayRaw) : [];
          recentDays.push({
            date: dateStr,
            done: dayCheckins.filter(c => c.isDone).length,
            total: tasks.length,
          });
        }

        // Overdue periodic
        const now = new Date();
        const overduePeriodic = periodic.filter(p => {
          if (!p.intervalDays || !p.lastDoneAt) return false;
          const due = new Date(p.lastDoneAt);
          due.setDate(due.getDate() + p.intervalDays);
          return due < now;
        }).map(p => p.name);

        return jsonResponse({
          cat,
          today: { date: today, done: doneCount, total: totalCount, percent: totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0 },
          latestWeight,
          recentDays,
          overduePeriodic,
        });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message || 'Internal server error' }, 500);
    }
  },
};
