import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "@/lib/env";

const ALG = "aes-256-gcm";
const IV_LEN = 12; // GCM 標準
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  // 從 SESSION_PASSWORD 派生獨立的 MTProto 加密 key
  cachedKey = scryptSync(env().SESSION_PASSWORD, "mtproto-session-v1", 32);
  return cachedKey;
}

/**
 * 加密敏感字串（如 MTProto session）。
 * 回傳結構：base64(iv) + ':' + base64(ciphertext + auth_tag)
 */
export function encryptSecret(plaintext: string): { enc: string; iv: string } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: Buffer.concat([ct, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(enc: string, iv: string): string {
  const data = Buffer.from(enc, "base64");
  const ct = data.subarray(0, data.length - TAG_LEN);
  const tag = data.subarray(data.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, deriveKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
