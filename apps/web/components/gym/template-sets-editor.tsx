'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { SetType, type WeightUnit } from '@luki-fitti/common/enums';
import { orderWarmupsFirst } from '@luki-fitti/common/utils/client';
import type { TemplateSetDto } from '@luki-fitti/common/schemas';
import { useLocale } from '@/providers/i18n/locale-context';
import { NumberInput } from './number-input';
import { getSetBadgeLabels, SetTypeBadge } from './set-type-badge';

interface TemplateSetsEditorProps {
  sets: TemplateSetDto[];
  weightUnit: WeightUnit;
  onChange: (sets: TemplateSetDto[]) => void;
  /** Accessible name prefix, e.g. the exercise slot number. */
  labelPrefix: string;
}

/** Per-set plan of a template exercise: type, weight and reps for every set. */
export function TemplateSetsEditor({
  sets,
  weightUnit,
  onChange,
  labelPrefix,
}: TemplateSetsEditorProps) {
  const { t, setTypeLabel } = useLocale();
  const labels = getSetBadgeLabels(sets);
  const update = (idx: number, patch: Partial<TemplateSetDto>) => {
    const next = sets.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(patch.setType !== undefined ? orderWarmupsFirst(next) : next);
  };

  return (
    <div className="space-y-1.5" data-testid="template-sets-editor">
      <div className="text-muted-foreground grid grid-cols-[2.25rem_1fr_1fr_2rem] items-center gap-2 px-0.5 text-xs font-semibold">
        <span>{t.common.set}</span>
        <span>{weightUnit.toLowerCase()}</span>
        <span>{t.common.reps}</span>
        <span />
      </div>
      {sets.map((set, idx) => (
        <div
          key={idx}
          data-testid={`template-set-row-${idx + 1}`}
          data-set-type={set.setType}
          className="grid grid-cols-[2.25rem_1fr_1fr_2rem] items-center gap-2"
        >
          <div className="relative">
            <SetTypeBadge setType={set.setType} label={labels[idx] ?? ''} completed={false} />
            <select
              aria-label={`${labelPrefix} set ${idx + 1} type`}
              value={set.setType}
              onChange={(e) => update(idx, { setType: e.target.value as SetType })}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {Object.values(SetType).map((type) => (
                <option key={type} value={type}>
                  {setTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <NumberInput
            allowNull
            step="0.5"
            min={0}
            aria-label={`${labelPrefix} set ${idx + 1} weight`}
            value={set.weight}
            onValueChange={(val) => update(idx, { weight: val })}
            placeholder="–"
            className="tabular-nums h-9 text-xs sm:h-8"
          />
          <NumberInput
            allowNull
            min={0}
            aria-label={`${labelPrefix} set ${idx + 1} reps`}
            value={set.reps}
            onValueChange={(val) => update(idx, { reps: val })}
            placeholder="–"
            className="tabular-nums h-9 text-xs sm:h-8"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={sets.length <= 1}
            aria-label={`${t.common.delete} ${labelPrefix} set ${idx + 1}`}
            onClick={() => onChange(sets.filter((_, i) => i !== idx))}
            className="text-muted-foreground hover:text-destructive size-8"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={() => {
          const last = sets[sets.length - 1];
          onChange([
            ...sets,
            {
              setType: SetType.WORKING,
              weight: last?.weight ?? null,
              reps: last?.reps ?? 10,
              durationSeconds: last?.durationSeconds ?? null,
            },
          ]);
        }}
        className="font-semibold"
      >
        <Plus className="h-3 w-3" /> {t.session.addWorkingSetBtn}
      </Button>
    </div>
  );
}
