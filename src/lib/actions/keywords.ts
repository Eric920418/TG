"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { keywordBlacklist } from "@/lib/db/schema";
import { clearKeywordCache } from "@/lib/bot/handlers/keyword";
import { requireAdmin, toError, type ActionResult } from "./guard";

const schema = z.object({
  id: z.number().optional(),
  pattern: z.string().min(1).max(500),
  type: z.enum(["contains", "regex", "link", "mention"]),
  action: z.enum(["delete", "warn", "ban"]).default("delete"),
  chatId: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().nullable(),
  ),
  isActive: z.boolean().default(true),
});

export async function upsertKeyword(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = schema.parse(input);
    if (data.id) {
      await db
        .update(keywordBlacklist)
        .set({
          pattern: data.pattern,
          type: data.type,
          action: data.action,
          chatId: data.chatId,
          isActive: data.isActive,
        })
        .where(eq(keywordBlacklist.id, data.id));
    } else {
      await db.insert(keywordBlacklist).values({
        pattern: data.pattern,
        type: data.type,
        action: data.action,
        chatId: data.chatId,
        isActive: data.isActive,
      });
    }
    clearKeywordCache();
    revalidatePath("/keywords");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deleteKeyword(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.delete(keywordBlacklist).where(eq(keywordBlacklist.id, id));
    clearKeywordCache();
    revalidatePath("/keywords");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
