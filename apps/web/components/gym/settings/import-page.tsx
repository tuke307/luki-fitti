'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import type {
  ImportCommitResultDto,
  ImportIssueDto,
  ImportPreviewDto,
} from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import {
  IMPORT_FORMAT_DOC_URL,
  checkImportFile,
  importRequestError,
  type ImportRequestError,
} from '@/lib/import/import-file';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { SettingsRow, SettingsSection } from './settings-row';

type ImportState =
  | { step: 'idle' }
  | { step: 'checking' | 'importing'; fileText?: string; preview?: ImportPreviewDto }
  | { step: 'preview'; fileText: string; preview: ImportPreviewDto }
  | { step: 'done'; result: ImportCommitResultDto }
  | { step: 'error'; error: ImportRequestError | 'invalidJson' }
  | { step: 'invalid'; issues: ImportIssueDto[]; issueCount: number };

const KINDS = ['sessions', 'templates', 'folders', 'customExercises'] as const;

/** Step-by-step migration guides in the public repo. App names stay untranslated. */
const IMPORT_GUIDES = [
  {
    name: 'GymLife',
    url: 'https://github.com/tuke307/luki-fitti/blob/main/docs/gymlife-import.md',
    testId: 'import-guide-gymlife',
  },
  {
    name: 'Alpha Progression',
    url: 'https://github.com/tuke307/luki-fitti/blob/main/docs/alpha-progression-import.md',
    testId: 'import-guide-alpha-progression',
  },
  {
    name: 'MCI',
    url: 'https://github.com/tuke307/luki-fitti/blob/main/docs/mci-import.md',
    testId: 'import-guide-mci',
  },
] as const;

export function ImportPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { t, format, bcp47 } = useLocale();
  const { refreshAllData } = useGym();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const d = t.dataImport;
  const kindLabels = {
    sessions: d.kindSessions,
    templates: d.kindTemplates,
    folders: d.kindFolders,
    customExercises: d.kindCustomExercises,
  };
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(bcp47, { dateStyle: 'medium' });

  const onFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setState({ step: 'checking' });
    const text = file.size > 0 ? await file.text() : '';
    const check = checkImportFile(text, file.size);
    if (!check.ok) {
      setState(
        check.error === 'invalidFile'
          ? { step: 'invalid', issues: check.issues, issueCount: check.issueCount }
          : { step: 'error', error: check.error },
      );
      return;
    }
    try {
      const res = await api.importData.preview(text);
      setState({ step: 'preview', fileText: text, preview: res.data! });
    } catch (error) {
      setState({ step: 'error', error: importRequestError(error) });
    }
  };

  const onCommit = async (fileText: string, preview: ImportPreviewDto) => {
    setState({ step: 'importing', fileText, preview });
    try {
      const res = await api.importData.commit(fileText);
      await refreshAllData();
      setState({ step: 'done', result: res.data! });
    } catch (error) {
      setState({ step: 'error', error: importRequestError(error) });
    }
  };

  const busy = state.step === 'checking' || state.step === 'importing';
  const preview = state.step === 'preview' || state.step === 'importing' ? state.preview : null;
  const hasNew =
    preview && KINDS.some((k) => preview.counts[k].new > 0) && preview.unknownSlugCount === 0;

  return (
    <div className="space-y-4">
      {isAuthenticated ? (
        <Card className="space-y-4 rounded-[1.25rem] p-5" data-testid="import-page">
          <p className="text-muted-foreground text-sm">{d.intro}</p>
          <a
            href={IMPORT_FORMAT_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            data-testid="import-format-doc-link"
          >
            {d.formatHelp}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>

          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="import-file-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />

          <div aria-live="polite" className="space-y-3">
            {state.step === 'checking' && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {d.checking}
              </p>
            )}

            {state.step === 'error' && (
              <p className="text-destructive flex items-start gap-2 text-sm" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {d[state.error]}
              </p>
            )}

            {state.step === 'invalid' && (
              <div className="text-destructive space-y-1.5 text-sm" role="alert">
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {d.invalidFile}
                </p>
                <ul className="bg-destructive/5 max-h-56 space-y-0.5 overflow-auto rounded-xl p-3 font-mono text-xs">
                  {state.issues.map((issue, i) => (
                    <li key={i}>
                      <span className="font-semibold">{issue.path || '(file)'}</span>:{' '}
                      {issue.message}
                    </li>
                  ))}
                  {state.issueCount > state.issues.length && (
                    <li>
                      {format(d.moreIssues, { count: state.issueCount - state.issues.length })}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {preview && (
              <div className="bg-secondary/40 space-y-3 rounded-2xl border p-3.5 text-sm">
                <div>
                  <h3 className="font-display text-base font-bold">{d.previewTitle}</h3>
                  <p className="text-muted-foreground text-xs">
                    {format(d.fromSource, { app: preview.sourceApp })}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {KINDS.map((kind) => (
                    <div key={kind}>
                      <dt className="text-muted-foreground text-xs">{kindLabels[kind]}</dt>
                      <dd className="tabular-nums text-base font-semibold">
                        {preview.counts[kind].total}
                      </dd>
                      <dd className="text-muted-foreground text-xs">
                        {format(d.kindCounts, {
                          new: preview.counts[kind].new,
                          existing: preview.counts[kind].existing,
                        })}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground text-xs">
                  {format(d.newSets, { count: preview.newSets.toLocaleString(bcp47) })}
                  {preview.earliestSessionAt && preview.latestSessionAt && (
                    <>
                      {' · '}
                      {format(d.dateRange, {
                        from: formatDate(preview.earliestSessionAt),
                        to: formatDate(preview.latestSessionAt),
                      })}
                    </>
                  )}
                </p>
                {preview.warnings.map((w) => (
                  <p key={`${w.code}:${w.key}`} className="flex items-start gap-2 text-xs">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                      aria-hidden
                    />
                    {format(d.warningFolderReused, { name: w.name })}
                  </p>
                ))}
                {preview.unknownSlugCount > 0 && (
                  <div className="text-destructive text-xs" role="alert">
                    <p className="font-medium">{d.unknownSlugs}</p>
                    <p className="font-mono break-words">
                      {preview.unknownSlugs.join(', ')}
                      {preview.unknownSlugCount > preview.unknownSlugs.length &&
                        ` ${format(d.moreIssues, {
                          count: preview.unknownSlugCount - preview.unknownSlugs.length,
                        })}`}
                    </p>
                  </div>
                )}
                {preview.unknownSlugCount === 0 && !hasNew && (
                  <p className="text-muted-foreground text-xs">{d.nothingNew}</p>
                )}
              </div>
            )}

            {state.step === 'done' && (
              <div className="flex items-start gap-2 text-sm" role="status">
                <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{d.successTitle}</p>
                  <p className="text-muted-foreground text-xs">
                    {format(d.successBody, {
                      sessions: state.result.counts.sessions.new,
                      templates: state.result.counts.templates.new,
                      folders: state.result.counts.folders.new,
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasNew && (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  state.step === 'preview' && void onCommit(state.fileText, state.preview)
                }
                data-testid="import-commit-btn"
              >
                {state.step === 'importing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                {state.step === 'importing' ? d.importing : d.importButton}
              </Button>
            )}
            <Button
              type="button"
              variant={hasNew ? 'secondary' : 'default'}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              data-testid="import-choose-file-btn"
            >
              <FileUp className="h-4 w-4" aria-hidden />
              {state.step === 'idle' ? d.chooseFile : d.chooseAnother}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="rounded-[1.25rem] p-5" data-testid="import-sign-in-hint">
          <p className="text-muted-foreground text-sm">{d.signInHint}</p>
        </Card>
      )}

      <SettingsSection title={d.guidesTitle} footer={d.guidesFooter}>
        {IMPORT_GUIDES.map((guide) => (
          <SettingsRow
            key={guide.testId}
            href={guide.url}
            external
            title={guide.name}
            icon={BookOpen}
            tone="muted"
            data-testid={guide.testId}
          />
        ))}
      </SettingsSection>
    </div>
  );
}
