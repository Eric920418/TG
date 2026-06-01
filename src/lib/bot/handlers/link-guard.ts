import type { Bot } from "grammy";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { containsLink } from "@/lib/links";
import { warnAndMaybeMute } from "@/lib/bot/punish";
import { log, errorMessage } from "@/lib/log";

/**
 * 禁止管理員以外的人發送連結（http/https、t.me、@用戶名）。
 * 處置沿用簡體字那套：刪訊息 → 累加警告 → 達上限禁言。
 */
export function registerLinkGuardHandler(bot: Bot) {
  bot.on("message", async (ctx, next) => {
    const text = ctx.message.text ?? ctx.message.caption;
    if (!text) return next();

    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return next();

    const group = await getGroupByChatId(chat.id);
    if (!group || !group.isActive || group.linkPolicy === "off") return next();

    if (!ctx.from) return next();
    if (await isAdmin(ctx, chat.id, ctx.from.id)) return next();

    if (!containsLink(text)) return next();

    const userId = ctx.from.id;
    const username = ctx.from.username ?? null;

    // 撤回訊息
    try {
      await ctx.api.deleteMessage(chat.id, ctx.message.message_id);
    } catch (err) {
      await log({
        type: "link.delete_failed",
        chatId: chat.id,
        userId,
        error: errorMessage(err),
      });
    }

    const { count, muted } = await warnAndMaybeMute(ctx, {
      chatId: chat.id,
      userId,
      username,
      reason: "link",
      group,
      buildWarn: ({ mention, count, limit }) =>
        `⚠️ ${mention} 本群禁止發送連結。\n警告 ${count}/${limit}，達上限將被禁言。`,
      buildMute: ({ mention, count, muteHours }) =>
        `⚠️ ${mention} 因連續發送連結 ${count} 次，已被禁言 ${muteHours} 小時。`,
    });

    await log({
      type: "link.hit",
      chatId: chat.id,
      userId,
      payload: { count, muted },
    });
  });
}
