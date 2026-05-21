import Link from "next/link";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityLogs,
  broadcasts,
  groups,
  scheduledPosts,
  warnings,
} from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function loadStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    [{ groupCount }],
    [{ pendingPosts }],
    [{ sentPosts24h }],
    [{ broadcasts24h }],
    [{ warnings24h }],
    recentLogs,
  ] = await Promise.all([
    db.select({ groupCount: count() }).from(groups).where(eq(groups.isActive, true)),
    db.select({ pendingPosts: count() }).from(scheduledPosts).where(eq(scheduledPosts.status, "pending")),
    db
      .select({ sentPosts24h: count() })
      .from(scheduledPosts)
      .where(sql`${scheduledPosts.status} = 'sent' AND ${scheduledPosts.sentAt} > ${since}`),
    db
      .select({ broadcasts24h: count() })
      .from(broadcasts)
      .where(gte(broadcasts.createdAt, since)),
    db
      .select({ warnings24h: count() })
      .from(warnings)
      .where(gte(warnings.lastAt, since)),
    db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(10),
  ]);
  return {
    groupCount,
    pendingPosts,
    sentPosts24h,
    broadcasts24h,
    warnings24h,
    recentLogs,
  };
}

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof loadStats>> | null = null;
  let loadError: string | null = null;
  try {
    stats = await loadStats();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (loadError || !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="mb-1 font-semibold">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{loadError}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">最近 24 小時概況</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat title="啟用群組" value={stats.groupCount} />
        <Stat title="待發排程" value={stats.pendingPosts} href="/posts" />
        <Stat title="24h 已發送" value={stats.sentPosts24h} />
        <Stat title="24h 同步廣告" value={stats.broadcasts24h} />
        <Stat title="24h 違規警告" value={stats.warnings24h} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">近期活動</CardTitle>
          <CardDescription>bot 最新事件（如需更完整紀錄，可付費加購活動記錄頁）</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentLogs.length === 0 ? (
            <p className="text-sm text-zinc-500">尚無記錄</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.recentLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex justify-between gap-2 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800"
                >
                  <div className="min-w-0 flex-1">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {log.type}
                    </span>
                    {log.error && (
                      <span className="ml-2 text-xs text-red-600 dark:text-red-400">{log.error}</span>
                    )}
                  </div>
                  <time className="whitespace-nowrap text-xs text-zinc-500">
                    {new Date(log.createdAt).toLocaleString("zh-TW")}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  title,
  value,
  href,
}: {
  title: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <Card className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
