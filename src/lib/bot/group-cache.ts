import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, type Group } from "@/lib/db/schema";

/**
 * 取得群組設定。Vercel function 與 Neon 同 sin1 region，
 * 每次查約 30-50ms，比 in-memory cache 的跨 lambda 不一致風險更可靠。
 */
export async function getGroupByChatId(chatId: number): Promise<Group | null> {
  const [row] = await db
    .select()
    .from(groups)
    .where(eq(groups.chatId, chatId))
    .limit(1);
  return row ?? null;
}

/** 向後相容用 no-op；之前用來標記 cache 失效，現在沒 cache 不需要 */
export function clearGroupCache(_chatId?: number): void {
  void _chatId;
}
