'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Checkbox } from '@luki-fitti/ui/components/ui/checkbox';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { api } from '@/lib/api';
import { formatUsd } from '@/lib/ai/ai-cost';
import { filterModels } from '@/lib/ai/ai-models';
import { useLocale } from '@/providers/i18n/locale-context';
import { useAdminResource } from './use-admin-resource';

const MAX_RESULTS = 60;

/** Multi-select over the OpenRouter catalog; stores model ids users on admin keys may pick. */
export function AdminModelAllowlist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t, format, bcp47 } = useLocale();
  const catalog = useAdminResource(() => api.admin.aiModelCatalog());
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const models = useMemo(() => catalog.data?.models ?? [], [catalog.data]);
  const names = useMemo(() => new Map(models.map((m) => [m.id, m.name])), [models]);
  const results = useMemo(() => filterModels(models, query).slice(0, MAX_RESULTS), [models, query]);

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((v) => v !== id));

  return (
    <section className="bg-card space-y-3 rounded-[1.25rem] p-5" aria-labelledby="ai-allowlist">
      <div>
        <h2 id="ai-allowlist" className="text-[1.0625rem] font-semibold">
          {t.aiModelAllowlist.title}
        </h2>
        <p className="text-muted-foreground text-[0.8125rem]">{t.aiModelAllowlist.sub}</p>
      </div>

      <p className="text-[0.8125rem] font-semibold" role="status">
        {value.length
          ? format(t.aiModelAllowlist.selectedCount, { count: value.length })
          : t.aiModelAllowlist.noneSelected}
      </p>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <li key={id}>
              <Badge variant="secondary" className="gap-1 py-1 pr-1 pl-2.5">
                <span className="max-w-64 truncate">{names.get(id) ?? id}</span>
                <button
                  type="button"
                  onClick={() => toggle(id, false)}
                  aria-label={format(t.aiModelAllowlist.remove, { model: id })}
                  className="hover:bg-background/60 flex size-6 items-center justify-center rounded-full"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {catalog.data && !catalog.data.catalogAvailable ? (
        <p className="text-warning text-[0.8125rem]" role="status">
          {t.aiModelAllowlist.catalogUnavailable}
        </p>
      ) : !catalog.data ? (
        catalog.error ? (
          <p className="text-warning text-[0.8125rem]" role="status">
            {t.aiModelAllowlist.catalogUnavailable}
          </p>
        ) : (
          <Spinner />
        )
      ) : (
        <>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            placeholder={t.aiModelAllowlist.search}
            aria-label={t.aiModelAllowlist.search}
            spellCheck={false}
            autoCapitalize="off"
            maxLength={100}
          />
          <ul className="max-h-80 space-y-0.5 overflow-y-auto">
            {results.map((m) => (
              <li key={m.id}>
                <label className="hover:bg-secondary/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(m.id)}
                    onCheckedChange={(on) => toggle(m.id, on === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.875rem] font-medium">{m.name}</span>
                    <span className="text-muted-foreground block text-[0.75rem] break-all">
                      {m.id} · {formatUsd(m.pricing.promptPerMTokUsd, bcp47)} /{' '}
                      {formatUsd(m.pricing.completionPerMTokUsd, bcp47)}
                      {m.supportsTools && ` · ${t.aiModelAllowlist.tools}`}
                      {m.supportsImages && ` · ${t.aiModelAllowlist.images}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {results.length === 0 && (
              <li className="text-muted-foreground px-2 py-3 text-[0.8125rem]">
                {t.aiModelAllowlist.noMatches}
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
