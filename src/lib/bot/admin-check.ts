import type { Context } from "grammy";

type Entry = { isAdmin: boolean; expires: number };
const cache = new Map<string, Entry>();
// 短 TTL 平衡「getChatMember 不要每訊息打」與「admin 降權能快速感知」
const TTL_MS = 10_000;

function key(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export async function isAdmin(
  ctx: Context,
  chatId: number,
  userId: number,
): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(key(chatId, userId));
  if (cached && cached.expires > now) return cached.isAdmin;

  try {
    const member = await ctx.api.getChatMember(chatId, userId);
    const ok =
      member.status === "creator" || member.status === "administrator";
    cache.set(key(chatId, userId), { isAdmin: ok, expires: now + TTL_MS });
    return ok;
  } catch {
    return false;
  }
}

export function clearAdminCache() {
  cache.clear();
}
