import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let cached: Redis | null = null;

export function redis(): Redis {
  if (cached) return cached;
  const e = env();
  cached = new Redis({
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  });
  return cached;
}
