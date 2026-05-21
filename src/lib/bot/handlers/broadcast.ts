import type { Bot } from "grammy";
import { db } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { renderButtons, mergeKeyboards } from "@/lib/buttons";
import { log, errorMessage } from "@/lib/log";

export function registerBroadcastHandler(bot: Bot) {
  bot.on("message", async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const chatType = ctx.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") return next();

    const group = await getGroupByChatId(ctx.chat.id);
    if (!group || !group.isActive) return next();
    if (group.type !== "main") return next();
    if (!group.syncTargetChatId) return next();

    // 只同步 admin 發的訊息
    if (!(await isAdmin(ctx, ctx.chat.id, ctx.from.id))) return next();

    // bot 自己發的不轉
    if (ctx.from.is_bot) return next();

    const sourceChatId = ctx.chat.id;
    const sourceMessageId = ctx.message.message_id;
    const targetChatId = Number(group.syncTargetChatId);

    // 預檢：bot 在目標群必須是 admin / creator，否則 copyMessage 會失敗
    try {
      const me = await ctx.api.getChatMember(targetChatId, ctx.me.id);
      if (me.status !== "administrator" && me.status !== "creator") {
        const msg = `bot 在目標群 ${targetChatId} 非管理員（status=${me.status}），無法同步`;
        await db.insert(broadcasts).values({
          sourceChatId,
          sourceMessageId,
          targetChatId,
          senderUserId: ctx.from.id,
          senderUsername: ctx.from.username ?? null,
          success: false,
          error: msg,
        });
        await log({
          type: "broadcast.not_admin",
          chatId: sourceChatId,
          userId: ctx.from.id,
          error: msg,
          payload: { targetChatId, sourceMessageId },
        });
        return next();
      }
    } catch (err) {
      const msg = `預檢失敗（無法 getChatMember 目標群 ${targetChatId}）：${errorMessage(err)}`;
      await db.insert(broadcasts).values({
        sourceChatId,
        sourceMessageId,
        targetChatId,
        senderUserId: ctx.from.id,
        senderUsername: ctx.from.username ?? null,
        success: false,
        error: msg,
      });
      await log({
        type: "broadcast.precheck_failed",
        chatId: sourceChatId,
        userId: ctx.from.id,
        error: msg,
        payload: { targetChatId, sourceMessageId },
      });
      return next();
    }

    try {
      const result = await ctx.api.copyMessage(
        targetChatId,
        sourceChatId,
        sourceMessageId,
      );

      // 合併「原訊息按鈕」+「群組預設按鈕」
      const sourceKb =
        ctx.message.reply_markup &&
        "inline_keyboard" in ctx.message.reply_markup
          ? ctx.message.reply_markup.inline_keyboard
          : [];
      const defaultKb = renderButtons(group.defaultButtons);
      const merged = mergeKeyboards(sourceKb, defaultKb);

      if (merged.length > 0) {
        try {
          await ctx.api.editMessageReplyMarkup(
            targetChatId,
            result.message_id,
            { reply_markup: { inline_keyboard: merged } },
          );
        } catch (err) {
          // 編輯按鈕失敗不阻塞主流程，但要記錄
          await log({
            type: "broadcast.attach_buttons_failed",
            chatId: sourceChatId,
            userId: ctx.from.id,
            error: errorMessage(err),
            payload: {
              targetChatId,
              targetMessageId: result.message_id,
            },
          });
        }
      }

      await db.insert(broadcasts).values({
        sourceChatId,
        sourceMessageId,
        targetChatId,
        targetMessageId: result.message_id,
        senderUserId: ctx.from.id,
        senderUsername: ctx.from.username ?? null,
        success: true,
      });
    } catch (err) {
      const msg = errorMessage(err);
      await db.insert(broadcasts).values({
        sourceChatId,
        sourceMessageId,
        targetChatId,
        senderUserId: ctx.from.id,
        senderUsername: ctx.from.username ?? null,
        success: false,
        error: msg,
      });
      await log({
        type: "broadcast.failed",
        chatId: sourceChatId,
        userId: ctx.from.id,
        error: msg,
        payload: { targetChatId, sourceMessageId },
      });
    }

    return next();
  });
}
