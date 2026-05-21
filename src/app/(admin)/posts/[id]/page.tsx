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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">編輯排程</h1>
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
