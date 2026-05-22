import { InputFile } from "grammy";
import { eq } from "drizzle-orm";
import { getBot } from "@/lib/bot";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { log, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 客戶端傳 multipart: file=<binary>, kind=photo|video|animation|document
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session.adminId) {
    return Response.json({ ok: false, error: "未登入" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "請求需為 multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const kindRaw = form.get("kind");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "缺少 file 欄位或非檔案" },
      { status: 400 },
    );
  }
  const kind = (kindRaw === "photo" ||
  kindRaw === "video" ||
  kindRaw === "animation" ||
  kindRaw === "document"
    ? kindRaw
    : autoKindFromMime(file.type)) as
    | "photo"
    | "video"
    | "animation"
    | "document";

  // Telegram size limits（bot upload）：
  //  photo: 10 MB, video/animation: 50 MB, document: 50 MB
  const MAX = kind === "photo" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > MAX) {
    return Response.json(
      {
        ok: false,
        error: `檔案太大（${(file.size / 1024 / 1024).toFixed(1)} MB）。Telegram 限制：${kind === "photo" ? "10 MB" : "50 MB"}`,
      },
      { status: 413 },
    );
  }

  // 找 owner 當 staging 上傳對象（取第一個 active owner，沒有則用當前 admin）
  const [owner] = await db
    .select()
    .from(admins)
    .where(eq(admins.role, "owner"))
    .limit(1);
  const stagingChatId = Number(
    (owner?.isActive ? owner.telegramId : null) ?? session.telegramId,
  );
  if (!Number.isFinite(stagingChatId)) {
    return Response.json(
      { ok: false, error: "找不到可作為上傳暫存的對象" },
      { status: 500 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const inputFile = new InputFile(buffer, file.name || `upload.${defaultExt(kind)}`);
    const bot = await getBot();

    let fileId: string;
    let mime: string | undefined = file.type || undefined;

    if (kind === "photo") {
      const sent = await bot.api.sendPhoto(stagingChatId, inputFile, {
        caption: `📦 後台上傳 staging (admin id=${session.adminId})`,
      });
      // photo 是陣列，最大那張的 file_id
      const largest = sent.photo[sent.photo.length - 1];
      fileId = largest.file_id;
    } else if (kind === "video") {
      const sent = await bot.api.sendVideo(stagingChatId, inputFile, {
        caption: `📦 後台上傳 staging (admin id=${session.adminId})`,
      });
      fileId = sent.video.file_id;
    } else if (kind === "animation") {
      const sent = await bot.api.sendAnimation(stagingChatId, inputFile, {
        caption: `📦 後台上傳 staging (admin id=${session.adminId})`,
      });
      fileId = sent.animation.file_id;
    } else {
      const sent = await bot.api.sendDocument(stagingChatId, inputFile, {
        caption: `📦 後台上傳 staging (admin id=${session.adminId})`,
      });
      fileId = sent.document.file_id;
      mime = sent.document.mime_type ?? mime;
    }

    await log({
      type: "upload.ok",
      userId: session.telegramId,
      payload: {
        adminId: session.adminId,
        kind,
        size: file.size,
        mime,
        fileId,
      },
    });

    return Response.json({ ok: true, fileId, kind, size: file.size, mime });
  } catch (err) {
    const msg = errorMessage(err);
    await log({
      type: "upload.failed",
      userId: session.telegramId,
      error: msg,
      payload: { kind, size: file.size },
    });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

function autoKindFromMime(mime: string): "photo" | "video" | "animation" | "document" {
  if (mime.startsWith("image/gif")) return "animation";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function defaultExt(kind: string): string {
  return kind === "photo"
    ? "jpg"
    : kind === "video"
      ? "mp4"
      : kind === "animation"
        ? "gif"
        : "bin";
}
