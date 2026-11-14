'use client';

import { useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { ReportStatus } from '@luki-fitti/common/enums';
import type { AdminReportDto, ResolveReportDto } from '@luki-fitti/common/schemas';
import { adminSocialApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';

const PAGE_SIZE = 25;

/** The evidence avatar route streams auth-gated JPEG; same-origin img carries the cookies. */
const evidenceUrl = (id: string) => `/api/admin/reports/${encodeURIComponent(id)}/avatar`;

export function AdminReports() {
  const { t, format } = useLocale();
  const [status, setStatus] = useState<ReportStatus>(ReportStatus.OPEN);
  const [page, setPage] = useState(1);
  const reports = useAdminResource(
    () => adminSocialApi.reports({ status, page, limit: PAGE_SIZE }),
    `${status}|${page}`,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolve = async (report: AdminReportDto, data: ResolveReportDto) => {
    setBusyId(report.id);
    try {
      const res = await adminSocialApi.resolveReport(report.id, data);
      if (res.success) {
        toast.success(t.admin.reportActionDone);
        reports.reload();
      } else {
        toast.error(t.admin.error);
      }
    } catch {
      toast.error(t.admin.error);
    } finally {
      setBusyId(null);
    }
  };

  const items = reports.data?.items ?? [];
  const total = reports.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4" data-testid="admin-reports">
      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as ReportStatus);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value={ReportStatus.OPEN}>{t.admin.reportStatusOpen}</TabsTrigger>
          <TabsTrigger value={ReportStatus.RESOLVED}>{t.admin.reportStatusResolved}</TabsTrigger>
          <TabsTrigger value={ReportStatus.DISMISSED}>{t.admin.reportStatusDismissed}</TabsTrigger>
        </TabsList>
      </Tabs>

      {reports.loading ? (
        <AdminState />
      ) : reports.error ? (
        <AdminState error={reports.error} onRetry={reports.reload} />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-[0.9375rem]">{t.admin.reportsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="bg-card space-y-3 rounded-[1.25rem] p-4">
              <div className="flex items-start gap-3">
                {r.avatarKeySnapshot && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={evidenceUrl(r.id)}
                    alt={t.admin.reportEvidence}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-medium">
                    {r.handleSnapshot
                      ? `@${r.handleSnapshot}`
                      : (r.nameSnapshot ?? t.admin.reportUnknownUser)}
                  </p>
                  <p className="text-muted-foreground text-[0.8125rem]">
                    {r.reason} · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  {r.details && (
                    <p className="text-muted-foreground mt-1 text-[0.8125rem]">{r.details}</p>
                  )}
                </div>
              </div>
              {r.status === ReportStatus.OPEN && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r, { status: ReportStatus.DISMISSED })}
                  >
                    {t.admin.reportDismiss}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r, { status: ReportStatus.RESOLVED })}
                  >
                    {t.admin.reportResolve}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void resolve(r, { status: ReportStatus.RESOLVED, action: 'CLEAR_AVATAR' })
                    }
                  >
                    {t.admin.reportResolveClearAvatar}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void resolve(r, { status: ReportStatus.RESOLVED, action: 'RESET_HANDLE' })
                    }
                  >
                    {t.admin.reportResolveResetHandle}
                  </Button>
                </div>
              )}
              {r.status !== ReportStatus.OPEN && r.resolvedAt && (
                <p className="text-muted-foreground text-[0.8125rem]">
                  {format(t.admin.reportResolvedAt, {
                    date: new Date(r.resolvedAt).toLocaleDateString(),
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t.admin.previous}
          </Button>
          <span className="text-muted-foreground text-[0.8125rem]">
            {format(t.admin.page, { page, pages })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t.admin.next}
          </Button>
        </div>
      )}
    </div>
  );
}
