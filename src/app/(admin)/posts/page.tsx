import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledPosts } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { PostActions } from "./post-actions";

export const dynamic = "force-dynamic";

function statusBadge(s: string) {
  const variant =
    s === "sent"
      ? "success"
      : s === "failed"
      ? "destructive"
      : s === "canceled"
      ? "secondary"
      : "default";
  return <Badge variant={variant as never}>{s}</Badge>;
}

export default async function PostsPage() {
  let rows;
  let error: string | null = null;
  try {
    rows = await db.select().from(scheduledPosts).orderBy(desc(scheduledPosts.sendAt));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold">排程貼文</h1>
          <p className="text-sm text-zinc-500">建立、編輯、查看狀態</p>
        </div>
        <Link href="/posts/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            新增排程
          </Button>
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold mb-1">資料載入失敗</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      ) : (rows ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">尚無排程</p>
      ) : (
        <div className="space-y-2">
          {(rows ?? []).map((row) => (
            <Card key={row.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="font-medium">{row.title}</p>
                      {statusBadge(row.status)}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {new Date(row.sendAt).toLocaleString("zh-TW")} → chats:{" "}
                      <span className="font-mono">{row.targetChatIds.join(", ")}</span>
                    </p>
                    {row.error && (
                      <pre className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
                        {row.error}
                      </pre>
                    )}
                  </div>
                  <PostActions
                    postId={row.id}
                    status={row.status}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
