'use client';

import { useEffect, useState } from 'react';
import { CircleHelp, ExternalLink } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import type { AiSkillName } from '@luki-fitti/common/enums';
import { aiPromptGithubUrl, aiPromptRawUrl } from '@luki-fitti/common/schemas';
import { formatUsd } from '@/lib/ai/ai-cost';
import { useAiModels } from '@/lib/ai/use-ai-models';
import { useLocale } from '@/providers/i18n/locale-context';

const PROMPT_MAX_CHARS = 50_000;

type PromptState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; text: string };

/** Fetches the system prompt as plain text from GitHub `main` (same file the API reads). */
function usePromptText(skill: AiSkillName): PromptState {
  const [state, setState] = useState<PromptState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    fetch(aiPromptRawUrl(skill), {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-cache',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', text: (await res.text()).slice(0, PROMPT_MAX_CHARS) });
      })
      .catch(() => !controller.signal.aborted && setState({ status: 'error' }));
    return () => controller.abort();
  }, [skill]);
  return state;
}

/** "?" button next to an AI action: model, prices, what is sent and the system prompt. */
export function AiInfoButton({
  skill,
  className = '',
}: {
  skill: AiSkillName;
  className?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`text-muted-foreground h-11 w-11 shrink-0 rounded-full ${className}`}
        aria-label={t.aiInfo.button}
        title={t.aiInfo.button}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <AiInfoBody skill={skill} />}
      </Dialog>
    </>
  );
}

function AiInfoBody({ skill }: { skill: AiSkillName }) {
  const { t, format, bcp47 } = useLocale();
  const models = useAiModels();
  const prompt = usePromptText(skill);
  const info = models.data?.skills.find((s) => s.skill === skill);
  const effective = info?.effectiveModelInfo;
  const githubUrl = aiPromptGithubUrl(skill);

  return (
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
      <DialogHeader className="px-5 pt-5 pb-3 text-left">
        <DialogTitle>{t.aiInfo.title}</DialogTitle>
        <DialogDescription>{t.aiModels.skills[skill]}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t.aiInfo.modelTitle}
          </h3>
          {models.loading && !info ? (
            <p className="text-muted-foreground text-[0.875rem]" role="status">
              {t.aiInfo.modelLoading}
            </p>
          ) : info ? (
            <>
              <p className="text-[0.9375rem] font-semibold break-all">
                {effective?.name ?? info.effectiveModel}{' '}
                <span className="text-muted-foreground font-normal">
                  (
                  {info.effectiveModel === info.selectedModel
                    ? t.aiInfo.modelChosen
                    : t.aiInfo.modelDefault}
                  )
                </span>
              </p>
              {effective && (
                <p className="text-muted-foreground text-[0.8125rem] break-all">
                  {effective.id}
                  {' · '}
                  <span className="whitespace-nowrap">
                    {format(t.aiInfo.pricingInput, {
                      input: formatUsd(effective.pricing.promptPerMTokUsd, bcp47),
                    })}
                  </span>
                  {' · '}
                  <span className="whitespace-nowrap">
                    {format(t.aiInfo.pricingOutput, {
                      output: formatUsd(effective.pricing.completionPerMTokUsd, bcp47),
                    })}
                  </span>
                </p>
              )}
              <p className="text-muted-foreground text-[0.8125rem]">{t.aiInfo.changeModel}</p>
            </>
          ) : (
            <p className="text-muted-foreground text-[0.875rem]">{t.aiInfo.modelUnavailable}</p>
          )}
        </section>

        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t.aiInfo.dataTitle}
          </h3>
          <p className="text-[0.875rem]">{t.aiInfo.data[skill]}</p>
          <p className="text-muted-foreground text-[0.8125rem]">{t.aiInfo.dataNote}</p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t.aiInfo.promptTitle}
            </h3>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex min-h-11 items-center gap-1 text-[0.875rem] font-medium"
            >
              {t.aiInfo.viewOnGithub}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          {prompt.status === 'loading' ? (
            <div className="flex items-center gap-2 py-4" role="status">
              <Spinner />
              <span className="text-muted-foreground text-[0.875rem]">
                {t.aiInfo.promptLoading}
              </span>
            </div>
          ) : prompt.status === 'error' ? (
            <p className="text-muted-foreground text-[0.875rem]" role="alert">
              {t.aiInfo.promptError}{' '}
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {t.aiInfo.viewOnGithub}
              </a>
            </p>
          ) : (
            <pre className="bg-secondary/60 max-h-[40dvh] overflow-auto rounded-2xl p-3.5 font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap">
              {prompt.text}
            </pre>
          )}
        </section>
      </div>
    </DialogContent>
  );
}
