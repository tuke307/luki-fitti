'use client';

import React from 'react';
import { SetType } from '@luki-fitti/common/enums';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@luki-fitti/ui/components/ui/dropdown-menu';
import { useLocale } from '@/providers/i18n/locale-context';
import { SetTypeBadge } from './set-type-badge';

export const SET_TYPE_ORDER = [
  SetType.WARMUP,
  SetType.WORKING,
  SetType.DROPSET,
  SetType.STRETCH,
] as const;

/** Types a logged strength set can be corrected to; stretches stay stretches. */
export const STRENGTH_SET_TYPES = [SetType.WARMUP, SetType.WORKING, SetType.DROPSET] as const;

interface SetTypeMenuProps {
  setType: SetType;
  onSetTypeChange: (setType: SetType) => void;
  /** 1-based set number, for the accessible label. */
  setNumber: number;
  badgeLabel: string;
  completed: boolean;
  size?: 'md' | 'sm';
  types?: ReadonlyArray<SetType>;
  /** Extra items below the type picker, e.g. Delete. */
  children?: React.ReactNode;
}

/** The set badge as a button that opens the set type picker. */
export function SetTypeMenu({
  setType,
  onSetTypeChange,
  setNumber,
  badgeLabel,
  completed,
  size = 'md',
  types = SET_TYPE_ORDER,
  children,
}: SetTypeMenuProps) {
  const { t, format, setTypeLabel } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="set-menu-trigger"
          aria-label={format(t.a11y.setTypeMenu, { n: setNumber, type: setTypeLabel(setType) })}
          className="focus-visible:ring-ring/50 -m-1 flex size-11 shrink-0 items-center justify-center rounded-full outline-hidden focus-visible:ring-[3px]"
        >
          <SetTypeBadge setType={setType} label={badgeLabel} completed={completed} size={size} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{t.session.setTypeHeading}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={setType}
          onValueChange={(v) => onSetTypeChange(v as SetType)}
        >
          {types.map((type) => (
            <DropdownMenuRadioItem key={type} value={type}>
              {setTypeLabel(type)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
