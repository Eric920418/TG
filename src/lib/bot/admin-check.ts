import type { Context } from "grammy";

type Entry = { isAdmin: boolean; expires: number };
const cache = new Map<string, Entry>();
const TTL_MS = 60_000;

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
