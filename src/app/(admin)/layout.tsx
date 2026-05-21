import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/posts", label: "排程貼文" },
  { href: "/questions", label: "認證題庫" },
  { href: "/groups", label: "群組設定" },
  { href: "/keywords", label: "關鍵字" },
  { href: "/admins", label: "管理員" },
  { href: "/logs", label: "活動記錄" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const isLogin = pathname.endsWith("/login");

  const session = await getSession();
  if (!session.adminId && !isLogin) {
    redirect("/login");
  }
  if (session.adminId && isLogin) {
    redirect("/");
  }
  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <aside className="w-56 border-r border-zinc-200 dark:border-zinc-800 p-4 flex flex-col">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">TG Bot</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{session.firstName ?? session.username}</p>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <LogoutButton />
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
