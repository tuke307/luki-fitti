'use client';

import { useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import type { WeightUnit } from '@luki-fitti/common/enums';
import {
  BODY_WEIGHT_MAX_KG,
  BODY_WEIGHT_MIN_KG,
  UpsertBodyWeightEntrySchema,
  type BodyWeightEntryDto,
  type UpsertBodyWeightEntryDto,
} from '@luki-fitti/common/schemas';
import { unitLabel } from '@/lib/format/weight';
import {
  fromDateTimeLocalValue,
  fromDisplayWeight,
  newWeightClientId,
  toDateTimeLocalValue,
  toDisplayWeight,
} from '@/lib/body-weight/body-weight';
import { useLocale } from '@/providers/i18n/locale-context';
import { WEIGHT_INPUT_ID } from './weight-focus';

type ErrorField = 'weight' | 'date' | 'note' | 'form';

interface WeightEntryFormProps {
  unit: WeightUnit;
  /** Entry being edited; null logs a new weigh-in. */
  editing: BodyWeightEntryDto | null;
  /** Prefill for a new weigh-in (the latest weight), in kg. */
  suggestedKg?: number | null;
  onSave: (payload: UpsertBodyWeightEntryDto) => Promise<void>;
  onCancelEdit: () => void;
}

const NOTE_MAX = 280;

/** Quick-add / edit form for a weigh-in. Values are entered in the person's unit, stored in kg. */
export function WeightEntryForm({
  unit,
  editing,
  suggestedKg,
  onSave,
  onCancelEdit,
}: WeightEntryFormProps) {
  const { t, format } = useLocale();
  const [nowMs] = useState(() => Date.now());
  const [value, setValue] = useState(() =>
    editing ? String(toDisplayWeight(editing.weightKg, unit)) : '',
  );
  const [measuredAt, setMeasuredAt] = useState(() =>
    toDateTimeLocalValue(editing ? editing.measuredAt : nowMs),
  );
  const [note, setNote] = useState(() => editing?.note ?? '');
  const [error, setError] = useState<{ field: ErrorField; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const unitText = unitLabel(unit);
  const minDisplay = Math.ceil(toDisplayWeight(BODY_WEIGHT_MIN_KG, unit));
  const maxDisplay = Math.floor(toDisplayWeight(BODY_WEIGHT_MAX_KG, unit));
  const weightError = format(t.weight.errorWeight, {
    min: minDisplay,
    max: maxDisplay,
    unit: unitText,
  });
  const placeholder = suggestedKg ? String(toDisplayWeight(suggestedKg, unit)) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedValue = Number(value.replace(',', '.'));
    if (value.trim() === '' || !Number.isFinite(parsedValue)) {
      setError({ field: 'weight', message: weightError });
      return;
    }
    const iso = fromDateTimeLocalValue(measuredAt);
    if (!iso) {
      setError({ field: 'date', message: t.weight.errorDate });
      return;
    }
    const parsed = UpsertBodyWeightEntrySchema.safeParse({
      clientEntryId: editing?.clientEntryId ?? newWeightClientId(),
      measuredAt: iso,
      weightKg: fromDisplayWeight(parsedValue, unit),
      note: note.trim() ? note.trim() : null,
    });
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      setError(
        path === 'measuredAt'
          ? { field: 'date', message: t.weight.errorDate }
          : path === 'note'
            ? { field: 'note', message: t.weight.errorNote }
            : { field: 'weight', message: weightError },
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      setError({ field: 'form', message: t.weight.errorSave });
    } finally {
      setSaving(false);
    }
  };

  const describedBy = (field: ErrorField) =>
    error?.field === field ? 'weight-form-error' : undefined;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="weight-form-title"
      className="bg-secondary/50 space-y-3 rounded-2xl p-4"
    >
      <h3 id="weight-form-title" className="text-[0.9375rem] font-semibold">
        {editing ? t.weight.editTitle : t.weight.logTitle}
      </h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={WEIGHT_INPUT_ID} className="text-[0.8125rem] font-semibold">
            {format(t.weight.weightLabel, { unit: unitText })}
          </Label>
          <Input
            id={WEIGHT_INPUT_ID}
            type="number"
            inputMode="decimal"
            step="0.1"
            min={minDisplay}
            max={maxDisplay}
            required
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error?.field === 'weight' || undefined}
            aria-describedby={describedBy('weight')}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weight-measured-at" className="text-[0.8125rem] font-semibold">
            {t.weight.measuredAtLabel}
          </Label>
          <Input
            id="weight-measured-at"
            type="datetime-local"
            required
            max={toDateTimeLocalValue(nowMs)}
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
            aria-invalid={error?.field === 'date' || undefined}
            aria-describedby={describedBy('date')}
            className="tabular-nums"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="weight-note" className="text-[0.8125rem] font-semibold">
          {t.weight.noteLabel}
        </Label>
        <Input
          id="weight-note"
          type="text"
          maxLength={NOTE_MAX}
          placeholder={t.weight.notePlaceholder}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={error?.field === 'note' || undefined}
          aria-describedby={describedBy('note')}
        />
      </div>

      {error && (
        <p id="weight-form-error" className="text-destructive text-[0.8125rem]" role="alert">
          {error.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {editing ? t.weight.saveChanges : t.weight.logButton}
        </Button>
        {editing && (
          <Button type="button" variant="secondary" onClick={onCancelEdit}>
            {t.weight.cancelEdit}
          </Button>
        )}
      </div>
    </form>
  );
}
