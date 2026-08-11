import webpush from 'web-push';
import { deletePushSubscription, listPushSubscriptions, markPushFailure, markPushSuccess } from './automationStore.js';

function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails('mailto:codjambassis@gmail.com', publicKey, privateKey);
  return true;
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

export async function sendAutomationPush(siteId, title, body, data = {}) {
  if (!configure()) return { sent: 0, failed: 0, configured: false };
  const subscriptions = await listPushSubscriptions(siteId);
  let sent = 0;
  let failed = 0;
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }, JSON.stringify({ title, body, data, icon: '/scenes/home-day.webp' }), { TTL: 3600 });
      await markPushSuccess(row.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) await deletePushSubscription(row.id);
      else await markPushFailure(row.id, Number(row.failure_count || 0) + 1);
    }
  }
  return { sent, failed, configured: true };
}
