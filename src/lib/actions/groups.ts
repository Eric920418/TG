"use server";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { clearGroupCache } from "@/lib/bot/group-cache";
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

const groupSchema = z.object({
  id: z.number().optional(),
  chatId: z.coerce.number().int(),
  title: z.string().min(1).max(200),
  type: z.enum(["main", "sub"]),
  isActive: z.boolean().default(true),
  simplifiedPolicy: z.enum(["strict", "off"]).default("strict"),
  // 已棄用單一欄位，保留欄位避免破壞 form
  syncTargetChatId: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().nullable(),
  ),
  syncTargetChatIds: z.array(z.coerce.number().int()).default([]),
  raidThreshold: z.coerce.number().int().min(2).max(100).default(5),
  raidWindowSec: z.coerce.number().int().min(5).max(600).default(30),
  warningLimit: z.coerce.number().int().min(1).max(10).default(3),
  muteDurationSec: z.coerce.number().int().min(60).max(2592000).default(86400),
  verifyTimeoutSec: z.coerce.number().int().min(30).max(1800).default(300),
  defaultButtons: z
    .array(z.array(buttonSchema).max(8))
    .max(8)
    .default([]),
});

export async function upsertGroup(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = groupSchema.parse(input);

    // 規則：最多 1 個 active main。試圖設第二個就拒絕
    if (data.type === "main" && data.isActive) {
      const conflicts = await db
        .select({ id: groups.id, title: groups.title, chatId: groups.chatId })
        .from(groups)
        .where(
          and(
            eq(groups.type, "main"),
            eq(groups.isActive, true),
            data.id != null ? ne(groups.id, data.id) : undefined,
          ),
        )
        .limit(1);
      if (conflicts.length > 0) {
        const c = conflicts[0];
        throw new Error(
          `已存在啟用中的主群「${c.title}」(chat_id=${c.chatId})。系統只允許 1 個 active 主群。請先把舊主群停用或刪除，或把這群改為 sub。`,
        );
      }
    }

    const cleanedDefaultButtons = data.defaultButtons.filter(
      (row) => row.length > 0,
    );

    if (data.id) {
      await db
        .update(groups)
        .set({
          chatId: data.chatId,
          title: data.title,
          type: data.type,
          isActive: data.isActive,
          simplifiedPolicy: data.simplifiedPolicy,
          syncTargetChatId: data.syncTargetChatId,
          syncTargetChatIds: data.syncTargetChatIds,
          raidThreshold: data.raidThreshold,
          raidWindowSec: data.raidWindowSec,
          warningLimit: data.warningLimit,
          muteDurationSec: data.muteDurationSec,
          verifyTimeoutSec: data.verifyTimeoutSec,
          defaultButtons: cleanedDefaultButtons,
        })
        .where(eq(groups.id, data.id));
    } else {
      await db.insert(groups).values({
        chatId: data.chatId,
        title: data.title,
        type: data.type,
        isActive: data.isActive,
        simplifiedPolicy: data.simplifiedPolicy,
        syncTargetChatId: data.syncTargetChatId,
        syncTargetChatIds: data.syncTargetChatIds,
        raidThreshold: data.raidThreshold,
        raidWindowSec: data.raidWindowSec,
        warningLimit: data.warningLimit,
        muteDurationSec: data.muteDurationSec,
        verifyTimeoutSec: data.verifyTimeoutSec,
        defaultButtons: cleanedDefaultButtons,
      });
    }
    clearGroupCache(data.chatId);
    revalidatePath("/groups");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deleteGroup(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [row] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    await db.delete(groups).where(eq(groups.id, id));
    if (row) clearGroupCache(Number(row.chatId));
    revalidatePath("/groups");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
