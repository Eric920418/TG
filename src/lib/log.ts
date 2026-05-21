import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";

export type LogInput = {
  type: string;
  chatId?: number | bigint | null;
  userId?: number | bigint | null;
  payload?: Record<string, unknown> | null;
  error?: string | null;
};

export async function log(input: LogInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      type: input.type,
      chatId: input.chatId != null ? Number(input.chatId) : null,
      userId: input.userId != null ? Number(input.userId) : null,
      payload: input.payload ?? null,
      error: input.error ?? null,
    });
  } catch (err) {
    // 紀錄寫失敗不能阻塞 webhook；用 console 補救
    console.error("[log] insert failed:", err, "input:", input);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
