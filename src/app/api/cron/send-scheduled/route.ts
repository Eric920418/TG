import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledPosts } from "@/lib/db/schema";
import { verifyQstashSignature } from "@/lib/qstash";
import { sendPostToChats } from "@/lib/post-sender";
import { env } from "@/lib/env";
import { log, errorMessage } from "@/lib/log";
import { authorizedBearer } from "@/lib/secret-compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(req: Request, body: string): Promise<boolean> {
  // 優先 QStash 簽章
  const sig = req.headers.get("upstash-signature");
  if (sig) {
    const url = new URL(req.url);
    // Vercel 部署後 url 應該已經是 https 公網位址
    return verifyQstashSignature(sig, body, url.toString());
  }
  // sweep 內部呼叫：用 CRON_SECRET (timing-safe)
  return authorizedBearer(req, env().CRON_SECRET);
}

async function executePost(
  postId: number,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  // CAS：原子搶 pending → sending；搶不到代表另一個 worker 已處理
  const claimed = await db
    .update(scheduledPosts)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(eq(scheduledPosts.id, postId), eq(scheduledPosts.status, "pending")),
    )
    .returning({
      id: scheduledPosts.id,
      content: scheduledPosts.content,
      targetChatIds: scheduledPosts.targetChatIds,
      stagingMessageId: scheduledPosts.stagingMessageId,
    });

  if (claimed.length === 0) {
    return { ok: true, skipped: true };
  }
  const row = claimed[0];

  try {
    const results = await sendPostToChats(
      row.content,
      row.targetChatIds,
      row.stagingMessageId,
    );
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
      .where(eq(scheduledPosts.id, postId));
    await log({
      type: "post.sent",
      payload: { postId, results },
    });
    return { ok: anySuccess };
  } catch (err) {
    const msg = errorMessage(err);
    await db
      .update(scheduledPosts)
      .set({
        status: "failed",
        error: msg,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, postId));
    await log({ type: "post.failed", payload: { postId }, error: msg });
    return { ok: false, error: msg };
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  if (!(await authorized(req, body))) {
    return new Response("unauthorized", { status: 401 });
  }

  let postId: number | undefined;
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  if (idParam) postId = Number(idParam);
  if (!postId && body) {
    try {
      const parsed = JSON.parse(body) as { postId?: number };
      postId = parsed.postId;
    } catch {}
  }

  if (!postId || !Number.isFinite(postId)) {
    return Response.json({ ok: false, error: "missing postId" }, { status: 400 });
  }

  const res = await executePost(postId);
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
