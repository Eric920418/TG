import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledPosts } from "@/lib/db/schema";
import { sendPostToChats } from "@/lib/post-sender";
import { env } from "@/lib/env";
import { log, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${env().CRON_SECRET}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  const now = new Date();
  const rows = await db
    .select()
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.status, "pending"), lt(scheduledPosts.sendAt, now)));

  let executed = 0;
  let failed = 0;

  for (const row of rows) {
    await db
      .update(scheduledPosts)
      .set({ status: "sending", updatedAt: new Date() })
      .where(eq(scheduledPosts.id, row.id));

    try {
      const results = await sendPostToChats(row.content, row.targetChatIds);
      const anySuccess = results.some((r) => r.messageId != null);
      const errors = results.filter((r) => r.error).map((r) => `${r.chatId}: ${r.error}`);
      await db
        .update(scheduledPosts)
        .set({
          status: anySuccess ? "sent" : "failed",
          results,
          sentAt: new Date(),
          error: errors.length > 0 ? errors.join("\n") : null,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, row.id));
      if (anySuccess) executed++;
      else failed++;
      await log({
        type: "post.sweep_executed",
        payload: { postId: row.id, results },
      });
    } catch (err) {
      const msg = errorMessage(err);
      await db
        .update(scheduledPosts)
        .set({ status: "failed", error: msg, updatedAt: new Date() })
        .where(eq(scheduledPosts.id, row.id));
      failed++;
      await log({ type: "post.sweep_failed", payload: { postId: row.id }, error: msg });
    }
  }

  return Response.json({ ok: true, executed, failed, total: rows.length });
}
