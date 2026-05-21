import { createHash, createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

export type TelegramAuthData = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export function verifyTelegramLogin(data: TelegramAuthData): {
  ok: boolean;
  reason?: string;
} {
  const { hash, ...rest } = data;
  if (!hash) return { ok: false, reason: "missing hash" };

  // Telegram 規定: data_check_string = sorted(k=v) joined by \n
  const entries = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secret = createHash("sha256").update(env().TELEGRAM_BOT_TOKEN).digest();
  const computed = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return { ok: false, reason: "hash length mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "hash mismatch" };

  const ageSec = Math.floor(Date.now() / 1000) - data.auth_date;
  if (ageSec > 86400) {
    return { ok: false, reason: `auth_date too old (${ageSec}s)` };
  }
  return { ok: true };
}
