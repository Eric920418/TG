import type { Bot } from "grammy";
import { getGroupByChatId } from "@/lib/bot/group-cache";
import { isAdmin } from "@/lib/bot/admin-check";
import { unmuteUser } from "@/lib/bot/punish";
import { log, errorMessage } from "@/lib/log";

/** 把 Telegram restrictChatMember 的常見 400 翻成人話 */
function friendlyRestrictError(raw: string): string {
  if (raw.includes("can't restrict self") || raw.includes("can't demote self")) {
    return "目標是 bot 自己——你大概是回覆了 bot 的訊息。請改點警告訊息上的「🔓 解除禁言」按鈕，或回覆「被禁言那個人本人」的訊息。";
  }
  if (raw.includes("administrator")) {
    return "對方是群管理員，管理員不會被禁言，不需要解禁。";
  }
  if (raw.includes("not enough rights")) {
    return "bot 缺少「Restrict Members（限制成員）」權限，請到群組管理員設定裡開啟。";
  }
  if (raw.includes("PARTICIPANT_ID_INVALID") || raw.includes("user not found")) {
    return "找不到這個用戶——ID 可能打錯，或他已不在群內。";
  }
  return raw;
}

/**
 * 解除禁言，兩個入口：
 *  1. 禁言通知上的「🔓 解除禁言」按鈕（callback `unmute:<userId>`）——最可靠，
 *     因為違規者的訊息通常已被刪光、沒東西可回覆。
 *  2. /unmute 指令：回覆目標訊息，或 /unmute <user id>。
 * 都僅限該群 admin。
 */
export function registerUnmuteHandler(bot: Bot) {
  // 入口 1：禁言通知上的按鈕
  bot.callbackQuery(/^unmute:(\d+)$/, async (ctx) => {
    const chat = ctx.chat;
    if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    if (!(await isAdmin(ctx, chat.id, ctx.from.id))) {
      await ctx
        .answerCallbackQuery({ text: "僅群管理員可以解除禁言。", show_alert: true })
        .catch(() => {});
      return;
    }

    const targetId = Number(ctx.match![1]);
    try {
      await unmuteUser(ctx.api, chat.id, targetId);
      await ctx
        .answerCallbackQuery({ text: "✅ 已解除禁言", show_alert: false })
        .catch(() => {});
      // 拿掉按鈕，避免重複點；失敗（如 not modified）忽略
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await ctx.api
        .sendMessage(
          chat.id,
          `🔓 <a href="tg://user?id=${targetId}">該用戶</a> 已被管理員解除禁言。`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
      await log({
        type: "unmute.done",
        chatId: chat.id,
        userId: targetId,
        payload: { byAdmin: ctx.from.id, via: "button" },
      });
    } catch (err) {
      await ctx
        .answerCallbackQuery({
          text: `解禁失敗：${friendlyRestrictError(errorMessage(err))}`.slice(0, 200),
          show_alert: true,
        })
        .catch(() => {});
      await log({
        type: "unmute.failed",
        chatId: chat.id,
        userId: targetId,
        error: errorMessage(err),
        payload: { byAdmin: ctx.from.id, via: "button" },
      });
    }
  });

  // 入口 2：/unmute 指令
  bot.command("unmute", async (ctx, next) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return next();
    if (!ctx.from) return next();
    if (!(await isAdmin(ctx, chat.id, ctx.from.id))) return next();

    const group = await getGroupByChatId(chat.id);
    if (!group) return next();

    const replyFrom = ctx.message?.reply_to_message?.from;

    // 防呆：回覆到 bot 的訊息（警告訊息是 bot 發的，違規者訊息已被刪，最常見的誤操作）
    if (replyFrom?.is_bot) {
      await ctx
        .reply(
          "⚠️ 你回覆的是 bot 的訊息，不是被禁言的人。\n" +
            "請改用：\n" +
            "1. 點禁言通知上的「🔓 解除禁言」按鈕（最簡單）\n" +
            "2. 回覆「被禁言那個人本人」發過的訊息打 /unmute\n" +
            "3. /unmute <user id>（ID 可在後台 /logs 查到）",
        )
        .catch(() => {});
      return;
    }

    const argId = Number((ctx.match ?? "").trim());
    const targetId =
      replyFrom?.id ?? (Number.isInteger(argId) && argId > 0 ? argId : null);

    if (!targetId) {
      await ctx
        .reply(
          "用法：回覆要解禁者的訊息打 /unmute，或 /unmute <user id>。\n" +
            "也可以直接點禁言通知上的「🔓 解除禁言」按鈕。\n" +
            "（無法用 @用戶名，Telegram 不給 bot 查 username 對應的 id）",
        )
        .catch(() => {});
      return;
    }

    try {
      await unmuteUser(ctx.api, chat.id, targetId);
      const who = replyFrom?.username
        ? `@${replyFrom.username}`
        : `<a href="tg://user?id=${targetId}">該用戶</a>`;
      await ctx
        .reply(`✅ 已解除 ${who} 的禁言，警告計數已清空。`, {
          parse_mode: "HTML",
        })
        .catch(() => {});
      await log({
        type: "unmute.done",
        chatId: chat.id,
        userId: targetId,
        payload: { byAdmin: ctx.from.id, via: "command" },
      });
    } catch (err) {
      await ctx
        .reply(`解禁失敗：${friendlyRestrictError(errorMessage(err))}`)
        .catch(() => {});
      await log({
        type: "unmute.failed",
        chatId: chat.id,
        userId: targetId,
        error: errorMessage(err),
        payload: { byAdmin: ctx.from.id, via: "command" },
      });
    }
  });
}
