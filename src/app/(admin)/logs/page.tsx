import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  let rows;
  let error: string | null = null;
  try {
    rows = await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(200);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">活動記錄</h1>
        <p className="text-sm text-zinc-500">最近 200 筆</p>
      </div>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold mb-1">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      ) : (rows ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">尚無記錄</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(rows ?? []).map((row) => (
                <div key={row.id} className="p-4 flex flex-col gap-1">
                  <div className="flex justify-between gap-2 items-baseline">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                      {row.type}
                    </span>
                    <time className="text-xs text-zinc-500 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString("zh-TW")}
                    </time>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 flex gap-2 flex-wrap">
                    {row.chatId != null && (
                      <Badge variant="outline">chat {String(row.chatId)}</Badge>
                    )}
                    {row.userId != null && (
                      <Badge variant="outline">user {String(row.userId)}</Badge>
                    )}
                  </div>
                  {row.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1">
                      {row.error}
                    </p>
                  )}
                  {row.payload != null && (
                    <pre className="text-xs text-zinc-500 mt-1 overflow-x-auto">
                      {JSON.stringify(row.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
