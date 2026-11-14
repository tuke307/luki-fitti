'use client';

import React, { useState } from 'react';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { ReportReason } from '@luki-fitti/common/enums';
import type { SocialCardDto } from '@luki-fitti/common/schemas';
import { socialApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';
import { MobileSheet } from '../mobile-sheet';

const REASONS: Array<{ value: ReportReason; key: keyof ReasonsT }> = [
  { value: ReportReason.SPAM, key: 'reportReasonSpam' },
  { value: ReportReason.HARASSMENT, key: 'reportReasonHarassment' },
  { value: ReportReason.INAPPROPRIATE_NAME, key: 'reportReasonInappropriateName' },
  { value: ReportReason.INAPPROPRIATE_AVATAR, key: 'reportReasonInappropriateAvatar' },
  { value: ReportReason.OTHER, key: 'reportReasonOther' },
];

type ReasonsT = {
  reportReasonSpam: string;
  reportReasonHarassment: string;
  reportReasonInappropriateName: string;
  reportReasonInappropriateAvatar: string;
  reportReasonOther: string;
};

const MAX_DETAILS = 500;

/** Report sheet: reason list + optional details, POSTs /social/reports. */
export function ReportSheet({
  user,
  onOpenChange,
}: {
  user: SocialCardDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, format } = useLocale();
  const [reason, setReason] = useState<ReportReason>(ReportReason.SPAM);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const [prevUser, setPrevUser] = useState(user?.userId ?? null);
  if ((user?.userId ?? null) !== prevUser) {
    setPrevUser(user?.userId ?? null);
    setReason(ReportReason.SPAM);
    setDetails('');
  }

  const submit = async () => {
    if (!user) return;
    setSending(true);
    try {
      await socialApi.report({
        userId: user.userId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      toast.success(t.social.reportSent);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '');
    } finally {
      setSending(false);
    }
  };

  return (
    <MobileSheet
      open={user !== null}
      onOpenChange={onOpenChange}
      title={user ? format(t.social.reportTitle, { handle: `@${user.handle}` }) : t.social.report}
      confirm={{
        label: t.social.reportSubmit,
        onConfirm: () => void submit(),
        loading: sending,
      }}
      data-testid="report-sheet"
    >
      <div className="space-y-4" role="radiogroup" aria-label={t.social.report}>
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-3 text-[0.9375rem]">
            <input
              type="radio"
              name="report-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              data-testid={`report-reason-${r.value}`}
            />
            {t.social[r.key]}
          </label>
        ))}
        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
          placeholder={t.social.reportDetails}
          rows={3}
          data-testid="report-details"
        />
      </div>
    </MobileSheet>
  );
}
