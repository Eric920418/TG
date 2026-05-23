import { desc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins, groups, stagingMessages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { PostForm } from "../post-form";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const session = await getSession();
  const [allGroups, stagings, admin] = await Promise.all([
    db
      .select()
      .from(groups)
      .where(eq(groups.isActive, true))
      .orderBy(desc(groups.id)),
    db
      .select()
      .from(stagingMessages)
      .where(
        or(
          isNotNull(stagingMessages.text),
          isNotNull(stagingMessages.mediaFileId),
        ),
      )
      .orderBy(desc(stagingMessages.id))
      .limit(50),
    session.adminId
      ? db
          .select({
            mtprotoSessionEnc: admins.mtprotoSessionEnc,
          })
          .from(admins)
          .where(eq(admins.id, session.adminId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const e = env();
  const apiConfigured = !!(e.MTPROTO_API_ID && e.MTPROTO_API_HASH);
  const mtprotoAvailable =
    apiConfigured && Array.isArray(admin) && !!admin[0]?.mtprotoSessionEnc;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">新增排程</h1>
      <PostForm
        groups={allGroups.map((g) => ({
          chatId: Number(g.chatId),
          title: g.title,
          type: g.type,
        }))}
        stagings={stagings.map((s) => ({
          id: s.id,
          label: s.label,
          hasMedia: s.hasMedia,
          createdAt: s.createdAt,
        }))}
        mtprotoAvailable={mtprotoAvailable}
      />
    </div>
  );
}
