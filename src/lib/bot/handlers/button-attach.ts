import type { Bot } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { renderButtons, mergeKeyboards } from "@/lib/buttons";
import { log, errorMessage } from "@/lib/log";

/**
 * 本群按鈕附加：admin 在群裡發貼文時，自動掛上「該群」設定的 defaultButtons。
 *
 * Telegram Bot API 限制：bot 無法在「真人 admin 的群組訊息」上加 inline keyboard
 * （editMessageReplyMarkup 只能編輯 bot 自己發的或 channel post）。因此：
 *   - Group/Supergroup：copyMessage 把內容由 bot 重發到同群並帶上按鈕，再刪原訊息
 *     （該則訊息會變成 bot 發的，失去 admin 署名）。
 *   - Channel：原地 editMessageReplyMarkup（乾淨）。
 * 只有當該群 defaultButtons 非空才會觸發，否則完全不動（子群預設不設按鈕＝正常聊天）。
 */
export function registerButtonAttachHandler(bot: Bot) {
  // Group / Supergroup：真人 admin 發訊息
  bot.on("message", async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const chatType = ctx.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") return next();
    // 避免 bot 重發後再次觸發自己（無限迴圈）
    if (ctx.from.is_bot) return next();

    const group = await getGroupByChatId(ctx.chat.id);
    if (!group || !group.isActive) return next();

    const defaultKb = renderButtons(group.defaultButtons);
    if (defaultKb.length === 0) return next();

    // 只處理 admin 的貼文
    if (!(await isAdmin(ctx, ctx.chat.id, ctx.from.id))) return next();

    const sourceKb =
      ctx.message.reply_markup && "inline_keyboard" in ctx.message.reply_markup
        ? ctx.message.reply_markup.inline_keyboard
        : [];
    const mergedKb = mergeKeyboards(sourceKb, defaultKb);

    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    try {
      // 先重發（保證內容＋按鈕都在），再刪原訊息
      await ctx.api.copyMessage(chatId, chatId, messageId, {
        reply_markup: { inline_keyboard: mergedKb },
      });
      try {
        await ctx.api.deleteMessage(chatId, messageId);
      } catch (err) {
        await log({
          type: "button.delete_original_failed",
          chatId,
          userId: ctx.from.id,
          error: errorMessage(err),
          payload: { messageId },
        });
      }
    } catch (err) {
      await log({
        type: "button.repost_failed",
        chatId,
        userId: ctx.from.id,
        error: errorMessage(err),
        payload: { messageId },
      });
    }
    return next();
  });

  // Channel：原生 admin-only 廣播，bot 可原地編輯貼文加按鈕
  bot.on("channel_post", async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type !== "channel") return next();
    if (!ctx.channelPost) return next();

    const group = await getGroupByChatId(ctx.chat.id);
    if (!group || !group.isActive) return next();

    const defaultKb = renderButtons(group.defaultButtons);
    if (defaultKb.length === 0) return next();

    const post = ctx.channelPost;
    const sourceKb: InlineKeyboardButton[][] =
      post.reply_markup && "inline_keyboard" in post.reply_markup
        ? post.reply_markup.inline_keyboard
        : [];
    const mergedKb = mergeKeyboards(sourceKb, defaultKb);
    if (mergedKb.length <= sourceKb.length) return next(); // 沒有新增任何按鈕

    try {
      await ctx.api.editMessageReplyMarkup(ctx.chat.id, post.message_id, {
        reply_markup: { inline_keyboard: mergedKb },
      });
    } catch (err) {
      const msg = errorMessage(err);
      // 按鈕已是最新狀態時 Telegram 回 400 not modified，視為正常
      if (!msg.includes("message is not modified")) {
        await log({
          type: "channel.edit_source_failed",
          chatId: ctx.chat.id,
          error: msg,
          payload: { messageId: post.message_id },
        });
      }
    }
    return next();
  });
}
