'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  CircleHelp,
  Cpu,
  ExternalLink,
  FileText,
  Send,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
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
  label,
  className = '',
}: {
  skill: AiSkillName;
  /** Renders a labeled pill instead of the plain icon button. */
  label?: string;
  className?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          className={`text-muted-foreground h-9 shrink-0 gap-1.5 px-3 ${className}`}
          aria-label={`${t.aiInfo.button}: ${label}`}
          title={`${t.aiInfo.button}: ${label}`}
          onClick={() => setOpen(true)}
        >
          <CircleHelp className="h-4 w-4" aria-hidden="true" /> {label}
        </Button>
      ) : (
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
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <AiInfoBody skill={skill} />}
      </Dialog>
    </>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-secondary/50 space-y-3 rounded-2xl p-4">
      <h3 className="text-muted-foreground flex items-center gap-2 text-[0.8125rem] font-semibold">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
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
      <DialogHeader className="px-5 pt-5 pb-4 text-left">
        <DialogTitle>{t.aiInfo.title}</DialogTitle>
        <DialogDescription>{t.aiModels.skills[skill]}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
        <InfoCard icon={Cpu} title={t.aiInfo.modelTitle}>
          {models.loading && !info ? (
            <p className="text-muted-foreground text-[0.875rem]" role="status">
              {t.aiInfo.modelLoading}
            </p>
          ) : info ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 text-[1.0625rem] leading-snug font-semibold break-words">
                  {effective?.name ?? info.effectiveModel}
                </p>
                <Badge variant="secondary" className="shrink-0">
                  {info.effectiveModel === info.selectedModel
                    ? t.aiInfo.modelChosen
                    : t.aiInfo.modelDefault}
                </Badge>
              </div>
              {effective && (
                <>
                  <p className="text-muted-foreground font-mono text-[0.75rem] break-all">
                    {effective.id}
                  </p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[0.875rem]">
                    <dt className="text-muted-foreground">{t.aiInfo.priceInputLabel}</dt>
                    <dd className="font-medium tabular-nums">
                      {format(t.aiInfo.pricePerMTok, {
                        price: formatUsd(effective.pricing.promptPerMTokUsd, bcp47),
                      })}
                    </dd>
                    <dt className="text-muted-foreground">{t.aiInfo.priceOutputLabel}</dt>
                    <dd className="font-medium tabular-nums">
                      {format(t.aiInfo.pricePerMTok, {
                        price: formatUsd(effective.pricing.completionPerMTokUsd, bcp47),
                      })}
                    </dd>
                  </dl>
                </>
              )}
              <p className="border-border/60 text-muted-foreground border-t pt-3 text-[0.8125rem]">
                {t.aiInfo.changeModel}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-[0.875rem]">{t.aiInfo.modelUnavailable}</p>
          )}
        </InfoCard>

        <InfoCard icon={Send} title={t.aiInfo.dataTitle}>
          <p className="text-[0.9375rem] leading-relaxed">{t.aiInfo.data[skill]}</p>
          <p className="text-muted-foreground flex gap-2 text-[0.8125rem]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.aiInfo.dataNote}
          </p>
        </InfoCard>

        <InfoCard icon={FileText} title={t.aiInfo.promptTitle}>
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
            <>
              <pre className="bg-background max-h-[40dvh] overflow-auto rounded-xl p-3.5 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
                {prompt.text}
              </pre>
              <Button variant="secondary" asChild className="w-full">
                <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                  {t.aiInfo.viewOnGithub}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            </>
          )}
        </InfoCard>
      </div>
    </DialogContent>
  );
}
