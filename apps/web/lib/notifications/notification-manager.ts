'use client';

import { toast } from '@luki-fitti/ui/components/ui/sonner';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermissionStatus(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestWorkoutNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function playGymBellChime(): void {
  if (typeof window === 'undefined') return;

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 80, 250]);
    }
  } catch {
    // Ignore vibration errors on unsupported devices
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    // Crisp two-chime gym rest-done bell (A5 -> E6)
    playTone(880, 0, 0.22, 0.22);
    playTone(1318.5, 0.16, 0.38, 0.26);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 800);
  } catch {
    // AudioContext blocked or unavailable
  }
}

export async function triggerWorkoutNotification(options: {
  title: string;
  body: string;
  tag?: string;
  playSound?: boolean;
  showToast?: boolean;
}): Promise<boolean> {
  const { title, body, tag = 'luki-fitti-workout', playSound = true, showToast = true } = options;

  if (playSound) {
    playGymBellChime();
  }

  if (showToast) {
    toast.success(title, {
      description: body,
      duration: 4500,
    });
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      // Ignore permission prompt error
    }
  }

  if (permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          tag,
          icon: '/icon-192.svg',
          badge: '/icon-192.svg',
        });
        return true;
      }
    }
  } catch {
    // Fallback to window Notification below
  }

  try {
    new Notification(title, {
      body,
      tag,
      icon: '/icon-192.svg',
    });
    return true;
  } catch {
    return false;
  }
}
