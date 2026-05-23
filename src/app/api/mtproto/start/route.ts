import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildClient, getApiCreds } from "@/lib/mtproto/client";
import { newLoginId, savePending } from "@/lib/mtproto/login";
import { log, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+?[\d\s-]+$/, "手機格式錯誤"),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session.adminId) {
    return Response.json({ ok: false, error: "未登入" }, { status: 401 });
  }

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, session.adminId))
    .limit(1);
  if (!admin || admin.role !== "owner") {
    return Response.json(
      { ok: false, error: "僅 owner 可綁定 MTProto 帳號" },
      { status: 403 },
    );
  }

  let body: { phone: string };
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { ok: false, error: errorMessage(err) },
      { status: 400 },
    );
  }

  const phone = body.phone.replace(/[\s-]/g, "");

  try {
    getApiCreds(); // 先驗 env 有設、否則早 throw
    const client = await buildClient();
    const { apiId, apiHash } = getApiCreds();
    const res = await client.sendCode({ apiId, apiHash }, phone);
    const sessionPartial = client.session.save() as unknown as string;
    await client.disconnect();

    const loginId = newLoginId();
    await savePending(loginId, {
      phone,
      phoneCodeHash: res.phoneCodeHash,
      sessionPartial,
      adminId: admin.id,
      createdAt: Date.now(),
    });

    await log({
      type: "mtproto.start",
      userId: admin.telegramId,
      payload: { phone: phone.slice(-4), loginId },
    });

    return Response.json({ ok: true, loginId });
  } catch (err) {
    const msg = errorMessage(err);
    await log({
      type: "mtproto.start_failed",
      userId: admin.telegramId,
      error: msg,
    });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
