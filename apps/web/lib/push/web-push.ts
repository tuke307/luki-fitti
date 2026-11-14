/**
 * Web Push subscription plumbing. The subscription endpoint lives in
 * localStorage so logout can unregister this device without an active
 * PushManager subscription (e.g. after the SW re-registered).
 */
import { pushApi } from '@/lib/social/social-api';
import type { PushConfigDto } from '@luki-fitti/common/schemas';

const ENDPOINT_STORAGE_KEY = 'luki.webpush.endpoint';

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iOS only exposes PushManager inside an installed (standalone) PWA. */
export function isIosStandaloneRequired(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

export async function fetchPushConfig(): Promise<PushConfigDto | null> {
  try {
    const res = await pushApi.config();
    return res.data ?? null;
  } catch {
    return null;
  }
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Subscribes this device (asks for notification permission first) and registers
 * the endpoint with the API. Returns true when the device is registered.
 */
export async function enablePushOnThisDevice(publicKey: string): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const key = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  const res = await pushApi.registerDevice({
    platform: 'WEBPUSH',
    token: subscription.endpoint,
    p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : undefined,
    auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : undefined,
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (!res.success) return false;
  localStorage.setItem(ENDPOINT_STORAGE_KEY, subscription.endpoint);
  return true;
}

export function thisDeviceEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Unregisters this device's endpoint (logout path). Best-effort. */
export async function disablePushOnThisDevice(): Promise<void> {
  const endpoint = thisDeviceEndpoint();
  try {
    if (endpoint) await pushApi.deleteDevice(endpoint);
  } catch {
    // The account is gone anyway; losing the device row is harmless.
  } finally {
    try {
      localStorage.removeItem(ENDPOINT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
