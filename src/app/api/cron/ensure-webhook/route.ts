import { env } from "@/lib/env";
import { authorizedBearer } from "@/lib/secret-compare";
import { log, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "callback_query",
  "chat_member",
  "my_chat_member",
] as const;

type WebhookInfo = {
  url: string;
  allowed_updates?: string[];
};

export async function GET(req: Request): Promise<Response> {
  if (!authorizedBearer(req, env().CRON_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const e = env();
    const expectedUrl = `${e.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}/api/telegram/webhook`;

    // 1. 取 Telegram 端目前設定
    const infoRes = await fetch(
      `https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    );
    const infoData = (await infoRes.json()) as { ok: boolean; result: WebhookInfo };
    if (!infoData.ok) {
      throw new Error(`getWebhookInfo failed: ${JSON.stringify(infoData)}`);
    }
    const current = infoData.result;

    // 2. 比對：URL 與 allowed_updates 是否一致
    const urlMatch = current.url === expectedUrl;
    const currentUpdates = current.allowed_updates ?? [];
    const updatesMatch = setsEqual(currentUpdates, EXPECTED_ALLOWED_UPDATES);

    if (urlMatch && updatesMatch) {
      return Response.json({
        ok: true,
        action: "no_change",
        current: { url: current.url, allowed_updates: currentUpdates },
      });
    }

    // 3. drift 偵測到，重設
    const setRes = await fetch(
      `https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: expectedUrl,
          secret_token: e.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: EXPECTED_ALLOWED_UPDATES,
          drop_pending_updates: false,
        }),
      },
    );
    const setData = (await setRes.json()) as { ok: boolean; description?: string };
    if (!setData.ok) {
      throw new Error(`setWebhook failed: ${setData.description ?? JSON.stringify(setData)}`);
    }

    const reason = {
      urlMatch,
      updatesMatch,
      previousUrl: current.url,
      previousUpdates: currentUpdates,
      newUrl: expectedUrl,
      newUpdates: [...EXPECTED_ALLOWED_UPDATES],
    };
    await log({ type: "webhook.auto_repaired", payload: reason });
    return Response.json({ ok: true, action: "repaired", reason });
  } catch (err) {
    const msg = errorMessage(err);
    await log({ type: "webhook.auto_repair_failed", error: msg });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

function setsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}
