'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
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
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import type { MealItemDto, NutritionHistoryPicksDto } from '@luki-fitti/common/schemas';
import { formatMealAmount } from '@luki-fitti/common/utils/client';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';

type HistoryTab = 'entries' | 'items';

const SEARCH_DEBOUNCE_MS = 250;
const ADDED_FEEDBACK_MS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

interface HistoryRow {
  key: string;
  name: string;
  subtitle: string;
  hint: string;
  items: MealItemDto[];
}

interface HistoryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (items: MealItemDto[]) => void;
}

export function HistoryPickerDialog({ open, onOpenChange, onAdd }: HistoryPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <HistoryPickerBody onAdd={onAdd} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function HistoryPickerBody({
  onAdd,
  onClose,
}: Pick<HistoryPickerDialogProps, 'onAdd'> & { onClose: () => void }) {
  const { t, format, bcp47 } = useLocale();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<NutritionHistoryPicksDto | null>(null);
  const [settledQuery, setSettledQuery] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<HistoryTab | null>(null);
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const requestRef = useRef(0);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = query.trim();
  const loading = settledQuery !== trimmed;

  useEffect(() => {
    const id = (requestRef.current += 1);
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        api.nutrition
          .historyPicks(trimmed || undefined, { signal: controller.signal })
          .then((res) => {
            if (id !== requestRef.current) return;
            const next = res.data ?? { entries: [], items: [] };
            setData(next);
            setFailed(false);
            setTab((current) => current ?? (next.entries.length > 0 ? 'entries' : 'items'));
          })
          .catch(() => {
            if (id === requestRef.current) setFailed(true);
          })
          .finally(() => {
            if (id === requestRef.current) setSettledQuery(trimmed);
          });
      },
      trimmed ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  useEffect(
    () => () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    },
    [],
  );

  const relativeDay = (iso: string) => {
    const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
    return new Intl.RelativeTimeFormat(bcp47, { numeric: 'auto' }).format(-days, 'day');
  };
  const hintFor = (times: number, lastLoggedAt: string) =>
    `${format(t.nutrition.historyTimes, { count: times })} · ${format(t.nutrition.historyLast, {
      when: relativeDay(lastLoggedAt),
    })}`;
  const kcalLabel = (kcal: number) => `${Math.round(kcal)} ${t.nutrition.kcal}`;

  const entryRows: HistoryRow[] = (data?.entries ?? []).map((e) => ({
    key: `entry-${e.key}`,
    name: e.label?.trim() || e.items.map((i) => i.name).join(', '),
    subtitle: `${format(t.nutrition.historyItemsCount, { count: e.items.length })} · ${kcalLabel(
      e.totals.kcal,
    )}`,
    hint: hintFor(e.timesLogged, e.lastLoggedAt),
    items: e.items,
  }));
  const itemRows: HistoryRow[] = (data?.items ?? []).map((p, index) => ({
    key: `item-${p.item.id ?? index}`,
    name: p.item.name,
    subtitle: [
      p.item.grams === null ? null : formatMealAmount(p.item.grams, p.item.amountUnit, bcp47),
      kcalLabel(p.item.kcal),
    ]
      .filter(Boolean)
      .join(' · '),
    hint: hintFor(p.timesLogged, p.lastLoggedAt),
    items: [p.item],
  }));

  const activeTab = tab ?? 'entries';
  const rows = activeTab === 'entries' ? entryRows : itemRows;

  const add = (row: HistoryRow) => {
    onAdd(row.items);
    setAddedCount((n) => n + row.items.length);
    setAddedKey(row.key);
    setAnnouncement(format(t.nutrition.historyAddedName, { name: row.name }));
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setAddedKey(null), ADDED_FEEDBACK_MS);
  };

  const renderBody = () => {
    if (loading && !data) {
      return (
        <div className="flex justify-center py-10">
          <Spinner className="size-6" />
        </div>
      );
    }
    if (failed) {
      return (
        <p className="text-destructive py-10 text-center text-[0.9375rem]" role="alert">
          {t.nutrition.historyError}
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <p className="text-muted-foreground py-10 text-center text-[0.9375rem]">
          {trimmed ? format(t.nutrition.historyNoMatch, { q: trimmed }) : t.nutrition.historyEmpty}
        </p>
      );
    }
    return (
      <ul className="space-y-1.5" aria-busy={loading}>
        {rows.map((row) => {
          const added = addedKey === row.key;
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => add(row)}
                className="hover:bg-secondary focus-visible:ring-ring/50 focus-visible:outline-ring flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 focus-visible:ring-[3px] focus-visible:outline-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">{row.name}</span>
                  <span className="text-muted-foreground block truncate text-[0.8125rem] tabular-nums">
                    {row.subtitle}
                  </span>
                  <span className="text-muted-foreground block truncate text-[0.75rem] tabular-nums">
                    {row.hint}
                  </span>
                </span>
                {added && (
                  <span className="text-primary flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold">
                    <Check className="h-4 w-4" aria-hidden="true" /> {t.nutrition.historyAdded}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <DialogContent className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 p-0 sm:h-auto sm:max-h-[80dvh] sm:max-w-lg">
      <DialogHeader className="space-y-3 px-5 pt-5 pb-3 text-left">
        <DialogTitle>{t.nutrition.historyTitle}</DialogTitle>
        <DialogDescription className="sr-only">{t.nutrition.historySearch}</DialogDescription>
        <div className="relative">
          <Input
            type="search"
            value={query}
            maxLength={80}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.nutrition.historySearch}
            aria-label={t.nutrition.historySearch}
          />
          {loading && data && (
            <Spinner className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2" />
          )}
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setTab(v as HistoryTab)}>
          <TabsList className="h-11 w-full">
            <TabsTrigger value="entries" className="text-[0.875rem]">
              {t.nutrition.historyTabEntries}
            </TabsTrigger>
            <TabsTrigger value="items" className="text-[0.875rem]">
              {t.nutrition.historyTabItems}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{renderBody()}</div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <DialogFooter className="border-border/60 flex-row items-center justify-between gap-3 border-t px-5 py-4">
        <p className="text-muted-foreground text-[0.875rem] tabular-nums">
          {addedCount > 0 ? format(t.nutrition.historyAddedCount, { count: addedCount }) : ''}
        </p>
        <Button type="button" onClick={onClose}>
          {t.common.done}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
