import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { verifyTelegramLogin, type TelegramAuthData } from "@/lib/auth/telegram";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: TelegramAuthData;
  try {
    body = (await req.json()) as TelegramAuthData;
  } catch {
    return Response.json({ ok: false, error: "請求非有效 JSON" }, { status: 400 });
  }

  const verify = verifyTelegramLogin(body);
  if (!verify.ok) {
    return Response.json(
      { ok: false, error: `Telegram 簽章驗證失敗：${verify.reason}` },
      { status: 401 },
    );
  }

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.telegramId, body.id))
    .limit(1);

  if (!admin) {
    return Response.json(
      {
        ok: false,
        error: `Telegram ID ${body.id} 不在管理員名單，請聯絡 owner 加入。`,
      },
      { status: 403 },
    );
  }
  if (!admin.isActive) {
    return Response.json(
      { ok: false, error: "此管理員帳號已停用" },
      { status: 403 },
    );
  }

  await db
    .update(admins)
    .set({
      username: body.username ?? admin.username,
      firstName: body.first_name ?? admin.firstName,
      photoUrl: body.photo_url ?? admin.photoUrl,
    })
    .where(eq(admins.id, admin.id));

  const session = await getSession();
  session.adminId = admin.id;
  session.telegramId = admin.telegramId;
  session.username = body.username ?? admin.username;
  session.firstName = body.first_name ?? admin.firstName;
  session.photoUrl = body.photo_url ?? admin.photoUrl;
  session.role = admin.role;
  await session.save();

  return Response.json({ ok: true });
}
