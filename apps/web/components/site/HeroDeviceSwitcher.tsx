'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

export interface HeroDevice {
  id: string;
  label: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Responsive display-width classes for the image (e.g. `w-[300px] lg:w-[360px]`). */
  displayWidth: string;
}

/**
 * Hero device switcher: WAI-ARIA tabs pick the same product moment on iPhone, iPad or
 * Apple Watch. Panels stack in a grid so the container always takes the tallest
 * device's height — switching causes no layout shift. Non-iPhone images mount lazily,
 * after the first hover, focus or selection on the tablist.
 */
export function HeroDeviceSwitcher({
  devices,
  tablistLabel,
}: {
  devices: HeroDevice[];
  tablistLabel: string;
}) {
  const [selected, setSelected] = useState(0);
  const [warm, setWarm] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    setWarm(true);
    setSelected(index);
    tabRefs.current[index]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = devices.length;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (selected + 1) % n;
    else if (e.key === 'ArrowLeft') next = (selected - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next !== null) {
      e.preventDefault();
      select(next);
    }
  };

  const image = (device: HeroDevice, index: number) => (
    <Image
      src={device.src}
      alt={device.alt}
      width={device.width}
      height={device.height}
      priority={index === 0}
      unoptimized
      className={`h-auto drop-shadow-[0_40px_80px_rgba(0,0,0,0.6)] ${device.displayWidth}`}
    />
  );

  // A single device needs no control — just the image.
  if (devices.length <= 1) {
    const only = devices[0];
    return only ? image(only, 0) : null;
  }

  return (
    <div data-testid="hero-device-switcher">
      <div className="grid">
        {devices.map((device, i) => {
          const active = i === selected;
          return (
            <div
              key={device.id}
              id={`hero-device-panel-${device.id}`}
              data-testid={`hero-device-panel-${device.id}`}
              role="tabpanel"
              aria-labelledby={`hero-device-tab-${device.id}`}
              inert={!active}
              aria-hidden={!active}
              className={`col-start-1 row-start-1 flex items-end justify-center transition-opacity duration-200 motion-reduce:transition-none ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {(i === 0 || warm) && image(device, i)}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-center">
        <div
          role="tablist"
          aria-label={tablistLabel}
          onKeyDown={onKeyDown}
          onPointerEnter={() => setWarm(true)}
          onFocus={() => setWarm(true)}
          className="bg-secondary inline-grid rounded-full p-1"
          style={{ gridTemplateColumns: `repeat(${devices.length}, minmax(0, 1fr))` }}
        >
          {devices.map((device, i) => (
            <button
              key={device.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`hero-device-tab-${device.id}`}
              data-testid={`hero-device-tab-${device.id}`}
              role="tab"
              type="button"
              aria-selected={i === selected}
              aria-controls={`hero-device-panel-${device.id}`}
              tabIndex={i === selected ? 0 : -1}
              onClick={() => select(i)}
              className={`focus-visible:ring-ring h-11 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 ${
                i === selected
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-foreground/30 hover:text-foreground'
              }`}
            >
              {device.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
