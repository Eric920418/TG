import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

type NavItem = { href: string; label: string; highlight?: boolean };

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/posts", label: "排程貼文" },
  { href: "/questions", label: "認證題庫" },
  { href: "/groups", label: "群組設定" },
  { href: "/keywords", label: "關鍵字守門" },
  { href: "/upgrade", label: "⭐ 升級", highlight: true },
];

function navItemClasses(highlight?: boolean): string {
  if (highlight) {
    return "rounded-md px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-100 to-amber-200 text-amber-900 hover:from-amber-200 hover:to-amber-300 dark:from-amber-900/40 dark:to-amber-700/40 dark:text-amber-100 dark:hover:from-amber-800/50 transition-colors";
  }
  return "rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";
}

function navItemClassesMobile(highlight?: boolean): string {
  if (highlight) {
    return "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-amber-100 to-amber-200 text-amber-900 dark:from-amber-900/40 dark:to-amber-700/40 dark:text-amber-100";
  }
  return "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const isLogin = pathname.endsWith("/login");

  const session = await getSession();
  if (!session.adminId && !isLogin) redirect("/login");
  if (session.adminId && isLogin) redirect("/");
  if (isLogin) return <>{children}</>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              TG Bot 後台
            </Link>
            <nav className="hidden gap-1 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navItemClasses(item.highlight)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {session.firstName ?? session.username ?? `id:${session.telegramId}`}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-zinc-200 px-4 py-2 md:hidden dark:border-zinc-800">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={navItemClassesMobile(item.highlight)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
