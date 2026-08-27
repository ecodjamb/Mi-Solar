import webpush from 'web-push';
import { deletePushSubscription, listPushSubscriptions, listPushSubscriptionsForUser, markPushFailure, markPushSuccess, recordNotificationEvent } from './automationStore.js';
import { privateFamilyPushClaim } from './privateRpc.js';

function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails('mailto:codjambassis@gmail.com', publicKey, privateKey);
    return true;
  } catch {
    return false;
  }
}

export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  return { configured: Boolean(publicKey && privateKey), valid: /^[A-Za-z0-9_-]{80,100}$/.test(publicKey) && /^[A-Za-z0-9_-]{40,60}$/.test(privateKey) };
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

async function deliverPush(subscriptions, title, body, data = {}) {
  if (!configure()) return { sent: 0, failed: 0, configured: false };
  let sent = 0;
  let failed = 0;
  let lastError = null;
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }, JSON.stringify({ title, body, data, icon: '/misolar-arrayan-animated-192.png?v=6' }), { TTL: 3600 });
      await markPushSuccess(row.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      const status = Number(error?.statusCode || 0);
      lastError = { status, message: error instanceof Error ? error.message : 'Error de entrega desconocido' };
      if (status === 404 || status === 410) await deletePushSubscription(row.id);
      else await markPushFailure(row.id, Number(row.failure_count || 0) + 1);
    }
  }
  return { sent, failed, configured: true, lastError };
}

export async function sendAutomationPush(siteId, title, body, data = {}) {
  return await deliverPush(await listPushSubscriptions(siteId), title, body, data);
}

export async function sendFamilyPushThrottled(userId, category, title, body, data = {}) {
  const subscriptions = await listPushSubscriptionsForUser(userId);
  if (!subscriptions.length) return { sent: 0, failed: 0, configured: configure(), subscribed: false };
  const claimed = await privateFamilyPushClaim(userId, category, 300);
  if (!claimed) return { sent: 0, failed: 0, configured: configure(), subscribed: true, throttled: true };
  return { ...(await deliverPush(subscriptions, title, body, data)), subscribed: true, throttled: false };
}

export async function sendSiteNotification(siteId, type, title, body, data = {}, dedupeKey = null) {
  const result = await sendAutomationPush(siteId, title, body, { ...data, type });
  await recordNotificationEvent(siteId, {
    type,
    title,
    body,
    dedupeKey,
    delivered: result.sent,
    failed: result.failed
  }).catch((error) => console.error('[push] audit failed', error instanceof Error ? error.message : String(error)));
  return result;
}
