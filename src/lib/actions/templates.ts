"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { buttonTemplates } from "@/lib/db/schema";
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

const buttonsSchema = z
  .array(z.array(buttonSchema).max(8))
  .max(8);

const templateSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1).max(100),
  buttons: buttonsSchema,
});

export async function upsertTemplate(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = templateSchema.parse(input);
    const cleaned = data.buttons.filter((row) => row.length > 0);
    if (data.id) {
      await db
        .update(buttonTemplates)
        .set({ name: data.name, buttons: cleaned })
        .where(eq(buttonTemplates.id, data.id));
    } else {
      await db.insert(buttonTemplates).values({
        name: data.name,
        buttons: cleaned,
      });
    }
    revalidatePath("/templates");
    revalidatePath("/posts/new");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deleteTemplate(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.delete(buttonTemplates).where(eq(buttonTemplates.id, id));
    revalidatePath("/templates");
    revalidatePath("/posts/new");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
