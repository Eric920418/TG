"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { scheduledPosts } from "@/lib/db/schema";
import { qstash } from "@/lib/qstash";
import { env } from "@/lib/env";
import { requireAdmin, toError, type ActionResult } from "./guard";

const buttonSchema = z.union([
  z.object({
    text: z.string().min(1).max(64),
    url: z.string().url(),
  }),
  z.object({
    text: z.string().min(1).max(64),
    copyText: z.string().min(1).max(256),
  }),
]);

const contentSchema = z.object({
  text: z.string().optional(),
  parseMode: z.enum(["HTML", "MarkdownV2"]).optional(),
  disableWebPagePreview: z.boolean().optional(),
  media: z
    .array(
      z.object({
        type: z.enum(["photo", "video", "document", "animation"]),
        // 可以是 http(s) URL 或 Telegram file_id（後台上傳後拿到的）
        url: z.string().min(1).max(500),
        caption: z.string().optional(),
      }),
    )
    .max(10)
    .optional(),
  buttons: z.array(z.array(buttonSchema)).optional(),
});

const postSchema = z.object({
  id: z.number().optional(),
  title: z.string().min(1).max(200),
  content: contentSchema,
  targetChatIds: z.array(z.coerce.number().int()).min(1, "至少選一個目標群"),
  sendAt: z.coerce.date(),
});

async function scheduleQstash(postId: number, sendAt: Date): Promise<string> {
  const url = `${env().NEXT_PUBLIC_BASE_URL}/api/cron/send-scheduled?id=${postId}`;
  const notBefore = Math.floor(sendAt.getTime() / 1000);
  const res = await qstash().publishJSON({
    url,
    body: { postId },
    notBefore,
    retries: 3,
  });
  return res.messageId;
}

export async function createPost(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = postSchema.parse(input);
    if (!data.content.text && (!data.content.media || data.content.media.length === 0)) {
      throw new Error("必須有文字或媒體");
    }
    if (data.sendAt.getTime() < Date.now() - 60_000) {
      throw new Error("發送時間不可為過去");
    }
    const [row] = await db
      .insert(scheduledPosts)
      .values({
        title: data.title,
        content: data.content,
        targetChatIds: data.targetChatIds,
        sendAt: data.sendAt,
        status: "pending",
      })
      .returning();

    try {
      const messageId = await scheduleQstash(row.id, data.sendAt);
      await db
        .update(scheduledPosts)
        .set({ qstashMessageId: messageId })
        .where(eq(scheduledPosts.id, row.id));
    } catch (err) {
      // QStash 失敗仍保留 DB 紀錄，sweep cron 會兜底
      await db
        .update(scheduledPosts)
        .set({ error: `QStash schedule failed: ${toError(err)}` })
        .where(eq(scheduledPosts.id, row.id));
    }

    revalidatePath("/posts");
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function updatePost(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = postSchema.parse(input);
    if (!data.id) throw new Error("缺少 id");

    const [existing] = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, data.id))
      .limit(1);
    if (!existing) throw new Error("貼文不存在");
    if (existing.status !== "pending") {
      throw new Error(`狀態為 ${existing.status}，無法編輯`);
    }

    // 取消舊 QStash 排程
    if (existing.qstashMessageId) {
      try {
        await qstash().messages.delete(existing.qstashMessageId);
      } catch {
        // 已經發出去或不存在
      }
    }

    await db
      .update(scheduledPosts)
      .set({
        title: data.title,
        content: data.content,
        targetChatIds: data.targetChatIds,
        sendAt: data.sendAt,
        error: null,
        qstashMessageId: null,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, data.id));

    try {
      const messageId = await scheduleQstash(data.id, data.sendAt);
      await db
        .update(scheduledPosts)
        .set({ qstashMessageId: messageId })
        .where(eq(scheduledPosts.id, data.id));
    } catch (err) {
      await db
        .update(scheduledPosts)
        .set({ error: `QStash schedule failed: ${toError(err)}` })
        .where(eq(scheduledPosts.id, data.id));
    }

    revalidatePath("/posts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function cancelPost(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [row] = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, id))
      .limit(1);
    if (!row) throw new Error("不存在");
    if (row.status !== "pending") {
      throw new Error(`狀態為 ${row.status}，僅 pending 可取消`);
    }
    if (row.qstashMessageId) {
      try {
        await qstash().messages.delete(row.qstashMessageId);
      } catch {}
    }
    await db
      .update(scheduledPosts)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(scheduledPosts.id, id));
    revalidatePath("/posts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deletePost(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [row] = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, id))
      .limit(1);
    if (!row) throw new Error("不存在");
    if (row.qstashMessageId && row.status === "pending") {
      try {
        await qstash().messages.delete(row.qstashMessageId);
      } catch {}
    }
    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));
    revalidatePath("/posts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
