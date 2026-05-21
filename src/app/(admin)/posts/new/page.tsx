import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { buttonTemplates, groups } from "@/lib/db/schema";
import { PostForm } from "../post-form";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const [allGroups, templates] = await Promise.all([
    db
      .select()
      .from(groups)
      .where(eq(groups.isActive, true))
      .orderBy(desc(groups.id)),
    db
      .select({
        id: buttonTemplates.id,
        name: buttonTemplates.name,
        buttons: buttonTemplates.buttons,
      })
      .from(buttonTemplates)
      .orderBy(desc(buttonTemplates.id)),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">新增排程</h1>
      <PostForm
        groups={allGroups.map((g) => ({
          chatId: Number(g.chatId),
          title: g.title,
          type: g.type,
        }))}
        templates={templates}
      />
    </div>
  );
}
