import { notificationAPI } from './api';

// ─── URL-safe base64 → Uint8Array ─────────────────────────────────────────────
// VAPID public keys from web-push are URL-safe base64 (RFC 4648 §5).
// pushManager.subscribe() requires a Uint8Array of exactly 65 bytes (uncompressed P-256 key).
function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Invalid VAPID key: must be a non-empty string');
  }

  // Strip any accidental whitespace
  const clean = base64String.trim();

  // Add padding back (URL-safe base64 omits it)
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  // Convert URL-safe chars to standard base64
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');

  let rawData;
  try {
    rawData = window.atob(base64);
  } catch {
    throw new Error(`Invalid VAPID key: cannot base64-decode "${clean.slice(0, 20)}…"`);
  }

  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    arr[i] = rawData.charCodeAt(i);
  }

  // A valid uncompressed P-256 public key is always 65 bytes
  if (arr.length !== 65) {
    throw new Error(
      `Invalid VAPID key: decoded to ${arr.length} bytes, expected 65. ` +
      'Make sure VAPID_PUBLIC_KEY was generated with: npx web-push generate-vapid-keys'
    );
  }

  return arr;
}

// ─── Service worker registration ──────────────────────────────────────────────
async function getOrRegisterSW() {
  // Check the file is really there and is JavaScript (not an HTML fallback)
  try {
    const probe = await fetch('/sw.js');
    const ct = probe.headers.get('content-type') || '';
    if (!probe.ok || ct.startsWith('text/html')) {
      console.error(
        '[PayTrack] /sw.js is missing or Vite is returning index.html.\n' +
        'Fix: create frontend/public/sw.js (see SETUP_INSTRUCTIONS.md)'
      );
      return null;
    }
  } catch {
    return null;
  }

  // Re-use existing registration if already active
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

// ─── Main setup ───────────────────────────────────────────────────────────────
export async function setupPushNotifications() {
  // Feature detection
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[PayTrack] Push not supported in this browser');
    return;
  }

  // Don't re-prompt if user already denied
  if (Notification.permission === 'denied') return;

  try {
    // 1. Get VAPID public key from backend
    let vapidPublicKey;
    try {
      const { data } = await notificationAPI.getVapidKey();
      vapidPublicKey = data.data?.vapidPublicKey;
    } catch (err) {
      // 503 = VAPID not configured on server. Push is optional — skip silently.
      if (err.response?.status === 503) return;
      throw err;
    }

    if (!vapidPublicKey) {
      console.warn('[PayTrack] Server returned empty VAPID key — push disabled');
      return;
    }

    // 2. Convert key early to catch format errors before involving the browser push service
    let applicationServerKey;
    try {
      applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    } catch (err) {
      console.error('[PayTrack] VAPID key format error:', err.message);
      console.error(
        '[PayTrack] Your VAPID_PUBLIC_KEY is malformed.\n' +
        'Generate new keys: npx web-push generate-vapid-keys\n' +
        'Then update your backend .env file.'
      );
      return;
    }

    // 3. Register service worker
    const reg = await getOrRegisterSW();
    if (!reg) return;

    // 4. Check for existing subscription — re-sync with backend, don't re-subscribe
    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) {
      try {
        await notificationAPI.subscribe(existingSub.toJSON());
      } catch (_) {
        // Backend sync failure is non-fatal
      }
      return;
    }

    // 5. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[PayTrack] Notification permission denied by user');
      return;
    }

    // 6. Subscribe — this is where "push service error" happens if VAPID key is wrong
    let subscription;
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (err) {
      // Provide actionable error messages for the most common failures
      if (err.message?.includes('push service error') || err.name === 'AbortError') {
        console.error(
          '[PayTrack] Push subscription failed — most likely cause: wrong VAPID keys.\n' +
          'Steps to fix:\n' +
          '  1. Run: npx web-push generate-vapid-keys\n' +
          '  2. Copy the output into your backend .env:\n' +
          '     VAPID_PUBLIC_KEY=<publicKey>\n' +
          '     VAPID_PRIVATE_KEY=<privateKey>\n' +
          '     VAPID_SUBJECT=mailto:you@example.com\n' +
          '  3. Restart your backend server\n' +
          '  4. Clear browser site data (Application → Clear site data) and reload'
        );
      } else {
        console.warn('[PayTrack] Push subscribe error:', err.message);
      }
      return;
    }

    // 7. Send subscription to backend
    await notificationAPI.subscribe(subscription);
    console.log('[PayTrack] ✓ Push notifications enabled');

  } catch (err) {
    // Catch-all — push is non-fatal
    console.warn('[PayTrack] Push setup failed:', err.message);
  }
}

// ─── Teardown on logout ───────────────────────────────────────────────────────
export async function teardownPushNotifications() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try { await notificationAPI.unsubscribe(sub.endpoint); } catch (_) {}
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[PayTrack] Push teardown failed:', err.message);
  }
}
