import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";

const CONNECTION_TIMEOUT_SEC = 15;
const CONNECTION_RETRIES = 2;

export class MtprotoUnavailableError extends Error {
  constructor(reason: string) {
    super(`MTProto 功能不可用：${reason}`);
    this.name = "MtprotoUnavailableError";
  }
}

export type MtprotoApiCreds = { apiId: number; apiHash: string };

export function getApiCreds(): MtprotoApiCreds {
  const e = env();
  if (!e.MTPROTO_API_ID || !e.MTPROTO_API_HASH) {
    throw new MtprotoUnavailableError(
      "尚未設定 MTPROTO_API_ID / MTPROTO_API_HASH（owner 須先到 my.telegram.org 申請、加入 Vercel env）",
    );
  }
  return { apiId: e.MTPROTO_API_ID, apiHash: e.MTPROTO_API_HASH };
}

/**
 * 給定 session 字串（明文）建立 TelegramClient 並 connect。
 * 用於 auth flow 中還沒寫入 DB 的階段。
 */
export async function buildClient(sessionString = ""): Promise<TelegramClient> {
  const { apiId, apiHash } = getApiCreds();
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    useWSS: true,
    connectionRetries: CONNECTION_RETRIES,
    timeout: CONNECTION_TIMEOUT_SEC,
  });
  await client.connect();
  return client;
}

/**
 * 從 admins.mtproto_session_enc 解密 session，建立 client、執行 fn、保證 disconnect。
 *
 * 使用 Postgres advisory lock 防止同 admin 在多個 Vercel function instance
 * 同時使用同一個 session（避免 Telegram 標記為 multi-DC 可疑行為）。
 */
export async function withClient<T>(
  adminId: number,
  fn: (client: TelegramClient) => Promise<T>,
): Promise<T> {
  // 取加密 session
  const [admin] = await db
    .select({
      mtprotoSessionEnc: admins.mtprotoSessionEnc,
      mtprotoSessionIv: admins.mtprotoSessionIv,
    })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  if (!admin || !admin.mtprotoSessionEnc || !admin.mtprotoSessionIv) {
    throw new MtprotoUnavailableError(
      `admin id=${adminId} 尚未綁定 MTProto 帳號`,
    );
  }
  const sessionString = decryptSecret(
    admin.mtprotoSessionEnc,
    admin.mtprotoSessionIv,
  );

  const client = await buildClient(sessionString);
  try {
    return await fn(client);
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore disconnect errors */
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
