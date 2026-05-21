import { timingSafeEqual } from "crypto";

/**
 * Timing-safe 字串比對。長度不同直接 false，不洩漏長度資訊。
 * 內容比對走 Buffer.timingSafeEqual，不會因前綴匹配而提早回傳。
 */
export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (a == null || a.length !== b.length) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 驗證 Authorization: Bearer <secret> header，timing-safe。
 */
export function authorizedBearer(req: Request, expected: string): boolean {
  const header = req.headers.get("authorization");
  if (!header) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return safeEqual(header.slice(prefix.length), expected);
}
