// Push notification subscription helper

const VAPID_PUBLIC_KEY = 'BFt4HKcvmSKh52zl8p7_Q1yLsyWxT_8WTSvNigtkTVXFkKGf5nWtkKKyAr_8yHYRImKoXDENU6Jd-leWTku9jMQ';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    // Always unsubscribe existing subscription first to force re-subscribe with current VAPID key
    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) await existingSub.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Save to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });

    return true;
  } catch (e) {
    console.error('Push subscribe failed:', e);
    return false;
  }
}

export async function unsubscribePush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    // Remove from server
    await fetch('/api/push/subscribe', { method: 'DELETE' });
    return true;
  } catch (e) {
    console.error('Push unsubscribe failed:', e);
    return false;
  }
}

export async function isSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch { return false; }
}

// Listen for push-received BroadcastChannel messages to play sound
export function listenPushSound() {
  try {
    const bc = new BroadcastChannel('push-notify');
    bc.onmessage = () => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch { /* audio not available */ }
    };
  } catch { /* BroadcastChannel not supported */ }
}
