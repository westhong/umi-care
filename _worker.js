// deploy-ts:1772862037
// UmiCare v5.7.2 – Cloudflare Worker with Static Assets
// ⚠️  DATA PROTECTION: Do NOT add KV.delete() calls on user data keys.
//     Protected keys: tasks:list, checkins:*, weights:list, periodic:list,
//                     settings, cat:profile, pin
//     Only push:subscription and debug:* are safe to delete.
// Architecture: Worker handles /api/* ; everything else → ASSETS (index.html)
// KV binding: UMICARE_DATA (configured in wrangler.toml)

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'umicare_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const CORS = {
  'Access-Control-Allow-Origin': 'https://umi-care.westech.com.hk',
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
  { id: 't1', name: '第一餐', nameEn: 'Meal 1', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['05:30'], resultOptions: [{ label: '正常進食 ✅', labelEn: 'Ate normally ✅', value: 'normal' }, { label: '少量進食', labelEn: 'Ate a little', value: 'little' }, { label: '完全不吃', labelEn: 'Refused to eat', value: 'none' }] },
  { id: 't2', name: '量體重', nameEn: 'Weigh Cat', icon: '⚖️', type: 'weight', scheduleType: 'weekly', weekDays: [0], scheduledTimes: ['07:00'], resultOptions: [] },
  { id: 't3', name: '早上清貓砂', nameEn: 'Clean Litter Box (AM)', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['08:00'], resultOptions: [] },
  { id: 't4', name: '更換新鮮飲水', nameEn: 'Refresh Water', icon: '💧', type: 'water', scheduleType: 'daily', scheduledTimes: ['08:30'], resultOptions: [{ label: '已更換 ✅', labelEn: 'Replaced ✅', value: 'done' }, { label: '僅補水', labelEn: 'Topped up only', value: 'topped' }] },
  { id: 't5', name: '第二餐', nameEn: 'Meal 2', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['09:00'], resultOptions: [{ label: '正常進食 ✅', labelEn: 'Ate normally ✅', value: 'normal' }, { label: '少量進食', labelEn: 'Ate a little', value: 'little' }, { label: '完全不吃', labelEn: 'Refused to eat', value: 'none' }] },
  { id: 't6', name: '第三餐', nameEn: 'Meal 3', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['12:00'], resultOptions: [{ label: '正常進食 ✅', labelEn: 'Ate normally ✅', value: 'normal' }, { label: '少量進食', labelEn: 'Ate a little', value: 'little' }, { label: '完全不吃', labelEn: 'Refused to eat', value: 'none' }] },
  { id: 't7', name: '下午清貓砂', nameEn: 'Clean Litter Box (PM)', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['14:00'], resultOptions: [] },
  { id: 't8', name: '第四餐', nameEn: 'Meal 4', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['16:00'], resultOptions: [{ label: '正常進食 ✅', labelEn: 'Ate normally ✅', value: 'normal' }, { label: '少量進食', labelEn: 'Ate a little', value: 'little' }, { label: '完全不吃', labelEn: 'Refused to eat', value: 'none' }] },
  { id: 't9', name: '貓薄荷', nameEn: 'Catnip', icon: '🌿', type: 'other', scheduleType: 'daily', scheduledTimes: ['19:00'], resultOptions: [{ label: '已給予 ✅', labelEn: 'Given ✅', value: 'given' }, { label: '略過', labelEn: 'Skipped', value: 'skip' }] },
  { id: 't10', name: '第五餐(睡前)', nameEn: 'Meal 5 (Bedtime)', icon: '🍽️', type: 'meal', scheduleType: 'daily', scheduledTimes: ['21:00'], resultOptions: [{ label: '正常進食 ✅', labelEn: 'Ate normally ✅', value: 'normal' }, { label: '少量進食', labelEn: 'Ate a little', value: 'little' }, { label: '完全不吃', labelEn: 'Refused to eat', value: 'none' }] },
  { id: 't11', name: '晚上清貓砂', nameEn: 'Clean Litter Box (Night)', icon: '🪣', type: 'litter', scheduleType: 'daily', scheduledTimes: ['21:30'], resultOptions: [] },
  { id: 't12', name: '刷牙', nameEn: 'Brush Teeth', icon: '🦷', type: 'groom', scheduleType: 'daily', scheduledTimes: ['22:00'], resultOptions: [{ label: '完成 ✅', labelEn: 'Done ✅', value: 'done' }, { label: '部分完成', labelEn: 'Partially done', value: 'partial' }, { label: '略過', labelEn: 'Skipped', value: 'skip' }] },
];


const DEFAULT_PERIODIC = [
  { id: 'p1', icon: '💧', name: '罐頭加水', nameEn: 'Add Water to Can', intervalDays: 3, lastDoneAt: null, note: '不含鮪魚，偏好泥狀' },
  { id: 'p2', icon: '🍮', name: '貓泥', nameEn: 'Cat Puree', weeklyMax: 3, weeklyCount: 0, weekStart: null, lastDoneAt: null },
  { id: 'p3', icon: '✂️', name: '剪指甲', nameEn: 'Trim Nails', intervalDays: 14, lastDoneAt: null },
  { id: 'p4', icon: '👂', name: '清耳朵', nameEn: 'Clean Ears', intervalDays: 14, lastDoneAt: null },
  { id: 'p5', icon: '🪣', name: '全盆更換貓砂（木薯砂）', nameEn: 'Full Litter Change (Cassava)', intervalDays: 25, lastDoneAt: null, note: '木薯砂，一包' },
  { id: 'p6', icon: '🛁', name: '洗澡', nameEn: 'Bath', intervalDays: 45, lastDoneAt: null, note: '抗菌洗劑 ×2、低速吹風機、擦拭臉部' },
  { id: 'p7', icon: '🏥', name: '健康檢查', nameEn: 'Health Checkup', intervalDays: 365, lastDoneAt: null, note: '血檢、X-ray、牙科' },
];

const DEFAULT_SETTINGS = { lastPersonWeight: 66.5, catName: '屋咪', appVersion: '5.7.2' };

function normalizeSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...raw };
}

async function handleApi(request, env, url) {
  const KV = env.UMICARE_DATA;
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    // PING
    if (path === '/ping') return json({ ok: true, version: '5.7.2', kv: !!KV });

    // PIN
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
      if (!body.pin || typeof body.pin !== 'string') {
        return json({ valid: false, error: 'PIN required' }, 400);
      }
      // Rate-limit: max 10 attempts per hour per CF worker (KV-based)
      const rlKey = 'pin:attempts';
      const rlRaw = await KV.get(rlKey);
      const rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, resetAt: 0 };
      const now = Date.now();
      if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + 3600000; }
      if (rl.count >= 10) {
        const wait = Math.ceil((rl.resetAt - now) / 60000);
        return json({ valid: false, locked: true, error: `Too many attempts. Try again in ${wait} min.` }, 429);
      }
      const hashed = await hashPin(body.pin);
      const valid = hashed === stored;
      if (!valid) {
        rl.count++;
        await KV.put(rlKey, JSON.stringify(rl), { expirationTtl: 3600 });
      } else {
        await KV.delete(rlKey); // reset on success
      }
      return json({ valid });
    }
    if (path === '/pin/change' && method === 'POST') {
      const body = await request.json();
      const stored = await KV.get('pin');
      if (!stored) return json({ error: 'No PIN set' }, 400);
      // Validate new PIN
      if (!body.newPin || body.newPin.length < 4) return json({ error: 'New PIN must be at least 4 digits' }, 400);
      if (!body.oldPin || typeof body.oldPin !== 'string') {
        return json({ error: 'oldPin required' }, 400);
      }
      // Rate-limit on change attempts (shared with verify)
      const rlKey = 'pin:attempts';
      const rlRaw = await KV.get(rlKey);
      const rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, resetAt: 0 };
      const now = Date.now();
      if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + 3600000; }
      if (rl.count >= 10) {
        const wait = Math.ceil((rl.resetAt - now) / 60000);
        return json({ locked: true, error: `Too many attempts. Try again in ${wait} min.` }, 429);
      }
      if (await hashPin(body.oldPin) !== stored) {
        rl.count++;
        await KV.put(rlKey, JSON.stringify(rl), { expirationTtl: 3600 });
        return json({ error: 'Wrong current PIN' }, 401);
      }
      await KV.put('pin', await hashPin(body.newPin));
      await KV.delete(rlKey); // reset on success
      return json({ ok: true });
    }

    // SETTINGS
    if (path === '/settings') {
      if (method === 'GET') {
        const raw = await KV.get('settings');
        return json(normalizeSettings(raw ? JSON.parse(raw) : {}));
      }
      if (method === 'POST') {
        const body = await request.json();
        await KV.put('settings', JSON.stringify(normalizeSettings(body)));
        return json({ ok: true });
      }
    }

    if (path === '/resolution-templates') {
      if (method === 'GET') {
        const raw = await KV.get('resolution:templates');
        const list = raw ? JSON.parse(raw) : [];
        return json(Array.isArray(list) && list.length ? list : DEFAULT_RESOLUTION_TEMPLATES);
      }
      if (method === 'POST') {
        const body = await request.json();
        if (!Array.isArray(body)) return json({ error: 'array required' }, 400);
        const cleaned = body
          .map((item, index) => ({
            id: String(item?.id || `template_${Date.now()}_${index}`)
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_-]+/g, '_')
              .replace(/^_+|_+$/g, ''),
            label: String(item?.label || '').trim(),
            note: String(item?.note || '').trim(),
          }))
          .filter((item) => item.id && item.label && item.note);
        if (!cleaned.length) return json({ error: 'at least one valid template required' }, 400);
        await KV.put('resolution:templates', JSON.stringify(cleaned));
        return json({ ok: true, templates: cleaned });
      }
    }

    // CAT PROFILE
    if (path === '/cat') {
      if (method === 'GET') {
        const raw = await KV.get('cat:profile');
        return json(raw ? JSON.parse(raw) : { name: '屋咪', nickname: 'Omi' });
      }
      if (method === 'POST') {
        await KV.put('cat:profile', JSON.stringify(await request.json()));
        return json({ ok: true });
      }
    }

    // TASKS
    if (path === '/tasks') {
      if (method === 'GET') {
        const raw = await KV.get('tasks:list');
        if (!raw) {
          // First time: initialize KV with default tasks so cron can find them
          await KV.put('tasks:list', JSON.stringify(DEFAULT_TASKS));
          return json(DEFAULT_TASKS);
        }
        // Merge nameEn from DEFAULT_TASKS for tasks that don't have it
        const defaultMap = Object.fromEntries(DEFAULT_TASKS.map(t => [t.id, t]));
        const tasks = JSON.parse(raw).map(t => ({
          ...t,
          nameEn: t.nameEn || defaultMap[t.id]?.nameEn || t.name,
        }));
        return json(tasks);
      }
      if (method === 'POST') {
        const newTasks = await request.json();
        // ⚠️ DATA PROTECTION: refuse to overwrite with empty array
        if (!Array.isArray(newTasks) || newTasks.length === 0) {
          return json({ error: 'Refusing to save empty tasks list – data protection' }, 400);
        }
        await KV.put('tasks:list', JSON.stringify(newTasks));
        return json({ ok: true });
      }
    }

    // CHECKINS
    if (path === '/checkins') {
      if (method === 'GET') {
        const date = url.searchParams.get('date') || getCalgaryDateStr(new Date()); // Calgary fallback
        const raw = await KV.get(`checkins:${date}`);
        return json(raw ? JSON.parse(raw) : []);
      }
      if (method === 'DELETE') {
        const date = url.searchParams.get('date');
        if (!date) return json({ error: 'date param required' }, 400);
        const taskId = url.searchParams.get('taskId');
        if (taskId) {
          // Delete a single checkin entry by taskId
          const key = `checkins:${date}`;
          const raw = await KV.get(key);
          const list = raw ? JSON.parse(raw) : [];
          const updated = list.filter(c => c.taskId !== taskId);
          await KV.put(key, JSON.stringify(updated));
          return json({ ok: true, removed: taskId, remaining: updated.length });
        }
        await KV.delete(`checkins:${date}`);
        return json({ ok: true, deleted: `checkins:${date}` });
      }
      if (method === 'POST') {
        const body = await request.json();
        const date = body.date || getCalgaryDateStr(new Date()); // Calgary fallback
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

    // WEIGHTS
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
        const record = {
          id: Date.now().toString(),
          personWeight, carryWeight, catWeight,
          note: body.note || '',
          measuredAt: new Date().toISOString()
        };
        const raw = await KV.get('weights:list');
        const list = raw ? JSON.parse(raw) : [];
        list.push(record);
        // Trim to prevent KV value from growing unbounded (max 365 entries)
        if (list.length > 365) list.splice(0, list.length - 365);
        await KV.put('weights:list', JSON.stringify(list));
        const sRaw = await KV.get('settings');
        const settings = normalizeSettings(sRaw ? JSON.parse(sRaw) : {});
        settings.lastPersonWeight = personWeight;
        await KV.put('settings', JSON.stringify(settings));
        return json({ ok: true, record });
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) return json({ ok: false, error: 'Missing id' }, 400);
        const raw = await KV.get('weights:list');
        const list = raw ? JSON.parse(raw) : [];
        const next = list.filter((w) => w.id !== id);
        await KV.put('weights:list', JSON.stringify(next));
        return json({ ok: true });
      }
    }

    // PERIODIC
    if (path === '/periodic') {
      if (method === 'GET') {
        const raw = await KV.get('periodic:list');
        const list = raw ? JSON.parse(raw) : [];
        return json(Array.isArray(list) && list.length ? list : DEFAULT_PERIODIC);
      }
      if (method === 'POST') {
        await KV.put('periodic:list', JSON.stringify(await request.json()));
        return json({ ok: true });
      }
    }

    // DASHBOARD SUMMARY
    if (path === '/dashboard' && method === 'GET') {
      const today = getCalgaryDateStr(new Date()); // Calgary local date to match frontend
      const [tasksRaw, checkinsRaw, weightsRaw, periodicRaw, catRaw] = await Promise.all([
        KV.get('tasks:list'), KV.get(`checkins:${today}`),
        KV.get('weights:list'), KV.get('periodic:list'), KV.get('cat:profile'),
      ]);
      const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;
      const activeTasks = tasks.filter(task => isTaskActiveOnCalgaryDate(task, new Date()));
      const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
      const weights = weightsRaw ? JSON.parse(weightsRaw) : [];
      const periodic = periodicRaw ? JSON.parse(periodicRaw) : DEFAULT_PERIODIC;
      const cat = catRaw ? JSON.parse(catRaw) : { name: '屋咪' };
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
          total: activeTasks.length,
          percent: activeTasks.length > 0 ? Math.round(checkins.filter(c => c.isDone).length / activeTasks.length * 100) : 0,
        },
        latestWeight,
        overduePeriodic,
      });
    }


    // ── AD-HOC PRESETS ───────────────────────────────────────────────────
    if (path === '/adhoc/presets') {
      if (method === 'GET') {
        const raw = await KV.get('adhoc:presets');
        return json(raw ? JSON.parse(raw) : []);
      }
      if (method === 'POST') {
        const body = await request.json();
        if (!Array.isArray(body)) return json({ error: 'array required' }, 400);
        await KV.put('adhoc:presets', JSON.stringify(body));
        return json({ ok: true });
      }
    }

    // ── AD-HOC REQUESTS ──────────────────────────────────────────────────
    if (path === '/adhoc') {
      if (method === 'GET') {
        const raw = await KV.get('adhoc:requests');
        return json(raw ? JSON.parse(raw) : []);
      }
      if (method === 'POST') {
        // Admin creates a new ad-hoc request
        const body = await request.json();
        if (!body.name) return json({ error: 'name required' }, 400);
        const raw = await KV.get('adhoc:requests');
        const list = raw ? JSON.parse(raw) : [];
        const item = {
          id: 'ah_' + Date.now(),
          name: body.name,
          icon: body.icon || '📌',
          note: body.note || '',
          createdAt: new Date().toISOString(),
          done: false,
          doneAt: null,
          doneResult: null,
        };
        list.push(item);
        await KV.put('adhoc:requests', JSON.stringify(list));
        return json({ ok: true, item });
      }
    }
    // Mark ad-hoc as done:  POST /api/adhoc/:id/done
    const adhocDoneMatch = path.match(/^\/adhoc\/(ah_\d+)\/done$/);
    if (adhocDoneMatch && method === 'POST') {
      const id = adhocDoneMatch[1];
      const body = await request.json().catch(() => ({}));
      const raw = await KV.get('adhoc:requests');
      if (!raw) return json({ error: 'not found' }, 404);
      const list = JSON.parse(raw);
      const item = list.find(x => x.id === id);
      if (!item) return json({ error: 'not found' }, 404);
      item.done = true;
      item.doneAt = new Date().toISOString();
      item.doneResult = body.result || null;
      item.doneNote = body.note || '';
      await KV.put('adhoc:requests', JSON.stringify(list));
      return json({ ok: true, item });
    }
    // Delete (admin dismisses) ad-hoc:  DELETE /api/adhoc/:id
    const adhocDelMatch = path.match(/^\/adhoc\/(ah_\d+)$/);
    if (adhocDelMatch && method === 'DELETE') {
      const id = adhocDelMatch[1];
      const raw = await KV.get('adhoc:requests');
      if (!raw) return json({ ok: true });
      const list = JSON.parse(raw).filter(x => x.id !== id);
      await KV.put('adhoc:requests', JSON.stringify(list));
      return json({ ok: true });
    }


    // === Caregiver Self Reports ===
    if (path === '/selfreports' && method === 'GET') {
      const date = url.searchParams.get('date');
      const raw = await KV.get('selfreports:list');
      const list = raw ? JSON.parse(raw) : [];
      const filtered = date
        ? list.filter(item => getCalgaryDateStr(new Date(item.reportedAt || item.createdAt || Date.now())) === date)
        : list;
      return json(filtered);
    }
    if (path === '/selfreports' && method === 'POST') {
      const body = await request.json();
      const raw = await KV.get('selfreports:list');
      const list = raw ? JSON.parse(raw) : [];
      const rawQty = parseFloat(body.quantity) || 1;
      const quantity = Math.max(0.5, Math.min(9.5, Math.round(rawQty * 2) / 2)); // snap to 0.5 steps
      const item = {
        id: 'sr_' + Date.now(),
        type: body.type || 'other',
        severity: body.severity || 'low',  // low | medium | high
        title: body.title || '',
        icon: body.icon || '📝',
        quantity,
        unit: body.unit || '',
        note: body.note || '',
        photo: body.photo || null,
        reportedAt: new Date().toISOString(),
        reportedBy: body.reportedBy || 'caregiver',
        acknowledged: false,
        acknowledgedAt: null,
        acknowledgedNote: '',
        processingStatus: null  // pending | in-progress | completed (set by admin ack)
      };
      list.unshift(item);
      if (list.length > 120) list.splice(120);
      await KV.put('selfreports:list', JSON.stringify(list));

      // Notify admin via push when caregiver submits a self-report
      try {
        const subRaw = await KV.get('push:subscription');
        if (subRaw) {
          const sub = JSON.parse(subRaw);
          const qtyStr = item.unit ? ` ×${item.quantity}${item.unit}` : (item.quantity > 1 ? ` ×${item.quantity}` : '');
          const noteStr = item.note ? ` — ${item.note}` : '';
          await sendWebPush(env, sub, {
            title: `${item.icon} 照顧者回報`,
            body: `${item.title}${qtyStr}${noteStr}`,
            tag: 'umicare-selfreport',
            icon: '/icon-192.png',
          });
        }
      } catch (_) { /* push failure is non-fatal */ }

      return json({ ok: true, item });
    }
    const selfReportAckMatch = path.match(/^\/selfreports\/(sr_\d+)\/ack$/);
    if (selfReportAckMatch && method === 'POST') {
      const id = selfReportAckMatch[1];
      const body = await request.json().catch(() => ({}));
      const raw = await KV.get('selfreports:list');
      const list = raw ? JSON.parse(raw) : [];
      const item = list.find((x) => x.id === id);
      if (!item) return json({ ok: false, error: 'Not found' }, 404);
      item.acknowledged = true;
      item.acknowledgedAt = new Date().toISOString();
      item.acknowledgedNote = body.note || '';
      item.processingStatus = body.processingStatus || 'pending';  // pending | in-progress | completed
      await KV.put('selfreports:list', JSON.stringify(list));
      return json({ ok: true, item });
    }

    const selfReportUnackMatch = path.match(/^\/selfreports\/(sr_\d+)\/unack$/);
    if (selfReportUnackMatch && method === 'POST') {
      const id = selfReportUnackMatch[1];
      const raw = await KV.get('selfreports:list');
      const list = raw ? JSON.parse(raw) : [];
      const item = list.find((x) => x.id === id);
      if (!item) return json({ ok: false, error: 'Not found' }, 404);
      item.acknowledged = false;
      item.acknowledgedAt = null;
      item.acknowledgedNote = '';
      item.processingStatus = null;
      await KV.put('selfreports:list', JSON.stringify(list));
      return json({ ok: true, item });
    }

    const selfReportDelMatch = path.match(/^\/selfreports\/(sr_\d+)$/);
    if (selfReportDelMatch && method === 'DELETE') {
      const id = selfReportDelMatch[1];
      const raw = await KV.get('selfreports:list');
      if (!raw) return json({ ok: true });
      const list = JSON.parse(raw).filter(x => x.id !== id);
      await KV.put('selfreports:list', JSON.stringify(list));
      return json({ ok: true });
    }

    // === Incident Reports ===
    // GET /api/incidents  (optional ?date=YYYY-MM-DD filter)
    if (path === '/incidents' && method === 'GET') {
      const raw = await KV.get('incidents:list');
      const list = raw ? JSON.parse(raw) : [];
      const dateFilter = url.searchParams.get('date');
      if (dateFilter) {
        const filtered = list.filter(inc =>
          getCalgaryDateStr(new Date(inc.reportedAt || Date.now())) === dateFilter
        );
        return json(filtered);
      }
      return json(list);
    }
    // POST /api/incidents — caregiver reports vomit/abnormal with optional photo
    if (path === '/incidents' && method === 'POST') {
      const body = await request.json();
      const raw = await KV.get('incidents:list');
      const list = raw ? JSON.parse(raw) : [];
      const incId = 'inc_' + Date.now();
      // Store photo separately in its own KV key (TTL 30 days) to keep list lean
      if (body.photo) {
        await KV.put('incident:photo:' + incId, body.photo, { expirationTtl: 30 * 86400 });
      }
      const incident = {
        id: incId,
        type: body.type || 'vomit',
        severity: body.severity || 'medium',  // low | medium | high | critical
        note: body.note || '',
        hasPhoto: !!body.photo,   // flag only — no base64 in list
        reportedAt: new Date().toISOString(),
        reportedBy: body.reportedBy || 'caregiver',
        resolved: false,
        resolvedAt: null,
        resolvedNote: '',
        resolutionTemplate: null  // used when admin uses a template
      };
      list.unshift(incident);
      if (list.length > 50) list.splice(50);
      await KV.put('incidents:list', JSON.stringify(list));

      // Notify admin via push when caregiver submits an incident report
      try {
        const subRaw = await KV.get('push:subscription');
        if (subRaw) {
          const sub = JSON.parse(subRaw);
          const typeLabels = { vomit:'🤢 嘔吐', no_eat:'🚫 拒食', lethargy:'😴 精神差', diarrhea:'💦 腹瀉', blood:'🩸 血跡', other:'❗ 其他異常' };
          const typeLabel = typeLabels[incident.type] || incident.type;
          const noteStr = incident.note ? ` — ${incident.note}` : '';
          const photoStr = incident.hasPhoto ? ' 📷' : '';
          await sendWebPush(env, sub, {
            title: `🆘 飼養員異常上報${photoStr}`,
            body: `${typeLabel}${noteStr}`,
            tag: 'umicare-incident',
            icon: '/icon-192.png',
          });
        }
      } catch (_) { /* push failure is non-fatal */ }

      return json({ ok: true, incident });
    }
    // GET /api/incidents/:id/photo
    const incPhotoMatch = path.match(/^\/incidents\/(inc_\d+)\/photo$/);
    if (incPhotoMatch && method === 'GET') {
      const photo = await KV.get('incident:photo:' + incPhotoMatch[1]);
      if (!photo) return json({ error: 'not found' }, 404);
      // If data URL (data:image/...;base64,...), serve as actual image
      const dataUrlMatch = photo.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        const mimeType = dataUrlMatch[1];
        const base64Data = dataUrlMatch[2];
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        return new Response(bytes, {
          status: 200,
          headers: { 'Content-Type': mimeType, ...CORS },
        });
      }
      return json({ photo });
    }
    // POST /api/incidents/:id/resolve
    const incResolveMatch = path.match(/^\/incidents\/(inc_\d+)\/resolve$/);
    if (incResolveMatch && method === 'POST') {
      const id = incResolveMatch[1];
      const body = await request.json().catch(() => ({}));
      const raw = await KV.get('incidents:list');
      if (!raw) return json({ error: 'not found' }, 404);
      const list = JSON.parse(raw);
      const item = list.find(x => x.id === id);
      if (!item) return json({ error: 'not found' }, 404);
      item.resolved = true;
      item.resolvedAt = new Date().toISOString();
      item.resolvedNote = body.note || '';
      item.resolutionTemplate = body.template || null;  // track which template was used
      await KV.put('incidents:list', JSON.stringify(list));
      return json({ ok: true, item });
    }
    // DELETE /api/incidents/:id
    const incDelMatch = path.match(/^\/incidents\/(inc_\d+)$/);
    if (incDelMatch && method === 'DELETE') {
      const id = incDelMatch[1];
      const raw = await KV.get('incidents:list');
      if (!raw) return json({ ok: true });
      const list = JSON.parse(raw).filter(x => x.id !== id);
      await KV.put('incidents:list', JSON.stringify(list));
      return json({ ok: true });
    }

    // Push API
    const pushResult = await handlePushApi(path, method, request, env);
    if (pushResult) return pushResult;

    return json({ error: 'Not found' }, 404);

  } catch (err) {
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}

const VAPID_PUBLIC_KEY = 'BFt4HKcvmSKh52zl8p7_Q1yLsyWxT_8WTSvNigtkTVXFkKGf5nWtkKKyAr_8yHYRImKoXDENU6Jd-leWTku9jMQ';
const VAPID_SUBJECT = 'mailto:west.wong@westech.com.hk';

// ─── Calgary DST helper (single source of truth) ──────────────────────────
function getCalgaryContext(now) {
  const year = now.getUTCFullYear();
  // DST starts 2nd Sunday of March at 09:00 UTC (= 02:00 MST)
  const dstStart = (() => {
    const d = new Date(Date.UTC(year, 2, 1));
    let sundays = 0;
    while (sundays < 2) { if (d.getUTCDay() === 0) sundays++; if (sundays < 2) d.setUTCDate(d.getUTCDate() + 1); }
    d.setUTCHours(9, 0, 0, 0); return d;
  })();
  // DST ends 1st Sunday of November at 08:00 UTC (= 02:00 MDT)
  const dstEnd = (() => {
    const d = new Date(Date.UTC(year, 10, 1));
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(8, 0, 0, 0); return d;
  })();
  const isDST = now >= dstStart && now < dstEnd;
  const offset = isDST ? -6 : -7;
  const calgaryNow = new Date(now.getTime() + offset * 3600000);
  return { isDST, offset, calgaryNow };
}

function getCalgaryDateStr(now) {
  const { calgaryNow } = getCalgaryContext(now);
  return [
    calgaryNow.getUTCFullYear(),
    String(calgaryNow.getUTCMonth() + 1).padStart(2, '0'),
    String(calgaryNow.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function getCalgaryWeekday(now) {
  const { calgaryNow } = getCalgaryContext(now);
  return calgaryNow.getUTCDay();
}

function isTaskActiveOnCalgaryDate(task, now) {
  if (!task) return false;
  const scheduleType = task.scheduleType || 'daily';
  const day = getCalgaryWeekday(now);
  const weekDays = Array.isArray(task.weekDays) ? task.weekDays : null;
  if (scheduleType === 'daily') return true;
  if (scheduleType === 'weekly') return weekDays && weekDays.length ? weekDays.includes(day) : true;
  if (scheduleType === 'weekdays') return day >= 1 && day <= 5;
  if (scheduleType === 'weekends') return day === 0 || day === 6;
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.VAPID_PUBLIC_KEY) env = { ...env, VAPID_PUBLIC_KEY: VAPID_PUBLIC_KEY };
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    // Serve static assets; force no-cache for HTML to prevent stale page issues
    const assetResp = await env.ASSETS.fetch(request);
    const ct = assetResp.headers.get('Content-Type') || '';
    if (ct.includes('text/html')) {
      const newHeaders = new Headers(assetResp.headers);
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      newHeaders.set('Pragma', 'no-cache');
      return new Response(assetResp.body, { status: assetResp.status, headers: newHeaders });
    }
    return assetResp;
  },

  // Cron trigger: runs every 30 min to send due-task notifications
  async scheduled(event, env, ctx) {
    const KV = env.UMICARE_DATA;
    const sRaw = await KV.get('settings');
    const lang = sRaw ? (JSON.parse(sRaw).language || 'zh') : 'zh';
    const pi = {
      zh: {
        title: (n) => `🐾 ${n} 照護提醒`,
        body1: (n) => `${n} 尚未完成，請盡快記錄！`,
        bodyN: (n, c) => `${n}，還有 ${c} 項任務尚未完成`,
        incident: (hasPhoto) => `🆘 飼養員異常上報${hasPhoto ? ' 📷' : ''}`,
        selfReport: '📝 照顧者回報',
      },
      en: {
        title: (n) => `🐾 ${n} Care Reminder`,
        body1: (n) => `${n} is not done yet, please log it!`,
        bodyN: (n, c) => `${n} and ${c} more tasks are overdue`,
        incident: (hasPhoto) => `🆘 Caregiver Incident Report${hasPhoto ? ' 📷' : ''}`,
        selfReport: '📝 Caregiver Report',
      },
    }[lang] || {};
    const raw = await KV.get('push:subscription');
    if (!raw) return; // no subscriber
    const sub = JSON.parse(raw);

    const now = new Date();
    const { isDST, calgaryNow } = getCalgaryContext(now);
    const calgaryHour = calgaryNow.getUTCHours();
    const calgaryMin  = calgaryNow.getUTCMinutes();
    const calgaryTotalMin = calgaryHour * 60 + calgaryMin;

    // KV date key uses Calgary local date (matches frontend todayStr)
    const today = getCalgaryDateStr(now);

    // Load tasks + today's checkins
    const tasksRaw = await KV.get('tasks:list');
    const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;
    const activeTasks = tasks.filter(task => isTaskActiveOnCalgaryDate(task, now));
    const checkinsRaw = await KV.get('checkins:' + today);
    const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
    const doneIds = new Set(checkins.filter(c => c.isDone).map(c => c.taskId));

    // Get cat name for push title
    const catRaw = await KV.get('cat:profile');
    const catName = catRaw ? (JSON.parse(catRaw).name || '屋咪') : '屋咪';

    // Find OVERDUE tasks: Calgary time has passed AND not done/skipped
    const overdue = [];
    for (const task of activeTasks) {
      if (doneIds.has(task.id)) continue;
      const times = task.scheduledTimes || [];
      for (const t of times) {
        const [th, tm] = t.split(':').map(Number);
        const taskMin = th * 60 + tm;
        if (calgaryTotalMin >= taskMin) {
          overdue.push(task);
          break;
        }
      }
    }

    if (overdue.length === 0) return; // nothing to remind

    // Repeat-notify every 30 min as long as tasks are overdue
    // Track last push time to avoid double-firing within same 30-min window
    const notifiedRaw = await KV.get('debug:notified_today');
    const notifiedData = notifiedRaw ? JSON.parse(notifiedRaw) : { date: '', lastPushMs: 0 };
    const lastPushMs = notifiedData.date === today ? (notifiedData.lastPushMs || 0) : 0;
    const nowMs = now.getTime();
    const minGapMs = 25 * 60 * 1000; // 25 min gap to allow for cron jitter
    if (nowMs - lastPushMs < minGapMs) return; // already pushed recently

    const firstName = overdue[0].name;
    const body = overdue.length === 1
      ? (pi.body1 ? pi.body1(firstName) : `${firstName} 尚未完成，請盡快記錄！`)
      : (pi.bodyN ? pi.bodyN(firstName, overdue.length - 1) : `${firstName}，還有 ${overdue.length - 1} 項任務尚未完成`);

    const result = await sendWebPush(env, sub, {
      title: pi.title ? pi.title(catName) : `🐾 ${catName} 照護提醒`,
      body,
      tag: 'umicare-reminder',
      icon: '/icon-192.png',
    });

    // Record push time (not task IDs) — allows repeat every 30 min
    await KV.put('debug:notified_today', JSON.stringify({ date: today, lastPushMs: nowMs }), { expirationTtl: 86400 });

    await KV.put('debug:last_push', JSON.stringify({
      time: new Date().toISOString(),
      calgaryTime: `${calgaryHour}:${String(calgaryMin).padStart(2,'0')}`,
      isDST,
      calgaryDate: today,
      result,
      overdue: overdue.length,
      firstTask: firstName,
    }), { expirationTtl: 86400 });
  },
};

// ─── WEB PUSH HELPERS ──────────────────────────────────────────

// VAPID key coordinates (derived from current public key)
const VAPID_KEY_X = 'W3gcpy-ZIqHnbOXynv9DXIuzJbFP_xZNK82KC2RNVcU';
const VAPID_KEY_Y = 'kKGf5nWtkKKyAr_8yHYRImKoXDENU6Jd-leWTku9jMQ';

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function fromB64url(s) {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const b = atob(p + '='.repeat((4 - p.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
function concat(...bufs) {
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.length; }
  return out;
}

async function hkdf(salt, ikm, info, len) {
  // Extract
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));
  // Expand
  const infoBytes = typeof info === 'string' ? new TextEncoder().encode(info) : info;
  const hmacKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, concat(infoBytes, new Uint8Array([1]))));
  return t.slice(0, len);
}

async function sendWebPush(env, subscription, payload) {
  const VAPID_PUBLIC  = env.VAPID_PUBLIC_KEY  || VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = env.VAPID_PRIVATE_KEY;
  const endpoint = subscription.endpoint;
  const p256dh   = subscription.keys.p256dh;
  const auth     = subscription.keys.auth;

  // ── 1. VAPID JWT ──────────────────────────────────────────────
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const enc = s => btoa(JSON.stringify(s)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const header = enc({ typ: 'JWT', alg: 'ES256' });
  const claims = enc({ aud: audience, exp: now + 43200, sub: env.VAPID_SUBJECT || VAPID_SUBJECT });
  const sigInput = header + '.' + claims;

  // Import private key as JWK (raw private key d + public key x,y)
  const privKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    d: VAPID_PRIVATE,
    x: VAPID_KEY_X,
    y: VAPID_KEY_Y,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(sigInput)
  );
  const jwt = sigInput + '.' + b64url(sigBytes);
  const vapidHeader = `vapid t=${jwt},k=${VAPID_PUBLIC}`;

  // ── 2. Payload encryption (RFC 8291 / RFC 8188 aes128gcm) ────
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Generate ephemeral sender ECDH key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  // Export sender public key as raw (uncompressed, 65 bytes)
  const senderPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeyPair.publicKey));

  // Import recipient (UA) public key
  const uaPubRaw = fromB64url(p256dh);
  const uaPubKey = await crypto.subtle.importKey('raw', uaPubRaw,
    { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPubKey }, senderKeyPair.privateKey, 256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  // auth secret
  const authSecret = fromB64url(auth);

  // IKM = HKDF(salt=authSecret, ikm=sharedSecret, info="WebPush: info\0"+uaPub+senderPub, len=32)
  const ikmInfo = concat(
    new TextEncoder().encode('WebPush: info\x00'),
    uaPubRaw,
    senderPubRaw
  );
  const ikm = await hkdf(authSecret, sharedSecret, ikmInfo, 32);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\x00');
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\x00');
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Plaintext: payload + \x02 (delimiter)
  const plaintext = concat(new TextEncoder().encode(JSON.stringify(payload)), new Uint8Array([0x02]));

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, plaintext
  ));

  // RFC 8188 header: salt(16) + rs(4, BE) + idlen(1) + sender_pub(65)
  const rs = 4096;
  const header8188 = new Uint8Array(21 + senderPubRaw.length);
  header8188.set(salt, 0);
  new DataView(header8188.buffer).setUint32(16, rs, false);
  header8188[20] = senderPubRaw.length;
  header8188.set(senderPubRaw, 21);

  const body = concat(header8188, ciphertext);

  // ── 3. Send ───────────────────────────────────────────────────
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidHeader,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });
  const respBody = await resp.text().catch(() => '');
  return { status: resp.status, body: respBody };
}

// ─── PUSH API ROUTES ──────────────────────────────────────────
async function handlePushApi(path, method, request, env) {
  const KV = env.UMICARE_DATA;

  // POST /api/push/subscribe — save subscription
  if (path === '/push/subscribe' && method === 'POST') {
    const sub = await request.json();
    await KV.put('push:subscription', JSON.stringify(sub));
    return json({ ok: true });
  }

  // DELETE /api/push/subscribe — remove subscription
  if (path === '/push/subscribe' && method === 'DELETE') {
    await KV.delete('push:subscription');
    return json({ ok: true });
  }

  // POST /api/push/test — send a test notification
  if (path === '/push/test' && method === 'POST') {
    const raw = await KV.get('push:subscription');
    if (!raw) return json({ error: 'No subscription found' }, 404);
    const sub = JSON.parse(raw);
    const { status, body: pushBody } = await sendWebPush(env, sub, { title: 'UmiCare 🐾 測試', body: '推送通知正常運作！' });
    if (status >= 200 && status < 300) return json({ ok: true, status });
    return json({ ok: false, status, error: pushBody }, 500);
  }

  // GET /api/calendar/day?date=YYYY-MM-DD — aggregate daily data for calendar view
  if (path === '/calendar/day' && method === 'GET') {
    const date = url.searchParams.get('date');
    if (!date) return json({ error: 'date parameter is required (format: YYYY-MM-DD)' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'invalid date format, expected YYYY-MM-DD' }, 400);
    try {
      const [checkinsRaw, incidentsRaw, selfreportsRaw, weightsRaw] = await Promise.all([
        KV.get(`checkins:${date}`),
        KV.get('incidents:list'),
        KV.get('selfreports:list'),
        KV.get('weights:list'),
      ]);
      const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
      const incidentsList = incidentsRaw ? JSON.parse(incidentsRaw) : [];
      const selfreportsList = selfreportsRaw ? JSON.parse(selfreportsRaw) : [];
      const weightsList = weightsRaw ? JSON.parse(weightsRaw) : [];
      const incidents = incidentsList.filter(inc => getCalgaryDateStr(new Date(inc.reportedAt || Date.now())) === date);
      const selfReports = selfreportsList.filter(sr => getCalgaryDateStr(new Date(sr.reportedAt || sr.createdAt || Date.now())) === date);
      const weights = weightsList.filter(w => getCalgaryDateStr(new Date(w.measuredAt)) === date);
      const done = checkins.filter(c => c.isDone).length;
      const skipped = checkins.filter(c => !c.isDone).length;
      return json({ date, checkins, summary: { done, skipped, total: checkins.length }, incidents, selfReports, weights });
    } catch (err) {
      return json({ error: 'Internal server error', details: err.message }, 500);
    }
  }

  // GET /api/push/debug — check last push result and subscription info
  if (path === '/push/debug' && method === 'GET') {
    const sub = await KV.get('push:subscription');
    const lastPush = await KV.get('debug:last_push');
    return json({
      hasSubscription: !!sub,
      endpoint: sub ? JSON.parse(sub).endpoint.substring(0,60) + '...' : null,
      lastPush: lastPush ? JSON.parse(lastPush) : null,
    });
  }

  // POST or GET /api/push/simulate — run scheduled logic as HTTP endpoint for debugging
  // Requires Authorization header with stored PIN hash for protection
  if (path === '/push/simulate' && (method === 'GET' || method === 'POST')) {
    const authHeader = request.headers.get('Authorization') || '';
    const storedPin = await KV.get('pin');
    if (!storedPin || authHeader !== `Bearer ${storedPin}`) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const raw = await KV.get('push:subscription');
    if (!raw) return json({ error: 'No subscription in KV' });
    const sub = JSON.parse(raw);

    const now = new Date();
    const { isDST, calgaryNow } = getCalgaryContext(now);
    const calgaryHour = calgaryNow.getUTCHours();
    const calgaryMin  = calgaryNow.getUTCMinutes();
    const calgaryTotalMin = calgaryHour * 60 + calgaryMin;
    // KV key uses Calgary local date (matches frontend todayStr)
    const today = getCalgaryDateStr(now);

    const catRaw = await KV.get('cat:profile');
    const catName = catRaw ? (JSON.parse(catRaw).name || '屋咪') : '屋咪';

    const tasksRaw = await KV.get('tasks:list');
    const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;
    const activeTasks = tasks.filter(task => isTaskActiveOnCalgaryDate(task, now));
    const checkinsRaw = await KV.get('checkins:' + today);
    const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
    const doneIds = new Set(checkins.filter(c => c.isDone).map(c => c.taskId));

    const overdue = [];
    for (const task of activeTasks) {
      if (doneIds.has(task.id)) continue;
      const times = task.scheduledTimes || [];
      for (const t of times) {
        const [th, tm] = t.split(':').map(Number);
        const taskMin = th * 60 + tm;
        if (calgaryTotalMin >= taskMin) { overdue.push({ id: task.id, name: task.name, time: t }); break; }
      }
    }

    let pushResult = null;
    if (overdue.length > 0) {
      const firstName = overdue[0].name;
      const body = overdue.length === 1 ? `${firstName} 尚未完成，請盡快記錄！` : `${firstName}，還有 ${overdue.length} 項任務尚未完成`;
      try {
        pushResult = await sendWebPush(env, sub, { title: `🐾 ${catName} 照護提醒 (simulate)`, body, tag: 'umicare-reminder', icon: '/icon-192.png' });
      } catch(e) { pushResult = { error: e.message }; }
    }

    return json({
      calgaryTime: `${calgaryHour}:${String(calgaryMin).padStart(2,'0')}`,
      isDST,
      calgaryDate: today,  // now Calgary local date
      catName,
      totalTasks: activeTasks.length,
      doneToday: checkins.length,
      overdueCount: overdue.length,
      overdueTasks: overdue,
      pushResult,
    });
  }

  return null;
}
