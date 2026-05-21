import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { groups, scheduledPosts } from "@/lib/db/schema";
import { PostForm } from "../post-form";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [row] = await db
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.id, id))
    .limit(1);
  if (!row) notFound();

  const allGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.isActive, true))
    .orderBy(desc(groups.id));

  const activeChatIds = new Set(allGroups.map((g) => Number(g.chatId)));
  const inactiveChatIds = row.targetChatIds.filter(
    (id) => !activeChatIds.has(id),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">編輯排程</h1>
      {inactiveChatIds.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">
            ⚠️ {inactiveChatIds.length} 個目標群已失效（被刪除或停用）
          </p>
          <p className="mt-1 text-xs">
            chat_id: {inactiveChatIds.join(", ")}
          </p>
          <p className="mt-2 text-xs">
            送出時這些群會跳過，建議在下方目標群勾選列重新調整。
          </p>
        </div>
      )}
      <PostForm
        groups={allGroups.map((g) => ({
          chatId: Number(g.chatId),
          title: g.title,
          type: g.type,
        }))}
        initial={{
          id: row.id,
          title: row.title,
          content: row.content,
          targetChatIds: row.targetChatIds,
          sendAt: new Date(row.sendAt),
        }}
      />
    </div>
  );
}
