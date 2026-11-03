'use client';

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
import { useLocale } from '@/providers/i18n/locale-context';

/** "An OpenRouter key is required" — shown when an AI entry point is tapped without a key. */
export function AiKeyRequiredDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.aiErrors.keyRequiredTitle}</DialogTitle>
          <DialogDescription>{t.aiErrors.keyRequiredBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              openAiKeySettings();
            }}
          >
            {t.aiErrors.keyRequiredAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
