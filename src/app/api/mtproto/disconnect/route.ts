import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { log, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session.adminId) {
    return Response.json({ ok: false, error: "未登入" }, { status: 401 });
  }
  try {
    await db
      .update(admins)
      .set({
        mtprotoSessionEnc: null,
        mtprotoSessionIv: null,
        mtprotoPhone: null,
        mtprotoUserId: null,
        mtprotoConnectedAt: null,
      })
      .where(eq(admins.id, session.adminId));

    await log({
      type: "mtproto.disconnected",
      userId: session.telegramId,
      payload: { adminId: session.adminId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    const msg = errorMessage(err);
    await log({
      type: "mtproto.disconnect_failed",
      userId: session.telegramId,
      error: msg,
    });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
