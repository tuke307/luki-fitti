'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Sparkles, X } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import type { MealType } from '@luki-fitti/common/enums';
import {
  MEAL_DESCRIPTION_MAX_LENGTH,
  MEAL_DESCRIPTION_MIN_LENGTH,
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MAX_COUNT,
  type MealAnalysisResponseDto,
  type MealPhotoDto,
  type MealTextAnalysisResponseDto,
} from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { aiErrorMessage } from '@/lib/ai/ai-errors';
import { prepareImageForUpload } from '@/lib/images/prepare-image';
import { useLocale } from '@/providers/i18n/locale-context';
import { AiCostLabel } from '@/components/gym/ai-usage/ai-cost-label';
import { MealPhotoViewer, type ViewerPhoto } from './meal-photo-viewer';

interface PickedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface MealPhotoSectionProps {
  savedPhotos: MealPhotoDto[];
  isOnline: boolean;
  /** Request context so photos and AI items attach to the meal being edited. */
  request: () => { clientEntryId: string; eatenAt: string; mealType: MealType };
  mealLabel: string;
  timeLabel: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onAnalyzed: (response: MealAnalysisResponseDto) => void;
  /** Foods proposed from the description alone (no photos); nothing is saved yet. */
  onProposed: (response: MealTextAnalysisResponseDto) => void;
  onDeleteSaved: (photoId: string) => Promise<void>;
}

/** Photo strip, meal description and AI estimate inside the meal editor. */
export function MealPhotoSection({
  savedPhotos,
  isOnline,
  request,
  mealLabel,
  timeLabel,
  busy,
  onBusyChange,
  onAnalyzed,
  onProposed,
  onDeleteSaved,
}: MealPhotoSectionProps) {
  const { t, format } = useLocale();
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<MealAnalysisResponseDto['usage'] | null>(null);
  const [uncertaintyNote, setUncertaintyNote] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const viewerPhotos: ViewerPhoto[] = [
    ...savedPhotos.flatMap((p) => (p.url ? [{ key: p.id, src: p.url, serverId: p.id }] : [])),
    ...picked.map((p) => ({ key: p.id, src: p.previewUrl })),
  ];
  const savedCount = viewerPhotos.length - picked.length;
  const full = picked.length >= MEAL_PHOTO_MAX_COUNT;
  const disabled = busy || !isOnline;
  const textOnly = picked.length === 0;
  const description = hint.trim();

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const incoming = Array.from(files);
    if (picked.length + incoming.length > MEAL_PHOTO_MAX_COUNT) {
      setError(format(t.mealAi.tooMany, { count: MEAL_PHOTO_MAX_COUNT }));
    }
    if (incoming.some((f) => !f.type.startsWith('image/'))) setError(t.mealAi.unsupported);
    const accepted = incoming
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, MEAL_PHOTO_MAX_COUNT - picked.length))
      .map((file) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrls.current.add(previewUrl);
        return { id: `${file.name}-${file.size}-${Math.random()}`, file, previewUrl };
      });
    setPicked((list) => [...list, ...accepted]);
  };

  const removePicked = (photo: PickedPhoto) => {
    URL.revokeObjectURL(photo.previewUrl);
    objectUrls.current.delete(photo.previewUrl);
    setPicked((list) => list.filter((x) => x.id !== photo.id));
  };

  const describe = async () => {
    if (description.length < MEAL_DESCRIPTION_MIN_LENGTH) {
      setError(t.mealAi.describeTooShort);
      return;
    }
    const res = await api.ai.describeMeal({ description, mealType: request().mealType });
    if (!res.data) throw new Error('empty');
    if (!res.data.analysis.containsFood) toast.info(t.mealAi.noFoodText);
    setHint('');
    setLastUsage(res.data.usage ?? null);
    setUncertaintyNote(res.data.items.length ? res.data.analysis.uncertaintyNote || null : null);
    onProposed(res.data);
  };

  const analyze = async () => {
    if (!isOnline) {
      setError(t.mealAi.offline);
      return;
    }
    onBusyChange(true);
    setError(null);
    try {
      if (textOnly) {
        await describe();
        return;
      }
      const blobs = await Promise.all(picked.map((p) => prepareImageForUpload(p.file)));
      if (blobs.some((b) => b.size > MEAL_PHOTO_MAX_BYTES)) {
        setError(format(t.mealAi.tooLarge, { mb: Math.round(MEAL_PHOTO_MAX_BYTES / 1024 / 1024) }));
        return;
      }
      const ctx = request();
      const form = new FormData();
      blobs.forEach((blob, i) => form.append('photos', blob, `meal-${i + 1}.jpg`));
      form.append('clientEntryId', ctx.clientEntryId);
      form.append('eatenAt', ctx.eatenAt);
      form.append('mealType', ctx.mealType);
      if (hint.trim()) form.append('hint', hint.trim());

      const res = await api.ai.analyzeMeal(form);
      if (!res.data) throw new Error('empty');
      if (!res.data.analysis.containsFood) toast.info(t.mealAi.noFood);
      if (!res.data.photosStored) toast.info(t.mealAi.photosNotKept);
      picked.forEach((p) => {
        URL.revokeObjectURL(p.previewUrl);
        objectUrls.current.delete(p.previewUrl);
      });
      setPicked([]);
      setHint('');
      setLastUsage(res.data.usage ?? null);
      setUncertaintyNote(null);
      onAnalyzed(res.data);
    } catch (err) {
      setError(aiErrorMessage(err, t));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <section aria-labelledby="meal-photos" className="space-y-3" data-testid="meal-photo-section">
      <h3 id="meal-photos" className="text-[0.8125rem] font-semibold">
        {t.mealAi.sectionTitle}
      </h3>
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

      {viewerPhotos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pt-2 pb-1">
          {viewerPhotos.map((photo, i) => {
            const local = picked.find((p) => p.id === photo.key);
            return (
              <li key={photo.key} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setViewerIndex(i)}
                  aria-label={format(t.mealAi.photoPosition, {
                    n: i + 1,
                    total: viewerPhotos.length,
                    meal: mealLabel,
                    time: timeLabel,
                  })}
                  className="bg-secondary block size-20 overflow-hidden rounded-xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image or local blob */}
                  <img src={photo.src} alt="" className="size-full object-cover" />
                </button>
                {local && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={format(t.mealAi.removePhoto, { n: i + 1 })}
                    onClick={() => removePicked(local)}
                    className="bg-background/90 absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full shadow"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || full}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera className="h-4 w-4" /> {t.mealAi.takePhoto}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || full}
          onClick={() => galleryInput.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />{' '}
          {savedCount > 0 ? t.mealAi.addPhoto : t.mealAi.choosePhotos}
        </Button>
      </div>

      {!isOnline && <p className="text-muted-foreground text-[0.8125rem]">{t.mealAi.offline}</p>}
      {isOnline && savedCount > 0 && (
        <p className="text-muted-foreground text-[0.8125rem]">{t.mealAi.reestimateHint}</p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="meal-hint" className="text-[0.8125rem] font-semibold">
          {textOnly ? t.mealAi.describeLabel : t.mealAi.hintLabel}
        </Label>
        <Textarea
          id="meal-hint"
          value={hint}
          maxLength={MEAL_DESCRIPTION_MAX_LENGTH}
          rows={2}
          disabled={disabled}
          onChange={(e) => setHint(e.target.value)}
          placeholder={textOnly ? t.mealAi.describePlaceholder : t.mealAi.hintPlaceholder}
          aria-describedby={textOnly ? 'meal-hint-help' : undefined}
        />
        {textOnly && (
          <p id="meal-hint-help" className="text-muted-foreground text-[0.8125rem]">
            {t.mealAi.describeHelp}
          </p>
        )}
      </div>

      {(!textOnly || description.length > 0) && (
        <Button
          type="button"
          onClick={() => void analyze()}
          disabled={disabled || (textOnly && description.length < MEAL_DESCRIPTION_MIN_LENGTH)}
          className="w-full sm:w-auto"
        >
          {busy ? (
            <>
              <Spinner /> {t.mealAi.analyzing}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> {t.mealAi.estimate}
            </>
          )}
        </Button>
      )}

      {uncertaintyNote && (
        <p className="text-muted-foreground text-[0.8125rem]">{uncertaintyNote}</p>
      )}
      {lastUsage && <AiCostLabel usage={lastUsage} />}

      {error && (
        <p className="text-destructive text-[0.875rem]" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? t.mealAi.analyzing : ''}
      </span>

      <MealPhotoViewer
        photos={viewerPhotos}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        mealLabel={mealLabel}
        timeLabel={timeLabel}
        onDelete={isOnline ? onDeleteSaved : undefined}
      />
    </section>
  );
}
