'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { FoodItemSource, MEAL_TYPES, MealType } from '@luki-fitti/common/enums';
import type { MealEntryDto, MealItemDto, UpsertMealEntryDto } from '@luki-fitti/common/schemas';
import { scaleFoodItemToGrams, sumMacros } from '@luki-fitti/common/utils/client';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';
import { mealTypeForTime, newClientId } from '@/lib/nutrition/nutrition-day';

const NUM_FIELDS = ['grams', 'kcal', 'proteinG', 'carbsG', 'fatG'] as const;
type NumField = (typeof NUM_FIELDS)[number];

interface DraftItem {
  key: string;
  name: string;
  values: Record<NumField, string>;
  fiberG: number | null;
  sugarG: number | null;
  source: FoodItemSource;
  confidence: number | null;
  /** Reference portion used to rescale nutrients when only the amount changes. */
  base: {
    grams: number;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number | null;
    sugarG: number | null;
  } | null;
}

let keySeq = 0;
const nextKey = () => `item-${(keySeq += 1)}`;
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

function draftFromItem(
  item: Pick<
    MealItemDto,
    | 'name'
    | 'grams'
    | 'kcal'
    | 'proteinG'
    | 'carbsG'
    | 'fatG'
    | 'fiberG'
    | 'sugarG'
    | 'source'
    | 'confidence'
  >,
): DraftItem {
  return {
    key: nextKey(),
    name: item.name,
    values: {
      grams: str(item.grams),
      kcal: str(item.kcal),
      proteinG: str(item.proteinG),
      carbsG: str(item.carbsG),
      fatG: str(item.fatG),
    },
    fiberG: item.fiberG,
    sugarG: item.sugarG,
    source: item.source,
    confidence: item.confidence,
    base:
      item.grams && item.grams > 0
        ? {
            grams: item.grams,
            kcal: item.kcal,
            proteinG: item.proteinG,
            carbsG: item.carbsG,
            fatG: item.fatG,
            fiberG: item.fiberG,
            sugarG: item.sugarG,
          }
        : null,
  };
}

const emptyDraft = (): DraftItem => ({
  key: nextKey(),
  name: '',
  values: { grams: '', kcal: '', proteinG: '', carbsG: '', fatG: '' },
  fiberG: null,
  sugarG: null,
  source: FoodItemSource.MANUAL,
  confidence: null,
  base: null,
});

const toLocalTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface MealEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Entry to edit; null creates a new meal on `dayKey`. */
  entry: MealEntryDto | null;
  dayKey: string;
  defaultMealType?: MealType;
  isOnline: boolean;
  onSave: (payload: UpsertMealEntryDto) => Promise<void>;
  onDelete?: (entry: MealEntryDto) => void;
}

export function MealEditorDialog({ open, onOpenChange, ...props }: MealEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so every opening starts from the entry's current values. */}
      {open && <MealEditorBody {...props} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function MealEditorBody({
  entry,
  dayKey,
  defaultMealType,
  isOnline,
  onSave,
  onDelete,
  onClose,
}: Omit<MealEditorDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const { t, format } = useLocale();
  const [mealType, setMealType] = useState<MealType>(
    () => entry?.mealType ?? defaultMealType ?? mealTypeForTime(new Date()),
  );
  const [time, setTime] = useState(() => toLocalTime(entry?.eatenAt ?? new Date().toISOString()));
  const [label, setLabel] = useState(entry?.label ?? '');
  const [items, setItems] = useState<DraftItem[]>(() =>
    entry?.items.length ? entry.items.map(draftFromItem) : [emptyDraft()],
  );
  const [recent, setRecent] = useState<MealItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    api.nutrition
      .recentItems()
      .then((res) => !cancelled && setRecent(res.data ?? []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  const parsedItems = useMemo(
    () =>
      items.map((d) => ({
        draft: d,
        kcal: num(d.values.kcal) ?? 0,
        proteinG: num(d.values.proteinG) ?? 0,
        carbsG: num(d.values.carbsG) ?? 0,
        fatG: num(d.values.fatG) ?? 0,
        grams: num(d.values.grams),
      })),
    [items],
  );
  const totals = sumMacros(parsedItems);

  const updateItem = (key: string, patch: (d: DraftItem) => DraftItem) =>
    setItems((list) => list.map((d) => (d.key === key ? patch(d) : d)));

  const changeValue = (key: string, field: NumField, value: string) =>
    updateItem(key, (d) => {
      const next = { ...d, values: { ...d.values, [field]: value } };
      const grams = num(next.values.grams);
      if (field === 'grams') {
        if (d.base && grams !== null) {
          const scaled = scaleFoodItemToGrams(d.base, grams);
          return {
            ...next,
            values: {
              grams: value,
              kcal: str(scaled.kcal),
              proteinG: str(scaled.proteinG),
              carbsG: str(scaled.carbsG),
              fatG: str(scaled.fatG),
            },
            fiberG: scaled.fiberG ?? null,
            sugarG: scaled.sugarG ?? null,
          };
        }
        return next;
      }
      // A nutrient edit becomes the new reference portion for later amount changes.
      return {
        ...next,
        base:
          grams && grams > 0
            ? {
                grams,
                kcal: num(next.values.kcal) ?? 0,
                proteinG: num(next.values.proteinG) ?? 0,
                carbsG: num(next.values.carbsG) ?? 0,
                fatG: num(next.values.fatG) ?? 0,
                fiberG: d.fiberG,
                sugarG: d.sugarG,
              }
            : null,
      };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = parsedItems.filter(
      (p) => p.draft.name.trim() || p.kcal || p.proteinG || p.carbsG || p.fatG || p.grams,
    );
    if (filled.some((p) => !p.draft.name.trim())) {
      setError(t.nutrition.validationName);
      return;
    }
    const [h, m] = time.split(':').map(Number) as [number, number];
    const [y, mo, d] = dayKey.split('-').map(Number) as [number, number, number];
    const eatenAt = new Date(y, mo - 1, d, h || 0, m || 0).toISOString();
    setSaving(true);
    try {
      await onSave({
        clientEntryId: entry?.clientEntryId ?? newClientId(),
        eatenAt,
        mealType,
        label: label.trim() || null,
        notes: entry?.notes ?? null,
        items: filled.map((p) => ({
          name: p.draft.name.trim(),
          grams: p.grams,
          kcal: Math.max(0, p.kcal),
          proteinG: Math.max(0, p.proteinG),
          carbsG: Math.max(0, p.carbsG),
          fatG: Math.max(0, p.fatG),
          fiberG: p.draft.fiberG,
          sugarG: p.draft.sugarG,
          source: p.draft.source,
          confidence: p.draft.confidence,
        })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.error);
    } finally {
      setSaving(false);
    }
  };

  const numberLabels: Record<NumField, string> = {
    grams: t.nutrition.amount,
    kcal: t.nutrition.kcal,
    proteinG: `${t.nutrition.protein} (g)`,
    carbsG: `${t.nutrition.carbs} (g)`,
    fatG: `${t.nutrition.fat} (g)`,
  };

  return (
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
      <DialogHeader className="px-5 pt-5 pb-3 text-left">
        <DialogTitle>{entry ? t.nutrition.editMeal : t.nutrition.newMeal}</DialogTitle>
        <DialogDescription className="sr-only">{t.nutrition.addFood}</DialogDescription>
      </DialogHeader>

      <form
        id="meal-editor"
        onSubmit={submit}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4"
      >
        <fieldset>
          <legend className="mb-2 text-[0.8125rem] font-semibold">
            {t.nutrition.mealTypeLabel}
          </legend>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t.nutrition.mealTypeLabel}
          >
            {MEAL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={mealType === type}
                onClick={() => setMealType(type)}
                className={`h-11 rounded-full px-4 text-[0.9375rem] transition-colors duration-150 ${
                  mealType === type
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-secondary text-foreground'
                }`}
              >
                {t.nutrition.mealTypes[type]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="meal-label" className="text-[0.8125rem] font-semibold">
              {t.nutrition.customLabel}
            </Label>
            <Input
              id="meal-label"
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t.nutrition.customLabelPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meal-time" className="text-[0.8125rem] font-semibold">
              {t.nutrition.timeLabel}
            </Label>
            <Input
              id="meal-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-28 tabular-nums"
            />
          </div>
        </div>

        <ul className="space-y-3">
          {items.map((d, index) => (
            <li key={d.key} className="bg-secondary/50 space-y-3 rounded-2xl p-3.5">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label
                    htmlFor={`${d.key}-name`}
                    className="flex items-center gap-2 text-[0.8125rem] font-semibold"
                  >
                    {t.nutrition.itemName}
                    {d.source === FoodItemSource.AI && (
                      <Badge variant="accent" className="gap-1">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />{' '}
                        {t.nutrition.estimatedByAi}
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id={`${d.key}-name`}
                    value={d.name}
                    maxLength={120}
                    autoFocus={!entry && index === 0}
                    onChange={(e) => updateItem(d.key, (x) => ({ ...x, name: e.target.value }))}
                    placeholder={t.nutrition.itemNamePlaceholder}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={format(t.nutrition.removeItem, {
                    name: d.name || t.nutrition.itemName,
                  })}
                  onClick={() =>
                    setItems((list) =>
                      list.length > 1 ? list.filter((x) => x.key !== d.key) : [emptyDraft()],
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {NUM_FIELDS.map((field) => (
                  <div key={field} className="space-y-1">
                    <Label
                      htmlFor={`${d.key}-${field}`}
                      className="text-muted-foreground text-[0.75rem]"
                    >
                      {numberLabels[field]}
                    </Label>
                    <Input
                      id={`${d.key}-${field}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={d.values[field]}
                      onChange={(e) => changeValue(d.key, field, e.target.value)}
                      className="tabular-nums"
                    />
                  </div>
                ))}
              </div>
              {d.source === FoodItemSource.AI && d.confidence !== null && d.confidence < 0.5 && (
                <p className="text-warning text-[0.8125rem]">{t.nutrition.confidenceLow}</p>
              )}
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="secondary"
          onClick={() => setItems((list) => [...list, emptyDraft()])}
        >
          <Plus className="h-4 w-4" /> {t.nutrition.addItem}
        </Button>

        {recent.length > 0 && (
          <section aria-labelledby="meal-recent" className="space-y-2">
            <h3 id="meal-recent" className="text-[0.8125rem] font-semibold">
              {t.nutrition.recent}
            </h3>
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setItems((list) => [
                      ...list.filter((x) => x.name.trim() || Object.values(x.values).some(Boolean)),
                      draftFromItem({ ...item, source: FoodItemSource.MANUAL, confidence: null }),
                    ])
                  }
                  className="bg-secondary hover:bg-secondary/70 h-11 rounded-full px-4 text-[0.875rem]"
                >
                  {item.name}
                  <span className="text-muted-foreground ml-1.5 tabular-nums">
                    {Math.round(item.kcal)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {entry && entry.photos.length > 0 && (
          <section aria-label={t.nutrition.photos} className="flex gap-2 overflow-x-auto">
            {entry.photos.map((photo) =>
              photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin API image
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={format(t.nutrition.photoAlt, {
                    meal: t.nutrition.mealTypes[entry.mealType],
                  })}
                  className="h-20 w-20 shrink-0 rounded-xl object-cover"
                />
              ) : null,
            )}
          </section>
        )}

        {error && (
          <p className="text-destructive text-[0.875rem]" role="alert">
            {error}
          </p>
        )}
      </form>

      <DialogFooter className="border-border/60 flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] tabular-nums" aria-live="polite">
          <span className="font-semibold">
            {t.nutrition.total}: {totals.kcal} {t.nutrition.kcal}
          </span>
          <span className="text-muted-foreground">
            {' '}
            · {t.nutrition.proteinShort} {totals.proteinG} · {t.nutrition.carbsShort}{' '}
            {totals.carbsG} · {t.nutrition.fatShort} {totals.fatG}
          </span>
        </p>
        <div className="flex gap-2">
          {entry && onDelete && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              aria-label={t.nutrition.deleteMeal}
              onClick={() => onDelete(entry)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="submit"
            form="meal-editor"
            disabled={saving}
            className="flex-1 sm:flex-none"
          >
            {t.nutrition.saveMeal}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
