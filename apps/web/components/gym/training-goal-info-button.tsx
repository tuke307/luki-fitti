'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { TRAINING_GOALS, type TrainingGoal } from '@luki-fitti/common/enums';
import { TRAINING_GOAL_PROFILES } from '@luki-fitti/common/utils/client';
import { useLocale } from '@/providers/i18n/locale-context';

export const formatGoalRest = (seconds: number, secLabel: string, minLabel: string) =>
  seconds % 60 === 0 ? `${seconds / 60} ${minLabel}` : `${seconds} ${secLabel}`;

/** "i" button next to a training-goal setting; explains what each goal changes. */
export function TrainingGoalInfoButton({ className = '' }: { className?: string }) {
  const { t, format } = useLocale();
  const [open, setOpen] = useState(false);
  const info = t.profile.trainingGoalInfo;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`text-muted-foreground -my-1 h-8 w-8 shrink-0 rounded-full ${className}`}
        aria-label={info.button}
        title={info.button}
        onClick={() => setOpen(true)}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="px-5 pt-5 pb-4 text-left">
            <DialogTitle>{t.profile.trainingGoalLabel}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
            <p className="text-[0.9375rem] leading-relaxed">{info.intro}</p>
            {TRAINING_GOALS.map((goal: TrainingGoal) => {
              const p = TRAINING_GOAL_PROFILES[goal];
              return (
                <section key={goal} className="bg-secondary/50 space-y-1.5 rounded-2xl p-4">
                  <h3 className="text-[0.9375rem] font-semibold">
                    {t.profile.trainingGoals[goal]}
                  </h3>
                  <p className="text-muted-foreground text-[0.8125rem]">
                    {format(t.profile.trainingGoalSummary, {
                      compound: `${p.compound.min}–${p.compound.max}`,
                      isolation: `${p.isolation.min}–${p.isolation.max}`,
                      rest: formatGoalRest(p.restSeconds, t.common.sec, t.common.min),
                    })}
                  </p>
                  <p className="text-[0.9375rem] leading-relaxed">{info.rules[goal]}</p>
                </section>
              );
            })}
            <section className="bg-secondary/50 space-y-3 rounded-2xl p-4">
              <h3 className="text-muted-foreground text-[0.8125rem] font-semibold">
                {info.goodToKnowTitle}
              </h3>
              <ul className="list-disc space-y-1.5 ps-5 text-[0.9375rem] leading-relaxed">
                {info.goodToKnow.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
