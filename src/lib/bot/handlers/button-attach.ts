import type { Bot } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { renderButtons, mergeKeyboards } from "@/lib/buttons";
import { sendAlbumButtonFollowup } from "@/lib/album-buttons";
import { log, errorMessage } from "@/lib/log";

/**
 * 本群按鈕附加：admin 在群裡發貼文時，自動掛上「該群」設定的 defaultButtons。
 * 由 group.buttonAttachEnabled 開關控制（可用 /ad on|off 即時切換），預設關。
 *
 * Telegram Bot API 限制：bot 無法在「真人 admin 的群組訊息」上加 inline keyboard
 * （editMessageReplyMarkup 只能編輯 bot 自己發的或 channel post）。因此：
 *   - 單則 Group/Supergroup 訊息：copyMessage 由 bot 重發到同群並帶按鈕，再刪原訊息。
 *   - 相簿（media group）：無法掛按鈕，改在相簿底下補一則只有按鈕的訊息（不刪原相簿）。
 *   - Channel 單則：原地 editMessageReplyMarkup；Channel 相簿：同樣補一則按鈕訊息。
 */
export function registerButtonAttachHandler(bot: Bot) {
  // Group / Supergroup：真人 admin 發訊息
  bot.on("message", async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const chatType = ctx.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") return next();
    // 避免 bot 重發後再次觸發自己（無限迴圈）
    if (ctx.from.is_bot) return next();
    // 跳過指令訊息（例如 /ad），否則指令也會被重發
    if (ctx.message.text?.startsWith("/")) return next();

    const group = await getGroupByChatId(ctx.chat.id);
    if (!group || !group.isActive || !group.buttonAttachEnabled) return next();

    const defaultKb = renderButtons(group.defaultButtons);
    if (defaultKb.length === 0) return next();

    // 只處理 admin 的貼文
    if (!(await isAdmin(ctx, ctx.chat.id, ctx.from.id))) return next();

    const chatId = ctx.chat.id;

    // 相簿：無法掛按鈕，改在底下補一則按鈕訊息（Redis 去重，一個相簿只補一次）
    if (ctx.message.media_group_id) {
      await sendAlbumButtonFollowup(
        ctx.api,
        chatId,
        ctx.message.media_group_id,
        defaultKb,
      );
      return next();
    }

    const sourceKb =
      ctx.message.reply_markup && "inline_keyboard" in ctx.message.reply_markup
        ? ctx.message.reply_markup.inline_keyboard
        : [];
    const mergedKb = mergeKeyboards(sourceKb, defaultKb);

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
    if (!group || !group.isActive || !group.buttonAttachEnabled) return next();

    const defaultKb = renderButtons(group.defaultButtons);
    if (defaultKb.length === 0) return next();

    const post = ctx.channelPost;

    // 頻道相簿：無法原地掛按鈕，改補一則按鈕訊息
    if (post.media_group_id) {
      await sendAlbumButtonFollowup(
        ctx.api,
        ctx.chat.id,
        post.media_group_id,
        defaultKb,
      );
      return next();
    }

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
