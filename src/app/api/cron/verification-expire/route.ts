import { env } from "@/lib/env";
import { getBot } from "@/lib/bot";
import { expirePendingVerifications } from "@/lib/bot/handlers/verify";
import { log, errorMessage } from "@/lib/log";
import { authorizedBearer } from "@/lib/secret-compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  return authorizedBearer(req, env().CRON_SECRET);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) {
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
