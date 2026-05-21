import type { Bot } from "grammy";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { warnings } from "@/lib/db/schema";
import { detectSimplified } from "@/lib/opencc";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { log, errorMessage } from "@/lib/log";

export function registerSimplifiedHandler(bot: Bot) {
  bot.on("message", async (ctx, next) => {
    const text = ctx.message.text ?? ctx.message.caption;
    if (!text) return next();

    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return next();

    const group = await getGroupByChatId(chat.id);
    if (!group || !group.isActive || group.simplifiedPolicy === "off") return next();

    if (!ctx.from) return next();
    if (await isAdmin(ctx, chat.id, ctx.from.id)) return next();

    const hits = detectSimplified(text);
    if (hits.length === 0) return next();

    const userId = ctx.from.id;
    const username = ctx.from.username ?? null;
    const sampleChars = hits
      .slice(0, 5)
      .map((h) => `${h.char}→${h.expected}`)
      .join(" ");

    // 撤回訊息
    try {
      await ctx.api.deleteMessage(chat.id, ctx.message.message_id);
    } catch (err) {
      await log({
        type: "simplified.delete_failed",
        chatId: chat.id,
        userId,
        error: errorMessage(err),
      });
    }

    // 累加警告
    const [row] = await db
      .insert(warnings)
      .values({
        chatId: chat.id,
        userId,
        username,
        reason: "simplified_chinese",
        count: 1,
      })
      .onConflictDoUpdate({
        target: [warnings.chatId, warnings.userId],
        set: {
          count: sql`${warnings.count} + 1`,
          lastAt: new Date(),
          username,
          reason: "simplified_chinese",
        },
      })
      .returning();

    const mention =
      username != null
        ? `@${username}`
        : `<a href="tg://user?id=${userId}">user</a>`;

    const reachedLimit = row.count >= group.warningLimit;

    if (reachedLimit) {
      const muteUntil = Math.floor(Date.now() / 1000) + group.muteDurationSec;
      try {
        await ctx.api.restrictChatMember(
          chat.id,
          userId,
          {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
          },
          { until_date: muteUntil },
        );
      } catch (err) {
        await log({
          type: "simplified.mute_failed",
          chatId: chat.id,
          userId,
          error: errorMessage(err),
        });
      }

      await ctx.api
        .sendMessage(
          chat.id,
          `⚠️ ${mention} 因連續發送簡體字 ${row.count} 次，已被禁言 ${Math.round(group.muteDurationSec / 3600)} 小時。`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});

      // 禁言後清除警告計數，下次違規重新累積
      await db
        .delete(warnings)
        .where(
          and(eq(warnings.chatId, chat.id), eq(warnings.userId, userId)),
        );
    } else {
      await ctx.api
        .sendMessage(
          chat.id,
          `⚠️ ${mention} 本群禁止簡體字（偵測到：${escapeHtml(sampleChars)}）。\n` +
            `警告 ${row.count}/${group.warningLimit}，達上限將被禁言。`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
    }

    await log({
      type: "simplified.hit",
      chatId: chat.id,
      userId,
      payload: { count: row.count, sample: sampleChars, muted: reachedLimit },
    });
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
