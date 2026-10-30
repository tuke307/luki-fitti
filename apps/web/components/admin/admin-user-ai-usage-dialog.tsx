'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AiUsageView } from '@/components/gym/ai-usage/ai-usage-view';

/** Per-user AI drill-down for admins (same breakdown the user sees for themselves). */
export function AdminUserAiUsageDialog({
  user,
  onClose,
}: {
  user: { id: string; email: string } | null;
  onClose: () => void;
}) {
  const { t, format } = useLocale();
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      {user && (
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="px-5 pt-5 pb-3 text-left">
            <DialogTitle className="truncate">
              {format(t.aiUsage.adminDetailTitle, { email: user.email })}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <AiUsageView key={user.id} load={(days) => api.admin.userAiUsage(user.id, days)} />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
