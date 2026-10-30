"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommunityIcon, HomeIcon, MessageIcon, ProfileIcon, TrainingIcon } from "@/components/icons";
import { CountBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export type NavCounts = { notifications: number; messages: number; community: number };

const ITEMS = [
  { href: "/hjem", label: "Hjem", Icon: HomeIcon, count: null },
  { href: "/faellesskab", label: "Fællesskab", Icon: CommunityIcon, count: "community" },
  { href: "/beskeder", label: "Beskeder", Icon: MessageIcon, count: "messages" },
  { href: "/min-traening", label: "Min træning", Icon: TrainingIcon, count: null },
  { href: "/min-profil", label: "Min profil", Icon: ProfileIcon, count: null },
] as const;

const COUNT_LABELS = { community: "nye beskeder i fællesskabet", messages: "ulæste beskeder", notifications: "ulæste notifikationer" };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar navigation. */
export function MemberSidebarNav({ counts, isAdmin }: { counts: NavCounts; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hovedmenu" className="space-y-1">
      {ITEMS.map(({ href, label, count }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-md px-3 text-lg font-semibold",
              active ? "bg-brand text-white" : "text-ink hover:bg-muted",
            )}
          >
            <span className="flex-1">{label}</span>
            {count ? <CountBadge count={counts[count]} label={COUNT_LABELS[count]} /> : null}
          </Link>
        );
      })}
      <Link
        href="/notifikationer"
        aria-current={isActive(pathname, "/notifikationer") ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-md px-3 text-lg font-semibold",
          isActive(pathname, "/notifikationer") ? "bg-brand text-white" : "text-ink hover:bg-muted",
        )}
      >
        <span className="flex-1">Notifikationer</span>
        <CountBadge count={counts.notifications} label={COUNT_LABELS.notifications} />
      </Link>
      {isAdmin ? (
        <Link
          href="/admin"
          className="mt-4 flex min-h-12 items-center gap-3 rounded-md border-2 border-brand px-3 text-lg font-semibold text-brand hover:bg-brand-soft"
        >
          <span>Administration</span>
        </Link>
      ) : null}
    </nav>
  );
}

/** Mobile bottom navigation: five destinations, always with text labels. */
export function MemberBottomNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hovedmenu" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, Icon, count }) => {
          const active = isActive(pathname, href);
          const value = count ? counts[count] : 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-[0.8rem] font-semibold leading-tight",
                  active ? "text-brand" : "text-ink-soft",
                )}
              >
                <span className={cn("rounded-full px-3 py-0.5", active && "bg-brand-soft")}>
                  <Icon />
                </span>
                <span>{label}</span>
                {value ? (
                  <span className="absolute right-[18%] top-1">
                    <CountBadge count={value} label={count ? COUNT_LABELS[count] : ""} />
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile top-bar link to notifications with a visible label. */
export function MobileNotificationsLink({ count }: { count: number }) {
  return (
    <Link href="/notifikationer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold text-ink hover:bg-muted">
      <span>Notifikationer</span>
      <CountBadge count={count} label={COUNT_LABELS.notifications} />
    </Link>
  );
}
