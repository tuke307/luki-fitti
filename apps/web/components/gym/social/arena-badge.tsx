'use client';

import React from 'react';
import type { Arena } from '@luki-fitti/common/enums';
import { ARENA_STYLE, arenaTier } from '@luki-fitti/common/league';

let gradientSeq = 0;

/**
 * SVG arena shield: vertical gradient fill, ring stroke and one pip per tier
 * step (Bronze 1 … Titan 7). Always pair with a text label — colour alone is
 * never the only signal.
 */
export function ArenaBadge({
  arena,
  size = 32,
  className,
}: {
  arena: Arena;
  size?: number;
  className?: string;
}) {
  const style = ARENA_STYLE[arena];
  const tier = arenaTier(arena);
  const [gradientId] = React.useState(() => `arena-grad-${(gradientSeq += 1)}`);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={className}
      data-testid={`arena-badge-${arena.toLowerCase()}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={style.from} />
          <stop offset="100%" stopColor={style.to} />
        </linearGradient>
      </defs>
      <path
        d="M20 2 L34 7 V19 C34 29 28 35.5 20 38 C12 35.5 6 29 6 19 V7 Z"
        fill={`url(#${gradientId})`}
        stroke={style.ring}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {Array.from({ length: tier }, (_, i) => (
        <circle
          key={i}
          cx={20 - ((tier - 1) * 3) / 2 + i * 3}
          cy={22}
          r={1.4}
          fill="#0B0B0C"
          fillOpacity={0.65}
        />
      ))}
    </svg>
  );
}
