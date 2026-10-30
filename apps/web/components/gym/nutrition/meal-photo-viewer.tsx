'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Trash2, X } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { useLocale } from '@/providers/i18n/locale-context';
import { ConfirmDestructiveDialog } from '../confirm-destructive-dialog';

export interface ViewerPhoto {
  key: string;
  src: string;
  /** Server photo id; only saved photos can be deleted. */
  serverId?: string;
}

interface MealPhotoViewerProps {
  photos: ViewerPhoto[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** VoiceOver/screen reader context, e.g. "Lunch" and "12:40". */
  mealLabel: string;
  timeLabel: string;
  onDelete?: (serverId: string) => Promise<void>;
}

/** Full-screen photo viewer: arrow keys page, Esc closes, saved photos can be deleted. */
export function MealPhotoViewer({
  photos,
  index,
  onIndexChange,
  mealLabel,
  timeLabel,
  onDelete,
}: MealPhotoViewerProps) {
  const { t, format } = useLocale();
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const open = index !== null && photos.length > 0;
  const current = open ? photos[Math.min(index, photos.length - 1)] : undefined;
  const position = open ? Math.min(index, photos.length - 1) : 0;

  const go = useCallback(
    (delta: number) => {
      if (index === null || photos.length < 2) return;
      onIndexChange((index + delta + photos.length) % photos.length);
    },
    [index, onIndexChange, photos.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, open]);

  const label = format(t.mealAi.photoPosition, {
    n: position + 1,
    total: photos.length,
    meal: mealLabel,
    time: timeLabel,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 text-white max-sm:inset-0 max-sm:max-h-dvh max-sm:rounded-none max-sm:p-0 max-sm:pb-[env(safe-area-inset-bottom,0px)] sm:inset-0 sm:max-h-dvh sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0 [&>button:last-child]:hidden"
        data-testid="meal-photo-viewer"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{t.nutrition.photos}</DialogDescription>
        <div className="flex items-center justify-between gap-2 p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15"
            aria-label={t.mealAi.closeViewer}
            onClick={() => onIndexChange(null)}
          >
            <X className="h-5 w-5" />
          </Button>
          <p className="text-[0.9375rem] tabular-nums" aria-hidden="true">
            {position + 1} / {photos.length}
          </p>
          {current?.serverId && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/15"
              aria-label={t.mealAi.deletePhoto}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          ) : (
            <span className="size-11" aria-hidden="true" />
          )}
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {current &&
            (failed.has(current.key) ? (
              <p className="flex flex-col items-center gap-2 text-[0.9375rem] text-white/80">
                <ImageOff className="h-8 w-8" aria-hidden="true" /> {t.mealAi.photoUnavailable}
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin API image or local blob
              <img
                key={current.key}
                src={current.src}
                alt={label}
                onError={() => setFailed((s) => new Set(s).add(current.key))}
                className="max-h-full max-w-full object-contain"
              />
            ))}
          {photos.length > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-2 bg-black/40 text-white hover:bg-white/15"
                aria-label={t.mealAi.previousPhoto}
                onClick={() => go(-1)}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 bg-black/40 text-white hover:bg-white/15"
                aria-label={t.mealAi.nextPhoto}
                onClick={() => go(1)}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}
        </div>
        {onDelete && current?.serverId && (
          <ConfirmDestructiveDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t.mealAi.deletePhoto}
            description={t.mealAi.deletePhotoConfirm}
            confirmLabel={t.mealAi.deletePhoto}
            onConfirm={async () => {
              const id = current.serverId;
              if (!id) return;
              await onDelete(id);
              if (photos.length <= 1) onIndexChange(null);
              else onIndexChange(Math.min(position, photos.length - 2));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
