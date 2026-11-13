/**
 * Minimal typing for `web-push` (pinned 3.6.7 ships no types and @types/web-push
 * would be a second new dependency — see PR 1 spec).
 */
declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  export interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }
  export class WebPushError extends Error {
    statusCode: number;
    body: string;
    endpoint: string;
  }
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: { vapidDetails?: VapidDetails; TTL?: number },
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>;
}
