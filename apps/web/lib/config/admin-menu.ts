import { BotIcon, LayoutGridIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { AdminPermission } from '@luki-fitti/common/enums';
import type { TranslationDictionary } from '@/lib/i18n';

export interface AdminMenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible when the user holds at least one of these (any-of). */
  permissions: AdminPermission[];
}

const hasAny = (held: readonly string[], required: readonly AdminPermission[]) =>
  required.some((p) => held.includes(p));

/** Admin navigation filtered by the user's permissions. The API enforces the same rules. */
export function getAdminMenu(t: TranslationDictionary, held: readonly string[]): AdminMenuItem[] {
  const items: AdminMenuItem[] = [
    {
      href: '/admin/dashboard',
      label: t.admin.navDashboard,
      icon: LayoutGridIcon,
      permissions: [AdminPermission.DASHBOARD_VIEW],
    },
    {
      href: '/admin/users',
      label: t.admin.navUsers,
      icon: UsersIcon,
      permissions: [AdminPermission.USERS_MANAGE],
    },
    {
      href: '/admin/ai',
      label: t.admin.navAi,
      icon: BotIcon,
      permissions: [AdminPermission.AI_SETTINGS_MANAGE],
    },
  ];
  return items.filter((item) => hasAny(held, item.permissions));
}
