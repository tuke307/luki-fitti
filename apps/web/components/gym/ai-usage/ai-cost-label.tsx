'use client';

import { Sparkles } from 'lucide-react';
import type { AiRunUsageDto } from '@luki-fitti/common/schemas';
import { formatCount, formatUsd } from '@/lib/ai/ai-cost';
import { useLocale } from '@/providers/i18n/locale-context';

/** "3,120 tokens · $0.0041" for one AI request (USD as reported by OpenRouter). */
export function AiCostLabel({
  usage,
  className = '',
}: {
  usage: AiRunUsageDto | null | undefined;
  className?: string;
}) {
  const { t, format, bcp47 } = useLocale();
  if (!usage) return null;
  const tokens = format(t.aiUsage.tokenCount, {
    count: formatCount(usage.promptTokens + usage.completionTokens, bcp47),
  });
  const cost = usage.costUsd === null ? t.aiUsage.costUnavailable : formatUsd(usage.costUsd, bcp47);
  const text = `${tokens} · ${cost}`;
  return (
    <p
      className={`text-muted-foreground flex items-center gap-1.5 text-[0.8125rem] tabular-nums ${className}`}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{format(t.aiUsage.costLabel, { value: text })}</span>
    </p>
  );
}
