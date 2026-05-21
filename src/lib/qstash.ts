import { Client, Receiver } from "@upstash/qstash";
import { env } from "@/lib/env";

let cachedClient: Client | null = null;
let cachedReceiver: Receiver | null = null;

export function qstash(): Client {
  if (cachedClient) return cachedClient;
  cachedClient = new Client({ token: env().QSTASH_TOKEN });
  return cachedClient;
}

export function qstashReceiver(): Receiver {
  if (cachedReceiver) return cachedReceiver;
  const e = env();
  cachedReceiver = new Receiver({
    currentSigningKey: e.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: e.QSTASH_NEXT_SIGNING_KEY,
  });
  return cachedReceiver;
}

export async function verifyQstashSignature(
  signature: string | null,
  body: string,
  url: string,
): Promise<boolean> {
  if (!signature) return false;
  try {
    return await qstashReceiver().verify({ signature, body, url });
  } catch {
    return false;
  }
}
