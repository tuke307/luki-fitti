import { SiApple } from '@icons-pack/react-simple-icons';

import { APP_STORE_URL } from '@/lib/site/config';

export function AppStoreBadge({ small, big, soon }: { small: string; big: string; soon: string }) {
  const content = (
    <>
      <SiApple size={22} aria-hidden />
      <span className="flex flex-col leading-none">
        <span className="text-[10px]">{small}</span>
        <span className="text-lg font-semibold">{big}</span>
      </span>
    </>
  );
  const badgeClass =
    'h-12 items-center gap-2 rounded-xl border border-white/15 bg-black px-4 text-white';

  if (APP_STORE_URL) {
    return (
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex ${badgeClass}`}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      aria-disabled="true"
      aria-label={`${small} ${big} – ${soon}`}
      className={`relative inline-flex cursor-default opacity-80 ${badgeClass}`}
    >
      {content}
      <span className="bg-primary text-primary-foreground absolute -top-2 -right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase shadow">
        {soon}
      </span>
    </div>
  );
}
