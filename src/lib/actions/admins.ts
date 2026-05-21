"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { requireOwner, toError, type ActionResult } from "./guard";

const schema = z.object({
  id: z.number().optional(),
  telegramId: z.coerce.number().int(),
  username: z.string().optional().nullable(),
  role: z.enum(["owner", "admin"]).default("admin"),
  isActive: z.boolean().default(true),
});

export async function upsertAdmin(input: unknown): Promise<ActionResult> {
  try {
    await requireOwner();
    const data = schema.parse(input);
    if (data.id) {
      await db
        .update(admins)
        .set({
          telegramId: data.telegramId,
          username: data.username ?? null,
          role: data.role,
          isActive: data.isActive,
        })
        .where(eq(admins.id, data.id));
    } else {
      await db.insert(admins).values({
        telegramId: data.telegramId,
        username: data.username ?? null,
        role: data.role,
        isActive: data.isActive,
      });
    }
    revalidatePath("/admins");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deleteAdmin(id: number): Promise<ActionResult> {
  try {
    await requireOwner();
    await db.delete(admins).where(eq(admins.id, id));
    revalidatePath("/admins");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
