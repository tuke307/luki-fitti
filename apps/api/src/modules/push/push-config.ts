import {
  APNS_BUNDLE_ID,
  APNS_KEY_ID,
  APNS_KEY_P8_BASE64,
  APNS_TEAM_ID,
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
} from '../../config/env.config';

/** Both channels are optional; each is only "configured" when all its vars exist. */
export function apnsConfigured(): boolean {
  return Boolean(APNS_KEY_P8_BASE64 && APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID);
}

export function webPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
