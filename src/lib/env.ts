import { z } from "zod";

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  DATABASE_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  QSTASH_URL: z.string().url().default("https://qstash.upstash.io"),
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
  // MTProto 進階功能（optional：缺失時整套 feature 自動 disable）
  MTPROTO_API_ID: z.coerce.number().int().optional(),
  MTPROTO_API_HASH: z.string().min(1).optional(),
  SESSION_PASSWORD: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`環境變數缺失或格式錯誤:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
