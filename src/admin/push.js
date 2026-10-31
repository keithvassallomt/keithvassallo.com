// Web Push for the admin: registering this browser for the notifications the notifier sends
// when a job ends. The service worker is public/admin-sw.js, scoped to /admin. The admin
// registers it on every visit too, since it also keeps the app's files for opening offline.
import { api } from './api.js';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** A name for this device, for the list in Settings. */
function deviceLabel() {
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'A browser';
  const system = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS X/.test(agent) ? 'macOS' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : 'a device';
  return `${browser} on ${system}`;
}

export async function registration() {
  return navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' });
}

/** This browser's current subscription, if it has one. */
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration('/admin');
  return existing ? existing.pushManager.getSubscription() : null;
}

/** Asks to show notifications, subscribes this browser and registers it with the admin. */
export async function enablePush(vapidPublicKey) {
  if (!pushSupported()) throw new Error('This browser can’t show notifications from the admin. On an iPhone, add the admin to your home screen first.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for keithvassallo.com. Allow them in the browser’s site settings, then try again.');
  const worker = await registration();
  const subscription = (await worker.pushManager.getSubscription()) ?? (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
  return api('/push', { method: 'POST', body: { subscription: subscription.toJSON(), label: deviceLabel() } });
}
