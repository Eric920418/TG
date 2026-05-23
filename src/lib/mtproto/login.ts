import { randomBytes } from "crypto";
import { redis } from "@/lib/redis";

const KEY_PREFIX = "mtproto:login:";
const TTL_SEC = 600; // 10 分鐘

export type PendingLogin = {
  phone: string;
  phoneCodeHash: string;
  sessionPartial: string;
  adminId: number;
  createdAt: number;
};

export function newLoginId(): string {
  return randomBytes(16).toString("hex");
}

export async function savePending(
  loginId: string,
  data: PendingLogin,
): Promise<void> {
  await redis().set(KEY_PREFIX + loginId, JSON.stringify(data), { ex: TTL_SEC });
}

export async function loadPending(loginId: string): Promise<PendingLogin | null> {
  const raw = await redis().get<string>(KEY_PREFIX + loginId);
  if (!raw) return null;
  // Upstash 自動 deserialize JSON，但保險起見也接受 string
  if (typeof raw === "object") return raw as PendingLogin;
  try {
    return JSON.parse(raw) as PendingLogin;
  } catch {
    return null;
  }
}

export async function clearPending(loginId: string): Promise<void> {
  await redis().del(KEY_PREFIX + loginId);
}
