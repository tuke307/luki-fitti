'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { BodyWeightSource, WeightUnit } from '@luki-fitti/common/enums';
import type { BodyWeightEntryDto, UpsertBodyWeightEntryDto } from '@luki-fitti/common/schemas';
import { weightTrend } from '@luki-fitti/common/utils/client';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { unitLabel } from '@/lib/format/weight';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';
import { calendarDaysAgo, newestFirst, toDisplayWeight } from '@/lib/body-weight/body-weight';
import {
  formatDaysAgo,
  formatWeighInDateTime,
  formatWeight,
  formatWeightDelta,
} from '@/lib/body-weight/weight-format';
import { ConfirmDestructiveDialog } from '../confirm-destructive-dialog';
import { MobileSheet } from '../mobile-sheet';
import { PageTitle } from '../page-title';
import { WeightChart } from './weight-chart';
import { WeightEntryForm } from './weight-entry-form';
import {
  consumeWeightFocusRequest,
  focusWeightInput,
  scrollToWeightSection,
  WEIGHT_SECTION_ID,
} from './weight-focus';

const COLLAPSED_ROWS = 8;
const SHEET_FORM_ID = 'weight-sheet-form';

interface WeightViewProps {
  /**
   * `section` is the card with an inline form (profile). `page` is the pushed Weight page from
   * Today: large title, back button, and logging in a sheet like iOS.
   */
  variant?: 'section' | 'page';
  onBack?: () => void;
  /** Page only: open the log sheet right away (the Today card's "Log weight"). */
  logOnOpen?: boolean;
}

/** Body weight history: summary, trend chart, quick add and the list of weigh-ins. */
export function WeightView({ variant = 'section', onBack, logOnOpen = false }: WeightViewProps) {
  const { user, isAuthenticated } = useAuth();
  const { t, format, bcp47 } = useLocale();
  const { entries, latest, pending, save, remove } = useBodyWeight();
  const isPage = variant === 'page';
  const [sheetOpen, setSheetOpen] = useState(isPage && logOnOpen);
  const unit = user?.preferences?.weightUnit ?? WeightUnit.KG;
  const unitText = unitLabel(unit);

  const [nowMs] = useState(() => Date.now());
  const [editing, setEditing] = useState<BodyWeightEntryDto | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState<BodyWeightEntryDto | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isPage) return;
    // Consumed inside the frame so a StrictMode effect re-run doesn't drop the request.
    const id = window.requestAnimationFrame(() => {
      const request = consumeWeightFocusRequest();
      if (request === 'input') focusWeightInput();
      else if (request === 'section') scrollToWeightSection();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isPage]);

  const trend = useMemo(() => weightTrend(entries, new Date(nowMs)), [entries, nowMs]);
  const list = useMemo(() => newestFirst(entries), [entries]);
  const visible = expanded ? list : list.slice(0, COLLAPSED_ROWS);
  const latestDisplay = latest ? toDisplayWeight(latest.weightKg, unit) : null;

  const delta = (kg: number | null) =>
    kg === null ? '–' : `${formatWeightDelta(toDisplayWeight(kg, unit), bcp47)} ${unitText}`;

  const tiles: Array<{ label: string; value: string; testId: string }> = [
    {
      label: t.weight.current,
      value: latestDisplay === null ? '–' : `${formatWeight(latestDisplay, bcp47)} ${unitText}`,
      testId: 'weight-current',
    },
    { label: t.weight.change7d, value: delta(trend.change7dKg), testId: 'weight-change-7d' },
    { label: t.weight.change30d, value: delta(trend.change30dKg), testId: 'weight-change-30d' },
    {
      label: t.weight.lastWeighIn,
      value: latest
        ? formatDaysAgo(calendarDaysAgo(latest.measuredAt, new Date(nowMs)), bcp47)
        : '–',
      testId: 'weight-last',
    },
  ];

  const handleSave = async (payload: UpsertBodyWeightEntryDto) => {
    const wasEditing = Boolean(editing);
    const reachedServer = await save(payload);
    // Guests keep weigh-ins on this device by design, so "will sync" would be misleading.
    if (!reachedServer && isAuthenticated) toast.info(t.weight.savedOffline);
    else toast.success(wasEditing ? t.weight.updated : t.weight.saved);
    setEditing(null);
    setFormKey((k) => k + 1);
    setSheetOpen(false);
  };

  const openLog = () => {
    setEditing(null);
    setFormKey((k) => k + 1);
    setSheetOpen(true);
  };

  const startEdit = (entry: BodyWeightEntryDto) => {
    setEditing(entry);
    setFormKey((k) => k + 1);
    if (isPage) setSheetOpen(true);
    else window.requestAnimationFrame(focusWeightInput);
  };

  const confirmDelete = async () => {
    const entry = deleting;
    if (!entry) return;
    if (editing?.clientEntryId === entry.clientEntryId) {
      setEditing(null);
      setFormKey((k) => k + 1);
    }
    try {
      await remove(entry);
      toast(t.weight.deleted);
    } catch {
      toast.error(t.weight.errorDelete);
    }
  };

  const tilesEl = (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.testId} className="bg-secondary/50 min-w-0 rounded-2xl px-3 py-2.5">
          <dt className="text-muted-foreground truncate text-[0.8125rem]">{tile.label}</dt>
          <dd
            data-testid={tile.testId}
            className="font-rounded truncate text-[1.25rem] leading-tight font-semibold tabular-nums first-letter:uppercase"
          >
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );

  const pendingEl = pending > 0 && isAuthenticated && (
    <p className="text-muted-foreground text-[0.8125rem]" role="status">
      {t.weight.savedOffline}
    </p>
  );

  const historyEl = (
    <section aria-labelledby="weight-history-title" className="space-y-2">
      <h3 id="weight-history-title" className="text-[0.9375rem] font-semibold">
        {t.weight.historyTitle}
      </h3>
      <ul className="divide-border/60 divide-y" data-testid="weight-history">
        {visible.map((entry) => {
          const when = formatWeighInDateTime(entry.measuredAt, bcp47);
          return (
            <li
              key={entry.clientEntryId}
              className="flex min-h-14 items-center gap-3 py-2"
              data-testid="weight-history-row"
            >
              <div className="min-w-0 flex-1">
                <p className="font-rounded text-[1.0625rem] font-semibold tabular-nums">
                  {formatWeight(toDisplayWeight(entry.weightKg, unit), bcp47)}{' '}
                  <span className="text-muted-foreground text-[0.875rem] font-medium">
                    {unitText}
                  </span>
                </p>
                <p className="text-muted-foreground truncate text-[0.8125rem]">
                  {when}
                  {entry.note && ` · ${entry.note}`}
                </p>
              </div>
              {entry.source === BodyWeightSource.HEALTHKIT && (
                <Badge variant="secondary" className="shrink-0 rounded-full">
                  {t.weight.sourceHealth}
                </Badge>
              )}
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={format(t.weight.editAria, { date: when })}
                  title={t.weight.edit}
                  onClick={() => startEdit(entry)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={format(t.weight.deleteAria, { date: when })}
                  title={t.weight.delete}
                  onClick={() => setDeleting(entry)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > COLLAPSED_ROWS && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t.weight.showLess : format(t.weight.showAll, { count: list.length })}
        </Button>
      )}
    </section>
  );

  const deleteDialog = (
    <ConfirmDestructiveDialog
      open={deleting !== null}
      onOpenChange={(open) => {
        if (!open) setDeleting(null);
      }}
      title={t.weight.deleteTitle}
      description={
        deleting
          ? format(t.weight.deleteDesc, {
              weight: `${formatWeight(toDisplayWeight(deleting.weightKg, unit), bcp47)} ${unitText}`,
              date: formatWeighInDateTime(deleting.measuredAt, bcp47),
            })
          : ''
      }
      confirmLabel={t.weight.deleteConfirm}
      onConfirm={confirmDelete}
      testId="weight-delete-dialog"
    />
  );

  const entryForm = (sheetFormId?: string) => (
    <WeightEntryForm
      key={formKey}
      unit={unit}
      editing={editing}
      suggestedKg={latest?.weightKg ?? user?.preferences?.bodyWeightKg ?? null}
      onSave={handleSave}
      onCancelEdit={() => {
        setEditing(null);
        setFormKey((k) => k + 1);
        setSheetOpen(false);
      }}
      sheetFormId={sheetFormId}
    />
  );

  if (isPage) {
    return (
      <div
        role="region"
        aria-labelledby="weight-page-title"
        data-testid="weight-page"
        className="min-w-0 space-y-5"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={t.nav.home}
          data-testid="weight-page-back"
          className="bg-card/80 border-border/60 text-foreground hover:bg-secondary flex size-11 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <PageTitle
          id="weight-page-title"
          title={t.weight.pageTitle}
          actions={
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={t.weight.logButton}
              data-testid="weight-page-log"
              onClick={openLog}
              className="text-primary size-11 rounded-full"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </Button>
          }
        />

        {entries.length === 0 ? (
          <section className="bg-card flex flex-col items-center gap-2 rounded-[1.25rem] px-6 py-8 text-center">
            <Scale className="text-primary mb-1 h-9 w-9" aria-hidden="true" />
            <p className="text-[1.0625rem] font-semibold">{t.weight.pageEmptyTitle}</p>
            <p className="text-muted-foreground text-[0.9375rem]">{t.weight.pageEmptyHint}</p>
            <Button type="button" size="lg" className="mt-2 rounded-full px-6" onClick={openLog}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t.weight.logButton}
            </Button>
          </section>
        ) : (
          <>
            <section className="bg-card space-y-4 rounded-[1.25rem] p-5">
              {tilesEl}
              {pendingEl}
            </section>
            <section className="bg-card min-w-0 rounded-[1.25rem] p-5">
              <WeightChart entries={entries} unit={unit} latest={latestDisplay} />
            </section>
            <section className="bg-card min-w-0 rounded-[1.25rem] p-5">{historyEl}</section>
          </>
        )}

        <MobileSheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setEditing(null);
          }}
          title={editing ? t.weight.editTitle : t.weight.logTitle}
          confirm={{
            label: t.common.save,
            onConfirm: () =>
              (document.getElementById(SHEET_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
            testId: 'weight-sheet-save',
          }}
          data-testid="weight-log-sheet"
        >
          {sheetOpen && entryForm(SHEET_FORM_ID)}
        </MobileSheet>
        {deleteDialog}
      </div>
    );
  }

  return (
    <Card
      id={WEIGHT_SECTION_ID}
      aria-labelledby="weight-title"
      role="region"
      tabIndex={-1}
      className="min-w-0 scroll-mt-20 space-y-5 rounded-[1.25rem] p-5 outline-none"
    >
      <div className="flex items-center gap-2.5">
        <Scale className="text-primary h-5 w-5" aria-hidden="true" />
        <div>
          <h2 id="weight-title" className="font-display text-lg font-bold">
            {t.weight.title}
          </h2>
          <p className="text-muted-foreground text-xs">{t.weight.sub}</p>
        </div>
      </div>

      {tilesEl}

      {entryForm()}

      {pendingEl}

      {entries.length === 0 ? (
        <div className="space-y-1 py-4 text-center">
          <p className="text-[1.0625rem] font-semibold">{t.weight.emptyTitle}</p>
          <p className="text-muted-foreground text-[0.9375rem]">{t.weight.emptyHint}</p>
        </div>
      ) : (
        <>
          <WeightChart entries={entries} unit={unit} latest={latestDisplay} />
          {historyEl}
        </>
      )}

      {deleteDialog}
    </Card>
  );
}
