"use server";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { scheduledPosts, stagingMessages } from "@/lib/db/schema";
import { requireAdmin, toError, type ActionResult } from "./guard";

/**
 * 刪除一筆 staging 素材。若有「待發 / 發送中」的排程引用此素材會拒絕，
 * 避免送出時 copyMessage 找不到 staging row 而失敗。
 */
export async function deleteStagingMessage(
  id: number,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const referenced = await db
      .select({
        id: scheduledPosts.id,
        title: scheduledPosts.title,
        status: scheduledPosts.status,
      })
      .from(scheduledPosts)
      .where(eq(scheduledPosts.stagingMessageId, id));

    const blocking = referenced.filter(
      (r) => r.status === "pending" || r.status === "sending",
    );
    if (blocking.length > 0) {
      const list = blocking
        .map((r) => `#${r.id}「${r.title}」(${r.status})`)
        .join("、");
      throw new Error(
        `此素材正被 ${blocking.length} 個排程引用：${list}。請先取消或刪除這些排程再刪素材。`,
      );
    }

    // 已 sent / failed / canceled 的排程仍可能引用 → 把那些 row 的
    // staging_message_id 清成 NULL，保留歷史紀錄但解耦合
    const otherRefIds = referenced
      .filter((r) => !(r.status === "pending" || r.status === "sending"))
      .map((r) => r.id);
    if (otherRefIds.length > 0) {
      await db
        .update(scheduledPosts)
        .set({ stagingMessageId: sql`NULL` })
        .where(inArray(scheduledPosts.id, otherRefIds));
    }

    await db.delete(stagingMessages).where(eq(stagingMessages.id, id));

    revalidatePath("/posts");
    revalidatePath("/posts/new");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
