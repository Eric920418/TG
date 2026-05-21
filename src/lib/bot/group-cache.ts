import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, type Group } from "@/lib/db/schema";

// 簡單記憶體 cache，serverless 函式期間有效
const cache = new Map<number, { group: Group | null; expires: number }>();
const TTL_MS = 30_000;

export async function getGroupByChatId(chatId: number): Promise<Group | null> {
  const now = Date.now();
  const cached = cache.get(chatId);
  if (cached && cached.expires > now) return cached.group;

  const [row] = await db
    .select()
    .from(groups)
    .where(eq(groups.chatId, chatId))
    .limit(1);

  const value = row ?? null;
  cache.set(chatId, { group: value, expires: now + TTL_MS });
  return value;
}

export function clearGroupCache(chatId?: number) {
  if (chatId == null) cache.clear();
  else cache.delete(chatId);
}
