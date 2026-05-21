import { webhookCallback } from "grammy";
import { getBot } from "@/lib/bot";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== env().TELEGRAM_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const bot = await getBot();
  const handler = webhookCallback(bot, "std/http", {
    timeoutMilliseconds: 50_000,
  });
  return handler(req);
}

export { handlePOST as POST };

export async function GET() {
  return Response.json({ ok: true, hint: "POST only (Telegram webhook)" });
}
