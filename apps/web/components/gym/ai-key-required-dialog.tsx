'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { openAiKeySettings } from '@/lib/ai/ai-key-required';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';

/**
 * Shown when an AI entry point is tapped without access: signed in without a key →
 * "OpenRouter key required" (opens profile → AI key settings); guest → "Sign in required"
 * (goes to the sign-in page).
 */
export function AiKeyRequiredDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isAuthenticated ? t.aiErrors.keyRequiredTitle : t.aiErrors.signInRequiredTitle}
          </DialogTitle>
          <DialogDescription>
            {isAuthenticated ? t.aiErrors.keyRequiredBody : t.aiErrors.signInRequiredBody}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              if (isAuthenticated) openAiKeySettings();
              else router.push('/login');
            }}
          >
            {isAuthenticated ? t.aiErrors.keyRequiredAction : t.auth.signInBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
