'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Sparkles, X } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import type { MealType } from '@luki-fitti/common/enums';
import {
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MAX_COUNT,
  type MealEntryDto,
} from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { aiErrorMessage } from '@/lib/ai/ai-errors';
import { prepareImageForUpload } from '@/lib/images/prepare-image';
import { newClientId } from '@/lib/nutrition/nutrition-day';
import { useLocale } from '@/providers/i18n/locale-context';

interface PickedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface MealPhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayKey: string;
  mealType?: MealType;
  isOnline: boolean;
  /** Called with the saved entry; the caller opens the editor for review. */
  onAnalyzed: (entry: MealEntryDto) => void;
}

export function MealPhotoDialog({ open, onOpenChange, ...props }: MealPhotoDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {/* Mounted only while open: closing discards picked photos and the hint. */}
      {open && (
        <MealPhotoBody {...props} onBusyChange={setBusy} onClose={() => onOpenChange(false)} />
      )}
    </Dialog>
  );
}

function MealPhotoBody({
  dayKey,
  mealType,
  isOnline,
  onAnalyzed,
  onBusyChange,
  onClose,
}: Omit<MealPhotoDialogProps, 'open' | 'onOpenChange'> & {
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { t, format } = useLocale();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusyState] = useState(false);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  // Object URLs created for previews; all are freed when the dialog closes.
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusyChange(value);
  };

  const trackUrl = (url: string) => {
    objectUrls.current.add(url);
    return url;
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const incoming = Array.from(files);
    if (photos.length + incoming.length > MEAL_PHOTO_MAX_COUNT) {
      setError(format(t.mealAi.tooMany, { count: MEAL_PHOTO_MAX_COUNT }));
    }
    const accepted = incoming
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, MEAL_PHOTO_MAX_COUNT - photos.length))
      .map((file) => ({
        id: `${file.name}-${file.size}-${Math.random()}`,
        file,
        previewUrl: trackUrl(URL.createObjectURL(file)),
      }));
    if (accepted.length < incoming.length && incoming.some((f) => !f.type.startsWith('image/'))) {
      setError(t.mealAi.unsupported);
    }
    setPhotos((list) => [...list, ...accepted]);
  };

  const analyze = async () => {
    if (!isOnline) {
      setError(t.mealAi.offline);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blobs = await Promise.all(photos.map((p) => prepareImageForUpload(p.file)));
      if (blobs.some((b) => b.size > MEAL_PHOTO_MAX_BYTES)) {
        setError(format(t.mealAi.tooLarge, { mb: Math.round(MEAL_PHOTO_MAX_BYTES / 1024 / 1024) }));
        return;
      }
      const form = new FormData();
      blobs.forEach((blob, i) => form.append('photos', blob, `meal-${i + 1}.jpg`));
      const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
      const now = new Date();
      form.append('clientEntryId', newClientId());
      form.append('eatenAt', new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString());
      if (mealType) form.append('mealType', mealType);
      if (hint.trim()) form.append('hint', hint.trim());

      const res = await api.ai.analyzeMeal(form);
      if (!res.data) throw new Error('empty');
      if (!res.data.analysis.containsFood) toast.info(t.mealAi.noFood);
      if (!res.data.photosStored) toast.info(t.mealAi.photosNotKept);
      onAnalyzed(res.data.entry);
      onClose();
    } catch (err) {
      setError(aiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader className="text-left">
        <DialogTitle>{t.mealAi.title}</DialogTitle>
        <DialogDescription>
          {format(t.mealAi.sub, { count: MEAL_PHOTO_MAX_COUNT })}
        </DialogDescription>
      </DialogHeader>

      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p, i) => (
            <li key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img
                src={p.previewUrl}
                alt=""
                className="aspect-square w-full rounded-xl object-cover"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={format(t.mealAi.removePhoto, { n: i + 1 })}
                onClick={() => {
                  URL.revokeObjectURL(p.previewUrl);
                  objectUrls.current.delete(p.previewUrl);
                  setPhotos((list) => list.filter((x) => x.id !== p.id));
                }}
                className="bg-background/90 absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || photos.length >= MEAL_PHOTO_MAX_COUNT}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera className="h-4 w-4" /> {t.mealAi.takePhoto}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || photos.length >= MEAL_PHOTO_MAX_COUNT}
          onClick={() => galleryInput.current?.click()}
        >
          <ImagePlus className="h-4 w-4" /> {t.mealAi.addPhotos}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meal-hint" className="text-[0.8125rem] font-semibold">
          {t.mealAi.hintLabel}
        </Label>
        <Textarea
          id="meal-hint"
          value={hint}
          maxLength={500}
          rows={2}
          disabled={busy}
          onChange={(e) => setHint(e.target.value)}
          placeholder={t.mealAi.hintPlaceholder}
        />
      </div>

      {error && (
        <p className="text-destructive text-[0.875rem]" role="alert">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button
          type="button"
          onClick={() => void analyze()}
          disabled={busy || photos.length === 0}
          className="w-full sm:w-auto"
        >
          {busy ? (
            <>
              <Spinner /> {t.mealAi.analyzing}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> {t.mealAi.analyze}
            </>
          )}
        </Button>
      </DialogFooter>
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? t.mealAi.analyzing : ''}
      </span>
    </DialogContent>
  );
}
