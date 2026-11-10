'use client';

import { useMemo, useState } from 'react';
import { Camera, Check, Dumbbell, MessageSquareText, type LucideIcon } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { AiKeySlot, AiSkillName } from '@luki-fitti/common/enums';
import type { AiModelOptionDto, AiSkillModelsDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { Sparkles } from 'lucide-react';
import { formatUsd } from '@/lib/ai/ai-cost';
import { filterModels, nextModelChoices } from '@/lib/ai/ai-models';
import { useAiModels } from '@/lib/ai/use-ai-models';
import { useLocale } from '@/providers/i18n/locale-context';
import { SettingsRow, SettingsSection } from './settings-row';

const SKILL_ICONS: Record<AiSkillName, LucideIcon> = {
  [AiSkillName.WORKOUT_BUILDER]: Dumbbell,
  [AiSkillName.MEAL_ANALYZER]: Camera,
  [AiSkillName.MEAL_TEXT_ANALYZER]: MessageSquareText,
  [AiSkillName.PROGRESS_TARGET]: Sparkles,
};

export function AiModelsPage() {
  const { t, format } = useLocale();
  const models = useAiModels();
  const [picking, setPicking] = useState<AiSkillName | null>(null);
  const [saving, setSaving] = useState(false);
  const data = models.data;

  const save = async (skill: AiSkillName, modelId: string | null) => {
    if (!data) return;
    setSaving(true);
    try {
      await api.auth.updatePreferences({ aiModels: nextModelChoices(data, skill, modelId) });
      toast.success(t.aiModels.saved);
      setPicking(null);
      models.reload();
    } catch {
      toast.error(t.aiModels.saveError);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Card className="rounded-[1.25rem] p-5">
        {models.loading ? (
          <div className="flex items-center gap-2" role="status">
            <Spinner />
            <span className="text-muted-foreground text-sm">{t.aiModels.loading}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm" role="alert">
              {t.aiModels.loadError}
            </p>
            <Button type="button" variant="secondary" onClick={models.reload}>
              {t.aiModels.retry}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  const choiceLabel = (s: AiSkillModelsDto) => {
    if (s.selectedModel && s.effectiveModel === s.selectedModel) {
      return s.effectiveModelInfo?.name ?? s.selectedModel;
    }
    return format(t.aiModels.defaultChoice, {
      model: s.effectiveModelInfo?.name ?? s.defaultModel,
    });
  };
  const pickingSkill = data.skills.find((s) => s.skill === picking) ?? null;

  return (
    <div className="space-y-4" aria-busy={models.loading}>
      <p className="text-muted-foreground px-1 text-[0.875rem]">{t.aiModels.intro}</p>
      {data.keySource === AiKeySlot.ADMIN && (
        <p className="bg-secondary/60 rounded-2xl p-3.5 text-[0.875rem]">{t.aiModels.restricted}</p>
      )}
      {data.keySource === null && (
        <p className="bg-secondary/60 rounded-2xl p-3.5 text-[0.875rem]">{t.aiModels.noKey}</p>
      )}
      {!data.catalogAvailable && (
        <p className="text-warning bg-warning/10 rounded-2xl p-3.5 text-[0.875rem]" role="status">
          {t.aiModels.catalogUnavailable}
        </p>
      )}
      <SettingsSection title={t.profile.rowAiModels}>
        {data.skills.map((s) => (
          <SettingsRow
            key={s.skill}
            icon={SKILL_ICONS[s.skill]}
            tone="primary"
            title={t.aiModels.skills[s.skill]}
            subtitle={
              s.selectedModel && s.effectiveModel !== s.selectedModel
                ? format(t.aiModels.staleChoice, { model: s.selectedModel })
                : choiceLabel(s)
            }
            onClick={() => setPicking(s.skill)}
            data-testid={`ai-model-row-${s.skill}`}
          />
        ))}
      </SettingsSection>

      <Dialog open={!!pickingSkill} onOpenChange={(o) => !o && !saving && setPicking(null)}>
        {pickingSkill && (
          <ModelPicker
            skill={pickingSkill}
            saving={saving}
            onSelect={(id) => void save(pickingSkill.skill, id)}
          />
        )}
      </Dialog>
    </div>
  );
}

function ModelPicker({
  skill,
  saving,
  onSelect,
}: {
  skill: AiSkillModelsDto;
  saving: boolean;
  onSelect: (modelId: string | null) => void;
}) {
  const { t, format, bcp47 } = useLocale();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterModels(skill.models, query), [query, skill.models]);
  const current =
    skill.selectedModel && skill.effectiveModel === skill.selectedModel
      ? skill.selectedModel
      : null;
  const skillName = t.aiModels.skills[skill.skill];

  const option = (m: AiModelOptionDto) => (
    <li key={m.id}>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSelect(m.id)}
        aria-pressed={current === m.id}
        className="hover:bg-secondary/60 focus-visible:ring-ring flex min-h-14 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">{m.name}</span>
          <span className="text-muted-foreground block text-[0.75rem] break-all">{m.id}</span>
          <span className="text-muted-foreground block text-[0.8125rem] tabular-nums">
            {format(t.aiModels.pricing, {
              input: formatUsd(m.pricing.promptPerMTokUsd, bcp47),
              output: formatUsd(m.pricing.completionPerMTokUsd, bcp47),
            })}
            {' · '}
            {m.estimatedCostPerRunUsd === null
              ? t.aiModels.estimateUnknown
              : format(t.aiModels.estimate, { cost: formatUsd(m.estimatedCostPerRunUsd, bcp47) })}
          </span>
        </span>
        {current === m.id && (
          <Check className="text-primary mt-1 h-4 w-4 shrink-0" aria-label={t.aiModels.selected} />
        )}
      </button>
    </li>
  );

  return (
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
      <DialogHeader className="px-5 pt-5 pb-3 text-left">
        <DialogTitle>{format(t.aiModels.choose, { skill: skillName })}</DialogTitle>
        <DialogDescription>
          {skill.restricted ? t.aiModels.restricted : t.aiModels.intro}
        </DialogDescription>
      </DialogHeader>
      <div className="px-5 pb-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.aiModels.search}
          aria-label={t.aiModels.search}
          maxLength={100}
        />
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4" aria-busy={saving}>
        <li>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSelect(null)}
            aria-pressed={current === null}
            className="hover:bg-secondary/60 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium">{t.aiModels.useDefault}</span>
              <span className="text-muted-foreground block text-[0.75rem] break-all">
                {skill.defaultModel}
              </span>
            </span>
            {current === null && (
              <Check className="text-primary h-4 w-4 shrink-0" aria-label={t.aiModels.selected} />
            )}
          </button>
        </li>
        {filtered.map(option)}
        {skill.models.length === 0 ? (
          <li className="text-muted-foreground px-3 py-4 text-[0.875rem]">
            {t.aiModels.noEligible}
          </li>
        ) : (
          filtered.length === 0 && (
            <li className="text-muted-foreground px-3 py-4 text-[0.875rem]">
              {t.aiModels.noMatches}
            </li>
          )
        )}
      </ul>
    </DialogContent>
  );
}
