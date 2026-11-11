import { SiApple } from '@icons-pack/react-simple-icons';

import { APP_STORE_URL } from '@/lib/site/config';

export function AppStoreBadge({ small, big }: { small: string; big: string }) {
  const badgeClass =
    'h-12 items-center gap-2 rounded-xl border border-white/15 bg-black px-4 text-white';

  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex ${badgeClass}`}
    >
      <SiApple size={22} aria-hidden />
      <span className="flex flex-col leading-none">
        <span className="text-[10px]">{small}</span>
        <span className="text-lg font-semibold">{big}</span>
      </span>
    </a>
  );
}
