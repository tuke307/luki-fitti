'use client';

import React from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@luki-fitti/ui/components/ui/drawer';
import { cn } from '@luki-fitti/ui/lib/utils';
import { useLocale } from '@/providers/i18n/locale-context';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface MobileSheetConfirm {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
}

export interface MobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Leading top-bar action on phones; defaults to a 'Cancel' button that closes. */
  cancelLabel?: string;
  /** Trailing primary action (e.g. Save / Create / Done). Omit for read-only sheets. */
  confirm?: MobileSheetConfirm;
  /** Hide the leading cancel (e.g. a 'Done'-only sheet). */
  hideCancel?: boolean;
  /** Accessible description, visually hidden by default. */
  description?: string;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const MD_UP_QUERY = '(min-width: 48rem)';

/**
 * iOS-style modal sheet: a near-full-height vaul drawer with a Cancel / Title / Confirm top bar
 * on phones, and the platform's centred dialog with footer buttons at `md` and up.
 */
export function MobileSheet({
  open,
  onOpenChange,
  title,
  cancelLabel,
  confirm,
  hideCancel = false,
  description,
  children,
  className,
  ...rest
}: MobileSheetProps) {
  const { t } = useLocale();
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const cancelText = cancelLabel ?? t.common.cancel;
  const close = () => onOpenChange(false);
  const confirmDisabled = confirm?.disabled || confirm?.loading;

  // Defer mounting the vaul layer by one frame: when the sheet is opened from a Radix
  // menu/popover/dialog item, both layers mount in the same commit and the menu's
  // scroll-lock cleanup can leave `pointer-events: none` on <body> after the sheet closes.
  const [deferredOpen, setDeferredOpen] = React.useState(false);
  React.useEffect(() => {
    if (isDesktop) return;
    const frame = requestAnimationFrame(() => setDeferredOpen(open));
    return () => cancelAnimationFrame(frame);
  }, [open, isDesktop]);
  const sheetOpen = deferredOpen && open;

  // Radix dismissable layers hear Escape in the bubbling phase and swallow it for sheets
  // stacked inside them; a capture listener closes the top sheet first (and only that one).
  React.useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [sheetOpen, onOpenChange]);

  // If a stacked-layer close left the scroll-lock style on <body>, restore it once nothing
  // modal is left on screen.
  React.useEffect(() => {
    if (open || sheetOpen) return;
    const frame = requestAnimationFrame(() => {
      if (
        document.body.style.pointerEvents === 'none' &&
        !document.querySelector('[data-vaul-drawer], [role="dialog"][data-state="open"]')
      ) {
        document.body.style.pointerEvents = '';
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, sheetOpen]);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={className} data-testid={rest['data-testid']}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
          </DialogHeader>
          {children}
          {(!hideCancel || confirm) && (
            <DialogFooter>
              {!hideCancel && (
                <Button type="button" variant="secondary" onClick={close}>
                  {cancelText}
                </Button>
              )}
              {confirm && (
                <Button
                  type="button"
                  onClick={confirm.onConfirm}
                  disabled={confirmDisabled}
                  data-testid={confirm.testId}
                >
                  {confirm.label}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={sheetOpen} onOpenChange={onOpenChange}>
      <DrawerContent
        data-testid={rest['data-testid']}
        className={cn(
          'rounded-t-[1.25rem] data-[vaul-drawer-direction=bottom]:top-[calc(env(safe-area-inset-top,0px)+0.75rem)] data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none',
          className,
        )}
      >
        <div className="border-border/60 flex items-center gap-2 border-b px-2">
          <div className="flex min-w-12 flex-1 justify-start">
            {!hideCancel && (
              <button
                type="button"
                onClick={close}
                className="text-primary min-h-11 px-2 text-[0.9375rem]"
              >
                {cancelText}
              </button>
            )}
          </div>
          <DrawerTitle className="line-clamp-2 min-w-0 flex-[2.5] text-center text-[1rem] leading-snug font-bold">
            {title}
          </DrawerTitle>
          <div className="flex min-w-12 flex-1 justify-end">
            {confirm && (
              <button
                type="button"
                onClick={confirm.onConfirm}
                disabled={confirmDisabled}
                data-testid={confirm.testId}
                className="text-primary min-h-11 px-2 text-[0.9375rem] font-semibold disabled:opacity-40"
              >
                {confirm.label}
              </button>
            )}
          </div>
        </div>
        <DrawerDescription className="sr-only">{description ?? title}</DrawerDescription>
        <div className="flex-1 overflow-y-auto px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
