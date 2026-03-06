// UmiCare v3.1 – Cloudflare Worker with Static Assets
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

async function handleApi(request, env, url) {
  const KV = env.UMICARE_DATA;
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    // PING
    if (path === '/ping') return json({ ok: true, version: '3.1', kv: !!KV });

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

    // SETTINGS
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

    // CAT PROFILE
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

    // TASKS
    if (path === '/tasks') {
      if (method === 'GET') {
        const raw = await KV.get('tasks:list');
        if (!raw) {
          // First time: initialize KV with default tasks so cron can find them
          await KV.put('tasks:list', JSON.stringify(DEFAULT_TASKS));
          return json(DEFAULT_TASKS);
        }
        return json(JSON.parse(raw));
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
        await KV.put('weights:list', JSON.stringify(list));
        const sRaw = await KV.get('settings');
        const settings = sRaw ? JSON.parse(sRaw) : DEFAULT_SETTINGS;
        settings.lastPersonWeight = personWeight;
        await KV.put('settings', JSON.stringify(settings));
        return json({ ok: true, record });
      }
    }

    // PERIODIC
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

    // DASHBOARD SUMMARY
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

    // Push API
    const pushResult = await handlePushApi(path, method, request, env);
    if (pushResult) return pushResult;

    return json({ error: 'Not found' }, 404);

  } catch (err) {
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}

const VAPID_PUBLIC_KEY = 'BHgJpAFFHPBdA1QxgX4Wx5Bqa3j-Wcj1IWryX7MRxNf7Y-0sPlyDsymCwsiwwYjo7iS4TKpMG77Qv_CxbTXQofI';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.VAPID_PUBLIC_KEY) env = { ...env, VAPID_PUBLIC_KEY: VAPID_PUBLIC_KEY };
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },

  // Cron trigger: runs every 5 min to send due-task notifications (Calgary MST UTC-7)
  async scheduled(event, env, ctx) {
    const KV = env.UMICARE_DATA;
    const raw = await KV.get('push:subscription');
    if (!raw) return; // no subscriber
    const sub = JSON.parse(raw);

    // Calgary MST = UTC-7
    const now = new Date();
    const localNow = new Date(now.getTime() - 7 * 3600000);
    const hktHour = localNow.getUTCHours();
    const hktMin  = localNow.getUTCMinutes();
    const hktTotalMin = hktHour * 60 + hktMin;
    const today = localNow.toISOString().split('T')[0];

    // Load tasks + today's checkins
    const tasksRaw = await KV.get('tasks:list');
    const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;  // fallback to defaults if never customized
    const checkinsRaw = await KV.get('checkins:' + today);
    const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
    const doneIds = new Set(checkins.map(c => c.taskId));

    // Find OVERDUE tasks: scheduledTime has passed AND not done
    const overdue = [];
    for (const task of tasks) {
      if (doneIds.has(task.id)) continue;
      const times = task.scheduledTimes || [];
      for (const t of times) {
        const [th, tm] = t.split(':').map(Number);
        const taskMin = th * 60 + tm;
        if (hktTotalMin >= taskMin) { // past scheduled time
          overdue.push(task);
          break; // count task once even if multiple times
        }
      }
    }

    if (overdue.length === 0) return; // nothing to remind

    // Send ONE batched notification (24/7 - user in Calgary wants round-the-clock alerts)
    const firstName = overdue[0].name;
    const body = overdue.length === 1
      ? `${firstName} 未完成，快去記錄！`
      : `${firstName} 等 ${overdue.length} 項任務未完成`;

    const result = await sendWebPush(env, sub, {
      title: '🐾 喔咪照護提醒',
      body,
      tag: 'umicare-reminder',
      icon: '/icon-192.png',
    });
    // Store last push result in KV for debugging
    await KV.put('debug:last_push', JSON.stringify({
      time: new Date().toISOString(),
      hktTime: `${hktHour}:${String(hktMin).padStart(2,'0')}`,
      result,
      overdue: overdue.length,
      firstTask: firstName,
    }), { expirationTtl: 86400 });
  },
};

// ─── WEB PUSH HELPERS ──────────────────────────────────────────

// VAPID key coordinates (from public key BHgJpA...)
const VAPID_KEY_X = 'eAmkAUUc8F0DVDGBfhbHkGpreP5ZyPUhavJfsxHE1_s';
const VAPID_KEY_Y = 'Y-0sPlyDsymCwsiwwYjo7iS4TKpMG77Qv_CxbTXQofI';

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

async function hkdfExpand(prk, info, len) {
  const key = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info },
    key, len * 8
  ));
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
  const claims = enc({ aud: audience, exp: now + 43200, sub: 'mailto:admin@umi-care.app' });
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

  // GET /api/push/simulate — run scheduled logic as HTTP endpoint for debugging
  if (path === '/push/simulate' && method === 'GET') {
    const KV = env.UMICARE_DATA;
    const raw = await KV.get('push:subscription');
    if (!raw) return json({ error: 'No subscription in KV' });
    const sub = JSON.parse(raw);

    const now = new Date();
    const localNow = new Date(now.getTime() - 7 * 3600000);
    const hktHour = localNow.getUTCHours();
    const hktMin  = localNow.getUTCMinutes();
    const hktTotalMin = hktHour * 60 + hktMin;
    const today = localNow.toISOString().split('T')[0];

    const tasksRaw = await KV.get('tasks:list');
    const tasks = tasksRaw ? JSON.parse(tasksRaw) : DEFAULT_TASKS;  // fallback
    const checkinsRaw = await KV.get('checkins:' + today);
    const checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
    const doneIds = new Set(checkins.map(c => c.taskId));

    const overdue = [];
    for (const task of tasks) {
      if (doneIds.has(task.id)) continue;
      const times = task.scheduledTimes || [];
      for (const t of times) {
        const [th, tm] = t.split(':').map(Number);
        const taskMin = th * 60 + tm;
        if (hktTotalMin >= taskMin) { overdue.push({ id: task.id, name: task.name, time: t }); break; }
      }
    }

    let pushResult = null;
    if (overdue.length > 0) {
      const firstName = overdue[0].name;
      const body = overdue.length === 1 ? `${firstName} 未完成，快去記錄！` : `${firstName} 等 ${overdue.length} 項任務未完成`;
      try {
        pushResult = await sendWebPush(env, sub, { title: '🐾 喔咪照護提醒 (simulate)', body, tag: 'umicare-reminder', icon: '/icon-192.png' });
      } catch(e) { pushResult = { error: e.message }; }
    }

    return json({
      hktTime: `${hktHour}:${String(hktMin).padStart(2,'0')}`,
      today,
      totalTasks: tasks.length,
      doneToday: checkins.length,
      overdueCount: overdue.length,
      overdueTasks: overdue,
      pushResult,
    });
  }

  return null;
}

