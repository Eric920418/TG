"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";
import { requireAdmin, toError, type ActionResult } from "./guard";

const questionSchema = z.object({
  id: z.number().optional(),
  question: z.string().min(1, "題目不可為空").max(500),
  options: z
    .array(z.string().min(1, "選項不可為空").max(100))
    .min(2, "至少要 2 個選項")
    .max(8, "最多 8 個選項"),
  correctIndex: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

export async function createQuestion(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = questionSchema.parse(input);
    if (data.correctIndex >= data.options.length) {
      throw new Error("正確選項 index 超出選項範圍");
    }
    await db.insert(questions).values({
      question: data.question,
      options: data.options,
      correctIndex: data.correctIndex,
      isActive: data.isActive,
    });
    revalidatePath("/questions");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function updateQuestion(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = questionSchema.parse(input);
    if (data.id == null) throw new Error("缺少 id");
    if (data.correctIndex >= data.options.length) {
      throw new Error("正確選項 index 超出選項範圍");
    }
    await db
      .update(questions)
      .set({
        question: data.question,
        options: data.options,
        correctIndex: data.correctIndex,
        isActive: data.isActive,
      })
      .where(eq(questions.id, data.id));
    revalidatePath("/questions");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deleteQuestion(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.delete(questions).where(eq(questions.id, id));
    revalidatePath("/questions");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
