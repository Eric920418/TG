import type { Bot, Context } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { db } from "@/lib/db";
import { broadcasts, type Group } from "@/lib/db/schema";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { renderButtons, mergeKeyboards } from "@/lib/buttons";
import { log, errorMessage } from "@/lib/log";

export function registerBroadcastHandler(bot: Bot) {
  // 主群是 Group / Supergroup (admin-only 禁言模式)
  bot.on("message", async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const chatType = ctx.chat.type;
    if (chatType !== "group" && chatType !== "supergroup") return next();

    const group = await getGroupByChatId(ctx.chat.id);
    if (!group || !group.isActive || group.type !== "main") return next();

    // 只同步 admin 發的訊息
    if (!(await isAdmin(ctx, ctx.chat.id, ctx.from.id))) return next();
    if (ctx.from.is_bot) return next();

    const sourceKb =
      ctx.message.reply_markup && "inline_keyboard" in ctx.message.reply_markup
        ? ctx.message.reply_markup.inline_keyboard
        : [];

    await fanOut(ctx, {
      group,
      sourceChatId: ctx.chat.id,
      sourceMessageId: ctx.message.message_id,
      senderUserId: ctx.from.id,
      senderUsername: ctx.from.username ?? null,
      sourceKb,
    });
    return next();
  });

  // 主群是 Channel (頻道，原生 admin-only 廣播，有小喇叭圖示)
  bot.on("channel_post", async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type !== "channel") return next();
    if (!ctx.channelPost) return next();

    const group = await getGroupByChatId(ctx.chat.id);
    if (!group || !group.isActive || group.type !== "main") return next();

    // Channel post 一定是 admin（只有 admin 能 post），不用查 isAdmin
    const post = ctx.channelPost;
    const sourceKb =
      post.reply_markup && "inline_keyboard" in post.reply_markup
        ? post.reply_markup.inline_keyboard
        : [];

    await fanOut(ctx, {
      group,
      sourceChatId: ctx.chat.id,
      sourceMessageId: post.message_id,
      senderUserId: ctx.from?.id ?? null,
      senderUsername: ctx.from?.username ?? post.author_signature ?? null,
      sourceKb,
    });
    return next();
  });
}

type FanOutArgs = {
  group: Group;
  sourceChatId: number;
  sourceMessageId: number;
  senderUserId: number | null;
  senderUsername: string | null;
  sourceKb: InlineKeyboardButton[][];
};

async function fanOut(ctx: Context, args: FanOutArgs): Promise<void> {
  const { group, sourceChatId, sourceMessageId, senderUserId, senderUsername, sourceKb } =
    args;

  // 取目標子群清單：新欄位優先，無則 fallback 舊單一欄位
  const targets =
    group.syncTargetChatIds && group.syncTargetChatIds.length > 0
      ? group.syncTargetChatIds.map(Number)
      : group.syncTargetChatId != null
        ? [Number(group.syncTargetChatId)]
        : [];
  if (targets.length === 0) return;

  const defaultKb = renderButtons(group.defaultButtons);
  const mergedKb = mergeKeyboards(sourceKb, defaultKb);

  for (const targetChatId of targets) {
    const baseRow = {
      sourceChatId,
      sourceMessageId,
      targetChatId,
      senderUserId,
      senderUsername,
    };

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
        userId: senderUserId ?? undefined,
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
        userId: senderUserId ?? undefined,
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
            userId: senderUserId ?? undefined,
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
        userId: senderUserId ?? undefined,
        error: msg,
        payload: { targetChatId, sourceMessageId },
      });
    }
  }
}
