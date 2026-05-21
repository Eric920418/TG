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

    // 取目標子群清單：新欄位優先，沒有則 fallback 到舊單一欄位
    const targets =
      group.syncTargetChatIds && group.syncTargetChatIds.length > 0
        ? group.syncTargetChatIds.map(Number)
        : group.syncTargetChatId != null
          ? [Number(group.syncTargetChatId)]
          : [];
    if (targets.length === 0) return next();

    // 只同步 admin 發的訊息
    if (!(await isAdmin(ctx, ctx.chat.id, ctx.from.id))) return next();
    if (ctx.from.is_bot) return next();

    const sourceChatId = ctx.chat.id;
    const sourceMessageId = ctx.message.message_id;

    // 原訊息按鈕 + 群組預設按鈕（只計算一次，所有 sub 共用）
    const sourceKb =
      ctx.message.reply_markup &&
      "inline_keyboard" in ctx.message.reply_markup
        ? ctx.message.reply_markup.inline_keyboard
        : [];
    const defaultKb = renderButtons(group.defaultButtons);
    const mergedKb = mergeKeyboards(sourceKb, defaultKb);

    // 串行處理：每個 target 各自獨立預檢 + copyMessage + 附加按鈕
    for (const targetChatId of targets) {
      const baseRow = {
        sourceChatId,
        sourceMessageId,
        targetChatId,
        senderUserId: ctx.from.id,
        senderUsername: ctx.from.username ?? null,
      };

      // 預檢：bot 在目標群必須是 admin / creator
      let isBotAdmin = false;
      try {
        const me = await ctx.api.getChatMember(targetChatId, ctx.me.id);
        isBotAdmin = me.status === "administrator" || me.status === "creator";
      } catch (err) {
        const msg = `預檢失敗（無法 getChatMember 目標群 ${targetChatId}）：${errorMessage(err)}`;
        await db.insert(broadcasts).values({ ...baseRow, success: false, error: msg });
        await log({
          type: "broadcast.precheck_failed",
          chatId: sourceChatId,
          userId: ctx.from.id,
          error: msg,
          payload: { targetChatId, sourceMessageId },
        });
        continue;
      }
      if (!isBotAdmin) {
        const msg = `bot 在目標群 ${targetChatId} 非管理員，無法同步`;
        await db.insert(broadcasts).values({ ...baseRow, success: false, error: msg });
        await log({
          type: "broadcast.not_admin",
          chatId: sourceChatId,
          userId: ctx.from.id,
          error: msg,
          payload: { targetChatId, sourceMessageId },
        });
        continue;
      }

      try {
        const result = await ctx.api.copyMessage(
          targetChatId,
          sourceChatId,
          sourceMessageId,
        );

        if (mergedKb.length > 0) {
          try {
            await ctx.api.editMessageReplyMarkup(
              targetChatId,
              result.message_id,
              { reply_markup: { inline_keyboard: mergedKb } },
            );
          } catch (err) {
            await log({
              type: "broadcast.attach_buttons_failed",
              chatId: sourceChatId,
              userId: ctx.from.id,
              error: errorMessage(err),
              payload: { targetChatId, targetMessageId: result.message_id },
            });
          }
        }

        await db.insert(broadcasts).values({
          ...baseRow,
          targetMessageId: result.message_id,
          success: true,
        });
      } catch (err) {
        const msg = errorMessage(err);
        await db.insert(broadcasts).values({ ...baseRow, success: false, error: msg });
        await log({
          type: "broadcast.failed",
          chatId: sourceChatId,
          userId: ctx.from.id,
          error: msg,
          payload: { targetChatId, sourceMessageId },
        });
      }
    }

    return next();
  });
}
