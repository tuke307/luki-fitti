'use client';

import React, { createContext, useContext, useId } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Minus,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { DrawerTitle } from '@luki-fitti/ui/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@luki-fitti/ui/components/ui/select';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { cn } from '@luki-fitti/ui/lib/utils';

export type SettingsTone =
  'primary' | 'success' | 'warning' | 'destructive' | 'warmup' | 'dropset' | 'stretch' | 'muted';

/** iOS Settings tiles: a solid tint with a white glyph. */
const TONE_CLASSES: Record<SettingsTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  warmup: 'bg-set-warmup',
  dropset: 'bg-set-dropset',
  stretch: 'bg-set-stretch',
  muted: 'bg-[#8e8e93]',
};

/** `true` while the settings render inside the phone Profile sheet (a vaul drawer). */
export const SettingsSheetContext = createContext(false);

const ROW_CLASS =
  'flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-[1.0625rem] leading-snug';
const PRESSABLE_CLASS =
  'hover:bg-secondary/50 active:bg-secondary/70 focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset';

interface SettingsSectionProps {
  title?: string;
  /** Explanation under the group, like an iOS section footer. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  'data-testid'?: string;
}

/** Sentence-case header above an inset-grouped list of rows, with an optional footer. */
export function SettingsSection({ title, footer, children, ...rest }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className="space-y-1.5"
      data-testid={rest['data-testid']}
    >
      {title && (
        <h2 id={headingId} className="text-muted-foreground px-4 text-[0.8125rem]">
          {title}
        </h2>
      )}
      <ul className="bg-card text-card-foreground overflow-hidden rounded-[1.25rem]">{children}</ul>
      {footer && <div className="text-muted-foreground px-4 text-[0.8125rem]">{footer}</div>}
    </section>
  );
}

/** One row of a section: separator inset follows the icon tile when there is one. */
function RowItem({ inset, children }: { inset: boolean; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        'before:bg-border relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:h-px',
        inset ? 'not-first:before:left-[3.625rem]' : 'not-first:before:left-4',
      )}
    >
      {children}
    </li>
  );
}

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: SettingsTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[1.875rem] shrink-0 items-center justify-center rounded-[0.4375rem] text-white',
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="size-[1.125rem]" strokeWidth={2.25} />
    </span>
  );
}

function RowLabel({ title, subtitle, id }: { title: string; subtitle?: string; id?: string }) {
  return (
    <span className="min-w-0 flex-1 py-1">
      <span id={id} className="block">
        {title}
      </span>
      {subtitle && <span className="text-muted-foreground block text-[0.8125rem]">{subtitle}</span>}
    </span>
  );
}

interface SettingsRowProps {
  icon?: LucideIcon;
  tone?: SettingsTone;
  title: string;
  subtitle?: string;
  value?: string;
  onClick?: () => void;
  /** External link target (e.g. mailto:) — rendered as an anchor instead of a button. */
  href?: string;
  /** Opens `href` in a new tab. */
  external?: boolean;
  'data-testid'?: string;
}

/** Tappable settings row: tinted icon tile, title, optional subtitle / trailing value, chevron. */
export function SettingsRow({
  icon,
  tone = 'muted',
  title,
  subtitle,
  value,
  onClick,
  href,
  external,
  ...rest
}: SettingsRowProps) {
  const content = (
    <>
      {icon && <IconTile icon={icon} tone={tone} />}
      <RowLabel title={title} subtitle={subtitle} />
      {value && (
        <span className="text-muted-foreground max-w-[45%] shrink-0 truncate tabular-nums">
          {value}
        </span>
      )}
      <ChevronRight className="text-muted-foreground/70 h-4 w-4 shrink-0" aria-hidden="true" />
    </>
  );
  return (
    <RowItem inset={Boolean(icon)}>
      {href ? (
        <a
          href={href}
          data-testid={rest['data-testid']}
          className={cn(ROW_CLASS, PRESSABLE_CLASS)}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          onClick={onClick}
          data-testid={rest['data-testid']}
          className={cn(ROW_CLASS, PRESSABLE_CLASS)}
        >
          {content}
        </button>
      )}
    </RowItem>
  );
}

interface SettingsSwitchRowProps {
  icon?: LucideIcon;
  tone?: SettingsTone;
  title: string;
  subtitle?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  'data-testid'?: string;
}

/** Boolean setting with an iOS switch; the label names the switch. */
export function SettingsSwitchRow({
  icon,
  tone = 'muted',
  title,
  subtitle,
  checked,
  onCheckedChange,
  ...rest
}: SettingsSwitchRowProps) {
  const labelId = useId();
  return (
    <RowItem inset={Boolean(icon)}>
      <div className={ROW_CLASS}>
        {icon && <IconTile icon={icon} tone={tone} />}
        <RowLabel title={title} subtitle={subtitle} id={labelId} />
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-labelledby={labelId}
          data-testid={rest['data-testid']}
        />
      </div>
    </RowItem>
  );
}

interface SettingsSelectRowProps<T extends string> {
  icon?: LucideIcon;
  tone?: SettingsTone;
  title: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onValueChange: (value: T) => void;
  'data-testid'?: string;
}

/** iOS menu row: title on the left, current value and a ⌃⌄ glyph opening a menu on the right. */
export function SettingsSelectRow<T extends string>({
  icon,
  tone = 'muted',
  title,
  value,
  options,
  onValueChange,
  ...rest
}: SettingsSelectRowProps<T>) {
  return (
    <RowItem inset={Boolean(icon)}>
      <div className={ROW_CLASS}>
        {icon && <IconTile icon={icon} tone={tone} />}
        <RowLabel title={title} />
        <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
          <SelectTrigger
            aria-label={title}
            data-testid={rest['data-testid']}
            className="text-muted-foreground hover:bg-secondary/60 -mr-2 h-11 max-w-[55%] gap-1 rounded-lg border-0 bg-transparent px-2 text-[1.0625rem] shadow-none dark:bg-transparent [&>svg:last-child]:hidden"
          >
            <SelectValue />
            <ChevronsUpDown className="size-4 opacity-70" aria-hidden="true" />
          </SelectTrigger>
          <SelectContent align="end" className="min-w-44 rounded-xl">
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="min-h-11 rounded-lg text-[1.0625rem]"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </RowItem>
  );
}

interface SettingsStepperRowProps {
  title: string;
  valueText: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  decrementLabel: string;
  incrementLabel: string;
  'data-testid'?: string;
}

/** Numeric setting with an iOS-style − / + stepper. */
export function SettingsStepperRow({
  title,
  valueText,
  value,
  min,
  max,
  onChange,
  decrementLabel,
  incrementLabel,
  ...rest
}: SettingsStepperRowProps) {
  const stepClass =
    'flex h-8 w-[2.875rem] items-center justify-center transition-colors active:bg-secondary disabled:opacity-35 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none';
  return (
    <RowItem inset={false}>
      <div className={ROW_CLASS} data-testid={rest['data-testid']}>
        <RowLabel title={title} />
        <span className="text-muted-foreground tabular-nums" aria-live="polite">
          {valueText}
        </span>
        <span className="bg-secondary flex shrink-0 items-center overflow-hidden rounded-lg">
          <button
            type="button"
            aria-label={`${title}, ${valueText}, ${decrementLabel}`}
            disabled={value <= min}
            onClick={() => onChange(Math.max(min, value - 1))}
            className={stepClass}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="bg-border h-4 w-px" />
          <button
            type="button"
            aria-label={`${title}, ${valueText}, ${incrementLabel}`}
            disabled={value >= max}
            onClick={() => onChange(Math.min(max, value + 1))}
            className={stepClass}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </RowItem>
  );
}

interface SettingsButtonRowProps {
  title: string;
  onClick: () => void;
  'data-testid'?: string;
}

/** Plain action row with tinted text (e.g. "Send Test Notification"). */
export function SettingsButtonRow({ title, onClick, ...rest }: SettingsButtonRowProps) {
  return (
    <RowItem inset={false}>
      <button
        type="button"
        onClick={onClick}
        data-testid={rest['data-testid']}
        className={cn(ROW_CLASS, PRESSABLE_CLASS, 'text-primary')}
      >
        {title}
      </button>
    </RowItem>
  );
}

interface SettingsBarProps {
  title: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * Inline navigation bar: leading control, centred title, trailing control. Inside the phone
 * sheet it sticks to the top on a glass background and its title names the sheet.
 */
export function SettingsBar({ title, leading, trailing, headingRef }: SettingsBarProps) {
  const inSheet = useContext(SettingsSheetContext);
  const titleClass =
    'min-w-0 flex-[2] truncate text-center text-[1.0625rem] font-semibold outline-none';
  return (
    <div
      className={cn(
        'flex min-h-14 items-center gap-2',
        inSheet && 'material-bar sticky top-0 z-10 -mx-4 px-2',
      )}
    >
      <div className="flex flex-1 justify-start">{leading}</div>
      {inSheet ? (
        <DrawerTitle ref={headingRef} tabIndex={-1} className={titleClass}>
          {title}
        </DrawerTitle>
      ) : (
        <h1 ref={headingRef} tabIndex={-1} className={titleClass}>
          {title}
        </h1>
      )}
      <div className="flex flex-1 justify-end">{trailing}</div>
    </div>
  );
}

/** 44px round glass button for bar controls (back, minimize). */
export function GlassIconButton({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'material-bar border-border/60 text-foreground focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-full border shadow-[0_2px_12px_rgb(0_0_0/0.08)] transition-transform focus-visible:ring-2 focus-visible:outline-none active:scale-95',
        className,
      )}
      {...props}
    />
  );
}

interface SettingsSubpageProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}

/** Pushed sub-page: glass back button and an inline centred title above the content. */
export function SettingsSubpage({
  title,
  backLabel,
  onBack,
  headingRef,
  children,
}: SettingsSubpageProps) {
  return (
    <div className="space-y-4 pb-12">
      <SettingsBar
        title={title}
        headingRef={headingRef}
        leading={
          <GlassIconButton onClick={onBack} aria-label={backLabel} data-testid="settings-back-btn">
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          </GlassIconButton>
        }
      />
      {children}
    </div>
  );
}
