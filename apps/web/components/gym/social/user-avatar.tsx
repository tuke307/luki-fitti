'use client';

import React from 'react';
import { initialsFor, resolveApiAssetUrl } from '@/lib/social/avatar';
import { cn } from '@luki-fitti/ui/lib/utils';

interface UserAvatarProps {
  avatarUrl: string | null | undefined;
  name?: string | null;
  handle?: string | null;
  className?: string;
}

/** Avatar image with an initials-circle fallback, keyed off `avatarUpdatedAt` via `?v=`. */
export function UserAvatar({ avatarUrl, name, handle, className }: UserAvatarProps) {
  const src = resolveApiAssetUrl(avatarUrl);
  const initials = initialsFor(name, handle);
  return (
    <span
      className={cn(
        'bg-secondary text-muted-foreground relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[0.8125rem] font-semibold',
        className ?? 'size-10',
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <span aria-hidden="true">?</span>
      )}
    </span>
  );
}
