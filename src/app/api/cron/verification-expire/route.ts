import { env } from "@/lib/env";
import { getBot } from "@/lib/bot";
import { expirePendingVerifications } from "@/lib/bot/handlers/verify";
import { log, errorMessage } from "@/lib/log";
import { authorizedBearer } from "@/lib/secret-compare";
import { verifyQstashSignature } from "@/lib/qstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(req: Request, body: string): Promise<boolean> {
  // 優先 QStash 簽章：到期時由 scheduleExpiryKick 精準觸發
  const sig = req.headers.get("upstash-signature");
  if (sig) {
    return verifyQstashSignature(sig, body, new URL(req.url).toString());
  }
  // vercel cron 兜底：CRON_SECRET (timing-safe)
  return authorizedBearer(req, env().CRON_SECRET);
}

async function run(req: Request, body: string): Promise<Response> {
  if (!(await authorized(req, body))) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const bot = await getBot();
    const kicked = await expirePendingVerifications(bot);
    return Response.json({ ok: true, kicked });
  } catch (err) {
    const msg = errorMessage(err);
    await log({ type: "cron.verification_expire_failed", error: msg });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

// vercel cron 走 GET（低頻兜底）
export async function GET(req: Request): Promise<Response> {
  return run(req, "");
}

// QStash 走 POST（到期即時觸發）
export async function POST(req: Request): Promise<Response> {
  return run(req, await req.text());
}
