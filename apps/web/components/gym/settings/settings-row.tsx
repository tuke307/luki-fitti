'use client';

import React, { useId } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { cn } from '@luki-fitti/ui/lib/utils';

export type SettingsTone =
  'primary' | 'success' | 'warning' | 'destructive' | 'warmup' | 'dropset' | 'stretch' | 'muted';

const TONE_CLASSES: Record<SettingsTone, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  warmup: 'bg-set-warmup/15 text-set-warmup',
  dropset: 'bg-set-dropset/15 text-set-dropset',
  stretch: 'bg-set-stretch/15 text-set-stretch',
  muted: 'bg-secondary text-muted-foreground',
};

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

/** Uppercase section header above a rounded card of `SettingsRow`s. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-1.5">
      <h2
        id={headingId}
        className="text-muted-foreground px-4 text-xs font-semibold tracking-wide uppercase"
      >
        {title}
      </h2>
      <ul className="bg-card text-card-foreground overflow-hidden rounded-[1.25rem]">{children}</ul>
    </section>
  );
}

interface SettingsRowProps {
  icon: LucideIcon;
  tone: SettingsTone;
  title: string;
  subtitle?: string;
  value?: string;
  onClick: () => void;
  'data-testid'?: string;
}

/** Tappable settings row: tinted icon tile, title, optional subtitle / trailing value, chevron. */
export function SettingsRow({
  icon: Icon,
  tone,
  title,
  subtitle,
  value,
  onClick,
  ...rest
}: SettingsRowProps) {
  return (
    <li className="before:bg-border relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-15 not-first:before:h-px">
      <button
        type="button"
        onClick={onClick}
        data-testid={rest['data-testid']}
        className="hover:bg-secondary/50 active:bg-secondary/70 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-[1.0625rem] w-[1.0625rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">{title}</span>
          {subtitle && (
            <span className="text-muted-foreground block truncate text-[0.8125rem]">
              {subtitle}
            </span>
          )}
        </span>
        {value && (
          <span className="text-muted-foreground max-w-[45%] shrink-0 truncate text-[0.875rem] tabular-nums">
            {value}
          </span>
        )}
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </li>
  );
}

interface SettingsSubpageProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}

/** Sub-page shell with a back button and title; content keeps its existing cards. */
export function SettingsSubpage({
  title,
  backLabel,
  onBack,
  headingRef,
  children,
}: SettingsSubpageProps) {
  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label={backLabel}
          data-testid="settings-back-btn"
          className="-ml-2 h-11 w-11 shrink-0"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl font-bold tracking-tight outline-none"
        >
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
}
