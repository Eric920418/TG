import { Api } from "telegram";
import { computeCheck } from "telegram/Password";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { buildClient } from "@/lib/mtproto/client";
import { clearPending, loadPending } from "@/lib/mtproto/login";
import { encryptSecret } from "@/lib/crypto";
import { log, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  loginId: z.string().min(8),
  code: z.string().min(3).max(10),
  password: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session.adminId) {
    return Response.json({ ok: false, error: "未登入" }, { status: 401 });
  }

  let body: { loginId: string; code: string; password?: string };
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { ok: false, error: errorMessage(err) },
      { status: 400 },
    );
  }

  const pending = await loadPending(body.loginId);
  if (!pending) {
    return Response.json(
      { ok: false, error: "登入 session 已過期，請重新發送驗證碼" },
      { status: 410 },
    );
  }
  if (pending.adminId !== session.adminId) {
    return Response.json(
      { ok: false, error: "loginId 與當前 admin 不符" },
      { status: 403 },
    );
  }

  // 重建 client（partial session 帶上 sendCode 後的狀態）
  const client = await buildClient(pending.sessionPartial);

  try {
    let user: Api.User | null = null;
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: pending.phone,
          phoneCodeHash: pending.phoneCodeHash,
          phoneCode: body.code,
        }),
      );
      if (result instanceof Api.auth.Authorization) {
        user = result.user as Api.User;
      }
    } catch (err) {
      const errMsg = errorMessage(err);
      // 觸發 2FA 流程
      if (errMsg.includes("SESSION_PASSWORD_NEEDED") || errMsg.includes("PASSWORD")) {
        if (!body.password) {
          await client.disconnect();
          return Response.json(
            { ok: false, error: "PASSWORD_REQUIRED", need2fa: true },
            { status: 200 },
          );
        }
        // raw API：取 SRP params → computeCheck → CheckPassword
        const passwordInfo = await client.invoke(new Api.account.GetPassword());
        const srp = await computeCheck(passwordInfo, body.password);
        const result = await client.invoke(
          new Api.auth.CheckPassword({ password: srp }),
        );
        if (result instanceof Api.auth.Authorization) {
          user = result.user as Api.User;
        }
      } else {
        throw err;
      }
    }

    if (!user) {
      throw new Error("登入未拿到 user，無法繼續");
    }

    const sessionString = client.session.save() as unknown as string;
    const { enc, iv } = encryptSecret(sessionString);

    await db
      .update(admins)
      .set({
        mtprotoSessionEnc: enc,
        mtprotoSessionIv: iv,
        mtprotoPhone: pending.phone,
        mtprotoUserId: Number(user.id.toString()),
        mtprotoConnectedAt: new Date(),
      })
      .where(eq(admins.id, session.adminId));

    await clearPending(body.loginId);
    await client.disconnect();

    await log({
      type: "mtproto.connected",
      userId: session.telegramId,
      payload: {
        adminId: session.adminId,
        userId: user.id.toString(),
        phoneSuffix: pending.phone.slice(-4),
      },
    });

    return Response.json({
      ok: true,
      userId: user.id.toString(),
      phoneSuffix: pending.phone.slice(-4),
    });
  } catch (err) {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
    const msg = errorMessage(err);
    await log({
      type: "mtproto.verify_failed",
      userId: session.telegramId,
      error: msg,
    });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
