import type { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins, stagingMessages } from "@/lib/db/schema";
import { log, errorMessage } from "@/lib/log";

/**
 * 客戶在 Telegram 私訊 / 轉發訊息給 bot → 自動存進 staging_messages，
 * 之後後台排程貼文可以下拉選用，發送時用 copyMessage 從 bot DM 把整條原樣搬到目標群
 * （保留 custom_emoji / 富格式 entities）。
 */
export function registerStagingHandler(bot: Bot) {
  bot.on("message", async (ctx, next) => {
    // 只處理私訊
    if (ctx.chat?.type !== "private") return next();
    if (!ctx.from) return next();

    // 跳過指令訊息（/login, /start 之類）
    const commandText = ctx.message.text;
    if (commandText && commandText.startsWith("/")) return next();

    // 必須是已註冊的 admin 才存（避免任意人 DM bot 灌爆 staging）
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.telegramId, ctx.from.id))
      .limit(1);
    if (!admin || !admin.isActive) {
      await ctx
        .reply("⛔ 你不是管理員，無法存為素材。請先聯絡 owner 加入名單。")
        .catch(() => {});
      return next();
    }

    const m = ctx.message;
    const hasMedia = !!(
      m.photo ||
      m.video ||
      m.animation ||
      m.document ||
      m.audio ||
      m.voice ||
      m.sticker
    );
    const rawLabel = (m.text ?? m.caption ?? "").trim();
    const mediaTag = m.photo
      ? "📷 圖片"
      : m.video
        ? "🎬 影片"
        : m.animation
          ? "✨ GIF"
          : m.document
            ? "📄 檔案"
            : m.audio
              ? "🎵 音訊"
              : m.voice
                ? "🎤 語音"
                : m.sticker
                  ? "🌟 貼紙"
                  : null;
      const label =
        rawLabel.length > 0
          ? rawLabel.slice(0, 80) + (rawLabel.length > 80 ? "…" : "")
          : (mediaTag ?? "（無內容）");

    // Snapshot 完整訊息資料以便 user 模式發送（繞過 MTProto entity cache）
    const text = m.text ?? m.caption ?? "";
    const entities = m.entities ?? m.caption_entities ?? null;
    let mediaType: string | null = null;
    let mediaFileId: string | null = null;
    if (m.photo) {
      mediaType = "photo";
      // photo 是陣列，取最大那張
      mediaFileId = m.photo[m.photo.length - 1].file_id;
    } else if (m.video) {
      mediaType = "video";
      mediaFileId = m.video.file_id;
    } else if (m.animation) {
      mediaType = "animation";
      mediaFileId = m.animation.file_id;
    } else if (m.document) {
      mediaType = "document";
      mediaFileId = m.document.file_id;
    } else if (m.sticker) {
      mediaType = "sticker";
      mediaFileId = m.sticker.file_id;
    }

    try {
      const [row] = await db
        .insert(stagingMessages)
        .values({
          chatId: ctx.chat.id,
          messageId: m.message_id,
          label,
          hasMedia,
          capturedByAdminId: admin.id,
          text: text || null,
          entities: entities ?? null,
          mediaType,
          mediaFileId,
        })
        .returning();

      await ctx.reply(
        `✅ 已存為素材 #${row.id}\n\n` +
          `預覽：${escape(label)}\n\n` +
          `現在可以到後台「新增排程」→ 切換「從 bot 收到的訊息匯入」→ 下拉選 #${row.id}。發送時會 1:1 搬到目標群、動態貼紙跟格式全部保留。`,
      );
      await log({
        type: "staging.captured",
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        payload: { stagingId: row.id, messageId: m.message_id, hasMedia },
      });
    } catch (err) {
      const msg = errorMessage(err);
      await ctx.reply(`存素材失敗：${msg}`).catch(() => {});
      await log({
        type: "staging.failed",
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        error: msg,
      });
    }

    return next();
  });
}

function escape(s: string): string {
  // 因為我們用 default parse_mode（無），不需要 escape；保留 hook
  return s;
}
